// Per-session SABR protocol state: request building + directive application.

use std::collections::{HashMap, HashSet};

use super::messages::{
    BufferedRange, ClientAbrState, ClientInfo, FormatId, SabrContext, StreamerContext, TimeRange,
    VideoPlaybackAbrRequest,
};
use super::selector::SelectedFormats;
use super::ClientProfile;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestMode {
    AudioVideo,
    AudioOnly,
}

// Mutable progress for one track.
#[derive(Debug, Clone)]
pub struct TrackState {
    pub format_id: FormatId,
    pub initialized: bool,
    pub downloaded_ms: i64,
    // Highest completed segment sequence number, or -1 if none yet.
    pub max_segment: i32,
    // Last segment number for the track (0 = unknown), from format init.
    pub end_segment: i64,
    // Total media duration in ms (0 = unknown), from format init.
    pub total_end_ms: i64,
    pub mime_type: String,
}

impl TrackState {
    fn new(format_id: FormatId, mime_type: String) -> Self {
        Self {
            format_id,
            initialized: false,
            downloaded_ms: 0,
            max_segment: -1,
            end_segment: 0,
            total_end_ms: 0,
            mime_type,
        }
    }

    // True once every segment (by count or by time) has been received.
    pub fn is_complete(&self) -> bool {
        if self.end_segment > 0 && i64::from(self.max_segment) >= self.end_segment {
            return true;
        }
        if self.total_end_ms > 0 && self.downloaded_ms >= self.total_end_ms {
            return true;
        }
        false
    }
}

// All mutable SABR protocol state for one engine.
pub struct SabrState {
    // The original streaming URL; `effective_url` may diverge via redirect.
    pub effective_url: String,
    pub request_number: u32,
    pub playhead_ms: i64,
    pub playback_cookie: Option<Vec<u8>>,
    pub backoff_ms: i32,

    pub sabr_contexts: HashMap<i32, Vec<u8>>,
    pub contexts_to_send: HashSet<i32>,
    pub contexts_discard: HashSet<i32>,

    pub audio: TrackState,
    pub video: TrackState,

    pub ustreamer_config: Vec<u8>,
    pub po_token: Option<Vec<u8>>,
    pub client: ClientProfile,
    pub mode: RequestMode,
    pub bandwidth_estimate: i64,
}

impl SabrState {
    pub fn new(
        server_url: String,
        selected: &SelectedFormats,
        ustreamer_config: Vec<u8>,
        po_token: Option<Vec<u8>>,
        client: ClientProfile,
        mode: RequestMode,
    ) -> Self {
        let audio_fid = FormatId::new(
            selected.audio.itag,
            selected.audio.last_modified,
            selected.audio.xtags.clone(),
        );
        let video_fid = FormatId::new(
            selected.video.itag,
            selected.video.last_modified,
            selected.video.xtags.clone(),
        );
        Self {
            effective_url: server_url,
            request_number: 0,
            playhead_ms: 0,
            playback_cookie: None,
            backoff_ms: 0,
            sabr_contexts: HashMap::new(),
            contexts_to_send: HashSet::new(),
            contexts_discard: HashSet::new(),
            audio: TrackState::new(audio_fid, selected.audio.mime_type.clone()),
            video: TrackState::new(video_fid, selected.video.mime_type.clone()),
            ustreamer_config,
            po_token,
            client,
            mode,
            bandwidth_estimate: 5_000_000,
        }
    }

    fn buffered_range_for(&self, track: &TrackState) -> Option<BufferedRange> {
        if track.max_segment < 0 {
            return None;
        }
        Some(BufferedRange {
            format_id: track.format_id.clone(),
            start_time_ms: 0,
            duration_ms: track.downloaded_ms,
            start_segment_index: 0,
            end_segment_index: track.max_segment,
            time_range: Some(TimeRange {
                start_ticks: 0,
                duration_ticks: track.downloaded_ms,
                timescale: 1000,
            }),
        })
    }

    // A buffered range that tells the server "this track is fully buffered" —
    // used to discard video in audio-only mode.
    fn discard_range(track: &TrackState) -> BufferedRange {
        BufferedRange {
            format_id: track.format_id.clone(),
            start_time_ms: 0,
            duration_ms: i64::from(i32::MAX),
            start_segment_index: i32::MAX,
            end_segment_index: i32::MAX,
            time_range: Some(TimeRange {
                start_ticks: 0,
                duration_ticks: i64::from(i32::MAX),
                timescale: 1000,
            }),
        }
    }

