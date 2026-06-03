// Codec- and browser-aware SABR format selection.
// Desktop Chromium always supports H.264/AAC/Opus; VP9 and AV1 depend on the
// build. Made for maximum compatibility (MP4/H.264 video, Opus/AAC
// audio) unless the frontend tells us a richer codec is supported and stable.

#[derive(Debug, Clone)]
pub struct SabrFormat {
    pub itag: i32,
    pub last_modified: u64,
    pub xtags: Option<String>,
    pub mime_type: String,
    pub bitrate: u64,
    pub width: u64,
    pub height: u64,
    pub fps: u64,
    pub approx_duration_ms: u64,
    pub is_audio: bool,
}

impl SabrFormat {
    // The container/codec family, used both for selection and DASH codecs.
    pub fn is_webm(&self) -> bool {
        self.mime_type.contains("webm")
    }
    pub fn is_mp4(&self) -> bool {
        self.mime_type.contains("mp4")
    }
    pub fn is_av1(&self) -> bool {
        let m = self.mime_type.to_ascii_lowercase();
        m.contains("av01") || m.contains("av1")
    }
    pub fn is_vp9(&self) -> bool {
        let m = self.mime_type.to_ascii_lowercase();
        m.contains("vp9") || m.contains("vp09")
    }
    pub fn is_h264(&self) -> bool {
        let m = self.mime_type.to_ascii_lowercase();
        m.contains("avc1") || m.contains("avc3") || m.contains("h264")
    }
}

// What the playback surface (browser) can decode. Defaults are the universally
// safe Chromium baseline (H.264 + AAC/Opus); the frontend refines this.
#[derive(Debug, Clone, Copy)]
pub struct CodecSupport {
    pub h264: bool,
    pub vp9: bool,
    pub av1: bool,
    pub allow_webm_video: bool,
}

impl Default for CodecSupport {
    fn default() -> Self {
        Self {
            h264: true,
            vp9: false,
            av1: false,
            allow_webm_video: false,
        }
    }
}

impl CodecSupport {
    fn allows_video(&self, f: &SabrFormat) -> bool {
        if f.is_av1() {
            return self.av1;
        }
        if f.is_vp9() {
            return self.vp9 && (self.allow_webm_video || f.is_mp4());
        }
        if f.is_h264() {
            return self.h264;
        }
        // Unknown codec: only allow if H.264 is the fallback baseline.
        self.h264
    }
}

#[derive(Debug, Clone)]
pub struct SelectedFormats {
    pub audio: SabrFormat,
    pub video: SabrFormat,
}

// Preferred audio itags, best first: Opus/WebM (251/250/249) then AAC (140/141).
const PREFERRED_AUDIO_ITAGS: [i32; 5] = [251, 250, 249, 140, 141];

// Choose the best audio format. Prefers known-good itags, then highest-bitrate
// WebM/Opus, then highest bitrate overall.
pub fn select_audio(formats: &[SabrFormat]) -> Option<&SabrFormat> {
    let audio: Vec<&SabrFormat> = formats.iter().filter(|f| f.is_audio).collect();
    if audio.is_empty() {
        return None;
    }
    for itag in PREFERRED_AUDIO_ITAGS {
        if let Some(f) = audio.iter().copied().find(|f| f.itag == itag) {
            return Some(f);
        }
    }
    if let Some(f) = audio
        .iter()
        .copied()
        .filter(|f| f.is_webm())
        .max_by_key(|f| f.bitrate)
    {
        return Some(f);
    }
    audio.into_iter().max_by_key(|f| f.bitrate)
}

// Choose the best video format under codec constraints and an optional target
// height. `target_height == None` means "auto" (highest supported).
pub fn select_video(
    formats: &[SabrFormat],
    target_height: Option<u64>,
    support: CodecSupport,
) -> Option<&SabrFormat> {
    let mut candidates: Vec<&SabrFormat> = formats
        .iter()
        .filter(|f| !f.is_audio && support.allows_video(f))
        .collect();
    if candidates.is_empty() {
        return None;
    }

    // Codec rank: H.264 (most compatible) > VP9 > AV1, unless caller widened it.
    let codec_rank = |f: &SabrFormat| -> u8 {
        if f.is_h264() {
            0
        } else if f.is_vp9() {
            1
        } else if f.is_av1() {
            2
        } else {
            3
        }
    };

    match target_height {
        None => {
            // Auto: highest resolution, then lowest codec rank, then bitrate.
            candidates.sort_by(|a, b| {
                b.height
                    .cmp(&a.height)
                    .then_with(|| codec_rank(a).cmp(&codec_rank(b)))
                    .then_with(|| b.bitrate.cmp(&a.bitrate))
            });
            candidates.into_iter().next()
        }
        Some(target) => {
            // Nearest height, then codec rank, then bitrate.
            candidates.sort_by(|a, b| {
                let da = a.height.abs_diff(target);
                let db = b.height.abs_diff(target);
                da.cmp(&db)
                    .then_with(|| codec_rank(a).cmp(&codec_rank(b)))
                    .then_with(|| b.bitrate.cmp(&a.bitrate))
            });
            candidates.into_iter().next()
        }
    }
}

