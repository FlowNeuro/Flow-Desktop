// Local DASH manifest generation for a SABR session.

use super::engine::SabrTiming;
use super::selector::SelectedFormats;

fn extract_codecs(mime_type: &str, fallback: &str) -> String {
    mime_type
        .split(';')
        .find_map(|part| {
            part.trim()
                .strip_prefix("codecs=")
                .map(|v| v.trim_matches('"').to_string())
        })
        .filter(|v| !v.is_empty())
        .map(|c| if c == "vp9" { "vp09.00.10.08".to_string() } else { c })
        .unwrap_or_else(|| fallback.to_string())
}

fn base_mime(mime_type: &str, fallback: &str) -> String {
    mime_type
        .split(';')
        .next()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn duration_iso8601(duration_ms: u64) -> String {
    let total_seconds = duration_ms / 1000;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    let millis = duration_ms % 1000;
    let mut out = String::from("PT");
    if hours > 0 {
        out.push_str(&format!("{hours}H"));
    }
    if minutes > 0 {
        out.push_str(&format!("{minutes}M"));
    }
    if millis > 0 {
        out.push_str(&format!("{seconds}.{millis:03}S"));
    } else {
        out.push_str(&format!("{seconds}S"));
    }
    out
}

pub fn build_dash_manifest(base: &str, selected: &SelectedFormats, timing: &SabrTiming) -> String {
    let audio = &selected.audio;
    let video = &selected.video;

    let audio_mime = base_mime(&audio.mime_type, "audio/mp4");
    let audio_codecs = extract_codecs(&audio.mime_type, "mp4a.40.2");
    let video_mime = base_mime(&video.mime_type, "video/mp4");
    let video_codecs = extract_codecs(&video.mime_type, "avc1.640028");

    let audio_seg_ms = timing.audio_segment_duration_ms.max(1000);
    let video_seg_ms = timing.video_segment_duration_ms.max(1000);

    let mut m = String::new();
    m.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    m.push_str(&format!(
        "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" \
profiles=\"urn:mpeg:dash:profile:isoff-live:2011\" minBufferTime=\"PT2S\" \
mediaPresentationDuration=\"{}\">\n",
        duration_iso8601(timing.duration_ms)
    ));
    m.push_str("  <Period id=\"flow-sabr-0\" start=\"PT0S\">\n");

    m.push_str(&format!(
        "    <AdaptationSet id=\"audio\" contentType=\"audio\" mimeType=\"{audio_mime}\" \
startWithSAP=\"1\" subsegmentAlignment=\"true\">\n"
    ));
    m.push_str(&format!(
        "      <Representation id=\"audio\" codecs=\"{audio_codecs}\" bandwidth=\"{}\" audioSamplingRate=\"48000\">\n",
        audio.bitrate.max(96_000)
    ));
    m.push_str("        <AudioChannelConfiguration schemeIdUri=\"urn:mpeg:dash:23003:3:audio_channel_configuration:2011\" value=\"2\" />\n");
    m.push_str(&format!(
        "        <SegmentTemplate timescale=\"1000\" duration=\"{audio_seg_ms}\" startNumber=\"0\" \
initialization=\"{base}/audio/init\" media=\"{base}/audio/seg/$Number$\" />\n"
    ));
    m.push_str("      </Representation>\n");
    m.push_str("    </AdaptationSet>\n");

    m.push_str(&format!(
        "    <AdaptationSet id=\"video\" contentType=\"video\" mimeType=\"{video_mime}\" \
startWithSAP=\"1\" subsegmentAlignment=\"true\">\n"
    ));
    m.push_str(&format!(
        "      <Representation id=\"video\" codecs=\"{video_codecs}\" bandwidth=\"{}\" width=\"{}\" height=\"{}\" frameRate=\"{}\">\n",
        video.bitrate.max(500_000),
        video.width.max(1),
        video.height.max(1),
        video.fps.max(24)
    ));
    m.push_str(&format!(
        "        <SegmentTemplate timescale=\"1000\" duration=\"{video_seg_ms}\" startNumber=\"0\" \
initialization=\"{base}/video/init\" media=\"{base}/video/seg/$Number$\" />\n"
    ));
    m.push_str("      </Representation>\n");
    m.push_str("    </AdaptationSet>\n");

    m.push_str("  </Period>\n");
    m.push_str("</MPD>\n");
    m
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::streaming::sabr::selector::SabrFormat;

    fn fixture() -> (SelectedFormats, SabrTiming) {
        (
            SelectedFormats {
                audio: SabrFormat {
                    itag: 251,
                    last_modified: 1,
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
                    last_modified: 1,
                    xtags: None,
                    mime_type: "video/mp4; codecs=\"avc1.640028\"".into(),
                    bitrate: 4_000_000,
                    width: 1920,
                    height: 1080,
                    fps: 30,
                    approx_duration_ms: 0,
                    is_audio: false,
                },
            },
            SabrTiming {
                duration_ms: 213_000,
                audio_segment_count: 42,
                video_segment_count: 42,
                audio_segment_duration_ms: 5000,
                video_segment_duration_ms: 5000,
            },
        )
    }

    #[test]
    fn manifest_has_both_tracks_and_local_urls() {
        let (selected, timing) = fixture();
        let xml = build_dash_manifest("http://127.0.0.1:9000/sabr/s1", &selected, &timing);
        assert!(xml.contains("contentType=\"audio\""));
        assert!(xml.contains("contentType=\"video\""));
        assert!(xml.contains("http://127.0.0.1:9000/sabr/s1/audio/init"));
        assert!(xml.contains("http://127.0.0.1:9000/sabr/s1/video/seg/$Number$"));
        assert!(xml.contains("codecs=\"opus\""));
        assert!(xml.contains("codecs=\"avc1.640028\""));
        assert!(xml.contains("mediaPresentationDuration=\"PT3M33S\""));
    }

    #[test]
    fn vp9_codec_normalized() {
        let (mut selected, timing) = fixture();
        selected.video.mime_type = "video/webm; codecs=\"vp9\"".into();
        let xml = build_dash_manifest("http://x/sabr/s1", &selected, &timing);
        assert!(xml.contains("vp09.00.10.08"));
    }

    #[test]
    fn iso8601_duration() {
        assert_eq!(duration_iso8601(0), "PT0S");
        assert_eq!(duration_iso8601(5000), "PT5S");
        assert_eq!(duration_iso8601(65_000), "PT1M5S");
        assert_eq!(duration_iso8601(3_661_500), "PT1H1M1.500S");
    }
}