    // Build the next `VideoPlaybackAbrRequest` from current state.
    pub fn build_request(&self) -> VideoPlaybackAbrRequest {
        let client_info = ClientInfo {
            device_make: self.client.device_make.clone(),
            device_model: self.client.device_model.clone(),
            client_name: self.client.client_name_id,
            client_version: self.client.client_version.clone(),
            os_name: self.client.os_name.clone(),
            os_version: self.client.os_version.clone(),
        };

        let sabr_contexts: Vec<SabrContext> = self
            .sabr_contexts
            .iter()
            .filter(|(t, _)| {
                self.contexts_to_send.contains(*t) && !self.contexts_discard.contains(*t)
            })
            .map(|(t, v)| SabrContext {
                r#type: *t,
                value: v.clone(),
            })
            .collect();

        let streamer_context = StreamerContext {
            client_info,
            po_token: self.po_token.clone(),
            playback_cookie: self.playback_cookie.clone(),
            sabr_contexts,
            unsent_sabr_contexts: Vec::new(),
        };

        let mut buffered_ranges = Vec::new();
        let mut selected_format_ids = Vec::new();

        match self.mode {
            RequestMode::AudioVideo => {
                selected_format_ids.push(self.video.format_id.clone());
                selected_format_ids.push(self.audio.format_id.clone());
                if let Some(r) = self.buffered_range_for(&self.audio) {
                    buffered_ranges.push(r);
                }
                if let Some(r) = self.buffered_range_for(&self.video) {
                    buffered_ranges.push(r);
                }
            }
            RequestMode::AudioOnly => {
                selected_format_ids.push(self.video.format_id.clone());
                selected_format_ids.push(self.audio.format_id.clone());
                if let Some(r) = self.buffered_range_for(&self.audio) {
                    buffered_ranges.push(r);
                }
                buffered_ranges.push(Self::discard_range(&self.video));
            }
        }

        let client_abr_state = ClientAbrState {
            player_time_ms: self.playhead_ms,
            bandwidth_estimate: self.bandwidth_estimate,
            visibility: 0,
            playback_rate: 1.0,
            player_state: 0,
            client_viewport_width: 1280,
            client_viewport_height: 720,
            enabled_track_types_bitfield: match self.mode {
                RequestMode::AudioVideo => None,
                RequestMode::AudioOnly => Some(1),
            },
            drc_enabled: false,
        };

        VideoPlaybackAbrRequest {
            client_abr_state,
            selected_format_ids,
            buffered_ranges,
            player_time_ms: self.playhead_ms,
            video_playback_ustreamer_config: self.ustreamer_config.clone(),
            preferred_audio_format_ids: vec![self.audio.format_id.clone()],
            preferred_video_format_ids: vec![self.video.format_id.clone()],
            streamer_context,
        }
    }

    // --- directive application ------------------------------------------------

    pub fn apply_next_request_policy(&mut self, backoff_ms: i32, cookie: Option<Vec<u8>>) {
        self.backoff_ms = backoff_ms.max(0);
        if let Some(cookie) = cookie {
            if !cookie.is_empty() {
                self.playback_cookie = Some(cookie);
            }
        }
    }

    pub fn apply_redirect(&mut self, url: String) {
        if !url.is_empty() {
            self.effective_url = url;
        }
    }

    pub fn apply_context_update(
        &mut self,
        ctx_type: i32,
        value: Option<Vec<u8>>,
        send_by_default: bool,
        write_policy: i32,
    ) {
        if let Some(value) = value {
            // write_policy: 2 = KEEP_EXISTING
            let keep_existing = write_policy == 2 && self.sabr_contexts.contains_key(&ctx_type);
            if !keep_existing {
                self.sabr_contexts.insert(ctx_type, value);
            }
        }
        if send_by_default {
            self.contexts_to_send.insert(ctx_type);
        }
        self.contexts_discard.remove(&ctx_type);
    }

    pub fn apply_context_sending_policy(
        &mut self,
        start: &[i32],
        stop: &[i32],
        discard: &[i32],
    ) {
        for t in start {
            self.contexts_to_send.insert(*t);
        }
        for t in stop {
            self.contexts_to_send.remove(t);
        }
        for t in discard {
            self.contexts_discard.insert(*t);
            self.contexts_to_send.remove(t);
            self.sabr_contexts.remove(t);
        }
    }

    // Update a track's completion bounds from FORMAT_INITIALIZATION_METADATA.
    pub fn apply_format_init(&mut self, is_audio: bool, end_time_ms: i64, end_segment: i64) {
        let track = if is_audio { &mut self.audio } else { &mut self.video };
        track.initialized = true;
        if end_time_ms > 0 {
            track.total_end_ms = end_time_ms;
        }
        if end_segment > 0 {
            track.end_segment = end_segment;
        }
    }

    // Record a completed media segment.
    pub fn record_segment(&mut self, is_audio: bool, sequence: i32, start_ms: i64, duration_ms: i64) {
        let track = if is_audio { &mut self.audio } else { &mut self.video };
        if sequence > track.max_segment {
            track.max_segment = sequence;
        }
        let seg_end = start_ms + duration_ms;
        if seg_end > track.downloaded_ms {
            track.downloaded_ms = seg_end;
        }
    }

    pub fn both_complete(&self) -> bool {
        match self.mode {
            RequestMode::AudioVideo => self.audio.is_complete() && self.video.is_complete(),
            RequestMode::AudioOnly => self.audio.is_complete(),
        }
    }