// Pick a coherent audio+video pair.
pub fn select_formats(
    formats: &[SabrFormat],
    target_height: Option<u64>,
    support: CodecSupport,
) -> Option<SelectedFormats> {
    let audio = select_audio(formats)?.clone();
    let video = select_video(formats, target_height, support)?.clone();
    Some(SelectedFormats { audio, video })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn audio(itag: i32, mime: &str, bitrate: u64) -> SabrFormat {
        SabrFormat {
            itag,
            last_modified: 1,
            xtags: None,
            mime_type: mime.into(),
            bitrate,
            width: 0,
            height: 0,
            fps: 0,
            approx_duration_ms: 0,
            is_audio: true,
        }
    }
    fn video(itag: i32, mime: &str, height: u64, bitrate: u64) -> SabrFormat {
        SabrFormat {
            itag,
            last_modified: 1,
            xtags: None,
            mime_type: mime.into(),
            bitrate,
            width: height * 16 / 9,
            height,
            fps: 30,
            approx_duration_ms: 0,
            is_audio: false,
        }
    }

    #[test]
    fn prefers_opus_audio() {
        let formats = vec![
            audio(140, "audio/mp4; codecs=\"mp4a.40.2\"", 130_000),
            audio(251, "audio/webm; codecs=\"opus\"", 140_000),
        ];
        assert_eq!(select_audio(&formats).unwrap().itag, 251);
    }

    #[test]
    fn falls_back_to_highest_bitrate_audio() {
        let formats = vec![
            audio(600, "audio/weird", 100_000),
            audio(601, "audio/weird", 200_000),
        ];
        assert_eq!(select_audio(&formats).unwrap().itag, 601);
    }

    #[test]
    fn auto_video_prefers_h264_at_top_res_when_only_h264_supported() {
        let formats = vec![
            video(248, "video/webm; codecs=\"vp9\"", 1080, 3_000_000),
            video(137, "video/mp4; codecs=\"avc1.640028\"", 1080, 4_000_000),
            video(136, "video/mp4; codecs=\"avc1.4d401f\"", 720, 2_000_000),
        ];
        let chosen = select_video(&formats, None, CodecSupport::default()).unwrap();
        assert_eq!(chosen.itag, 137); // vp9 excluded by default support
    }

    #[test]
    fn fixed_height_picks_nearest() {
        let formats = vec![
            video(137, "video/mp4; codecs=\"avc1\"", 1080, 4_000_000),
            video(136, "video/mp4; codecs=\"avc1\"", 720, 2_000_000),
            video(135, "video/mp4; codecs=\"avc1\"", 480, 1_000_000),
        ];
        let chosen = select_video(&formats, Some(700), CodecSupport::default()).unwrap();
        assert_eq!(chosen.height, 720);
    }

    #[test]
    fn vp9_allowed_when_supported_and_webm_enabled() {
        let support = CodecSupport {
            h264: true,
            vp9: true,
            av1: false,
            allow_webm_video: true,
        };
        let formats = vec![
            video(248, "video/webm; codecs=\"vp9\"", 1440, 6_000_000),
            video(137, "video/mp4; codecs=\"avc1\"", 1080, 4_000_000),
        ];
        let chosen = select_video(&formats, None, support).unwrap();
        assert_eq!(chosen.height, 1440); // vp9 now eligible and highest
    }

    #[test]
    fn no_video_when_nothing_supported() {
        let support = CodecSupport {
            h264: false,
            vp9: false,
            av1: false,
            allow_webm_video: false,
        };
        let formats = vec![video(137, "video/mp4; codecs=\"avc1\"", 1080, 4_000_000)];
        assert!(select_video(&formats, None, support).is_none());
    }
}