    // Seek: reset progress so the next request starts fetching at `target_ms`.
    pub fn seek_to(&mut self, target_ms: i64) {
        self.playhead_ms = target_ms.max(0);
        self.audio.max_segment = -1;
        self.video.max_segment = -1;
        self.audio.downloaded_ms = target_ms;
        self.video.downloaded_ms = target_ms;
        self.request_number = self.request_number.saturating_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::streaming::sabr::pb::PbReader;
    use crate::streaming::sabr::selector::SabrFormat;

    fn selected() -> SelectedFormats {
        SelectedFormats {
            audio: SabrFormat {
                itag: 251,
                last_modified: 100,
                xtags: None,
                mime_type: "audio/webm; codecs=\"opus\"".into(),
                bitrate: 140_000,
                width: 0,
                height: 0,
                fps: 0,
                approx_duration_ms: 0,
                is_audio: true,
            },
            video: SabrFormat {
                itag: 137,
                last_modified: 200,
                xtags: None,
                mime_type: "video/mp4; codecs=\"avc1.640028\"".into(),
                bitrate: 4_000_000,
                width: 1920,
                height: 1080,
                fps: 30,
                approx_duration_ms: 0,
                is_audio: false,
            },
        }
    }

    fn count_top_fields(encoded: &[u8]) -> std::collections::HashMap<u32, usize> {
        let mut r = PbReader::new(encoded);
        let mut counts = std::collections::HashMap::new();
        while let Some(f) = r.next_field() {
            *counts.entry(f.number).or_insert(0) += 1;
        }
        counts
    }

    #[test]
    fn initial_request_has_no_buffered_ranges() {
        let state = SabrState::new(
            "https://example/sabr".into(),
            &selected(),
            vec![1, 2, 3],
            Some(vec![9]),
            ClientProfile::ios(),
            RequestMode::AudioVideo,
        );
        let encoded = state.build_request().encode();
        let counts = count_top_fields(&encoded);
        assert_eq!(counts.get(&3).copied().unwrap_or(0), 0, "no buffered_ranges initially");
        assert_eq!(counts.get(&2).copied().unwrap_or(0), 2, "two selected formats");
        assert!(counts.contains_key(&5), "ustreamer config present");
        assert!(counts.contains_key(&19), "streamer context present");
    }

    #[test]
    fn followup_reports_buffered_ranges() {
        let mut state = SabrState::new(
            "https://example/sabr".into(),
            &selected(),
            vec![],
            None,
            ClientProfile::ios(),
            RequestMode::AudioVideo,
        );
        state.record_segment(true, 0, 0, 5000);
        state.record_segment(false, 0, 0, 5000);
        let encoded = state.build_request().encode();
        let counts = count_top_fields(&encoded);
        assert_eq!(counts.get(&3).copied().unwrap_or(0), 2, "two buffered ranges");
    }

    #[test]
    fn audio_only_discards_video() {
        let mut state = SabrState::new(
            "https://example/sabr".into(),
            &selected(),
            vec![],
            None,
            ClientProfile::ios(),
            RequestMode::AudioOnly,
        );
        state.record_segment(true, 0, 0, 5000);
        let req = state.build_request();
        // audio range + discard video range = 2 ranges
        assert_eq!(req.buffered_ranges.len(), 2);
        assert_eq!(req.client_abr_state.enabled_track_types_bitfield, Some(1));
    }

    #[test]
    fn completion_by_segment_count() {
        let mut state = SabrState::new(
            "u".into(),
            &selected(),
            vec![],
            None,
            ClientProfile::ios(),
            RequestMode::AudioOnly,
        );
        state.apply_format_init(true, 60_000, 5);
        assert!(!state.audio.is_complete());
        state.record_segment(true, 5, 55_000, 5000);
        assert!(state.audio.is_complete());
        assert!(state.both_complete());
    }

    #[test]
    fn context_lifecycle() {
        let mut state = SabrState::new(
            "u".into(),
            &selected(),
            vec![],
            None,
            ClientProfile::ios(),
            RequestMode::AudioVideo,
        );
        state.apply_context_update(7, Some(vec![1, 2]), true, 1);
        assert!(state.contexts_to_send.contains(&7));
        // Sending policy discards it.
        state.apply_context_sending_policy(&[], &[], &[7]);
        assert!(!state.contexts_to_send.contains(&7));
        assert!(state.contexts_discard.contains(&7));
        assert!(!state.sabr_contexts.contains_key(&7));
    }

    #[test]
    fn redirect_updates_url() {
        let mut state = SabrState::new(
            "https://a/sabr".into(),
            &selected(),
            vec![],
            None,
            ClientProfile::ios(),
            RequestMode::AudioVideo,
        );
        state.apply_redirect("https://b/sabr".into());
        assert_eq!(state.effective_url, "https://b/sabr");
    }
}
