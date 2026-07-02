use std::fs::File;
use std::io::{BufWriter, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use mp4::{
    AacConfig, AudioObjectType, AvcConfig, Bytes, ChannelConfig, MediaConfig, Mp4Config, Mp4Sample,
    Mp4Writer, SampleFreqIndex, TrackConfig, TrackType,
};
use webm_iterable::matroska_spec::{BlockLacing, Master, MatroskaSpec, SimpleBlock};
use webm_iterable::{WebmIterator, WebmWriter, WriteOptions};

use crate::api::innertube::download::DownloadContainer;

mod faststart;
mod mp4_demux;

/// Which half of an adaptive pair a track is, used for diagnostics and demuxer selection.
#[derive(Clone, Copy)]
enum TrackKind {
    Video,
    Audio,
}

impl TrackKind {
    fn label(self) -> &'static str {
        match self {
            Self::Video => "video track",
            Self::Audio => "audio track",
        }
    }
}

/// Muxes a downloaded video and audio track into a single output file.
///
/// `output` selects the destination container; `video_container` / `audio_container`
/// describe the real container each downloaded track arrived in (ISO-BMFF or EBML),
/// which can differ from `output` — AV1/HEVC ship as fragmented MP4 yet are written
/// into Matroska next to a WebM/Opus audio track.
pub fn mux_adaptive_tracks(
    output: DownloadContainer,
    video_container: DownloadContainer,
    video_path: &Path,
    audio_container: DownloadContainer,
    audio_path: &Path,
    output_path: &Path,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    match output {
        DownloadContainer::Mp4 => mux_mp4(video_path, audio_path, output_path, cancelled),
        DownloadContainer::Mkv => mux_matroska(
            video_container,
            video_path,
            audio_container,
            audio_path,
            output_path,
            cancelled,
        ),
    }
}

/// Re-wraps a downloaded H.264 video track and AAC audio track — both delivered as
/// fragmented MP4 — into one progressive (non-fragmented) MP4. Sample timing comes
/// from `mp4_demux` (which reads `moof`/`trun`); the `mp4` crate's `Mp4Reader` cannot,
/// and feeding it fragmented input yields a zero-duration, unplayable file.
fn mux_mp4(
    video_path: &Path,
    audio_path: &Path,
    output_path: &Path,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let mut video = mp4_demux::open_progressive(video_path, TrackKind::Video)?;
    let mut audio = mp4_demux::open_progressive(audio_path, TrackKind::Audio)?;
    if !video.is_h264 {
        return Err("The MP4 muxer requires an H.264 video track".to_string());
    }
    if !audio.is_aac {
        return Err("The MP4 muxer requires an AAC audio track".to_string());
    }

    let avcc = video
        .codec_private
        .clone()
        .ok_or_else(|| "The H.264 track is missing its avcC configuration".to_string())?;
    let (sps, pps) = parse_avc_sps_pps(&avcc)?;
    let asc = audio
        .codec_private
        .clone()
        .ok_or_else(|| "The AAC track is missing its AudioSpecificConfig".to_string())?;
    let aac_config = parse_aac_config(&asc, audio.sample_rate, audio.channels)?;

    let video_timescale = video.timescale.max(1);
    let audio_timescale = audio.timescale.max(1);
    let config = Mp4Config {
        major_brand: "isom"
            .parse()
            .map_err(|error| format!("Invalid MP4 brand: {error}"))?,
        minor_version: 512,
        compatible_brands: ["isom", "iso2", "avc1", "mp41"]
            .into_iter()
            .map(|brand| {
                brand
                    .parse()
                    .map_err(|error| format!("Invalid MP4 brand: {error}"))
            })
            .collect::<Result<Vec<_>, _>>()?,
        timescale: video_timescale.max(audio_timescale),
    };
    let output = File::create(output_path)
        .map_err(|error| format!("Could not create MP4 output: {error}"))?;
    let mut writer = Mp4Writer::write_start(BufWriter::new(output), &config)
        .map_err(|error| format!("Could not initialize MP4 muxer: {error}"))?;
    writer
        .add_track(&TrackConfig {
            track_type: TrackType::Video,
            timescale: video_timescale,
            language: "und".to_string(),
            media_conf: MediaConfig::AvcConfig(AvcConfig {
                width: video.width,
                height: video.height,
                seq_param_set: sps,
                pic_param_set: pps,
            }),
        })
        .map_err(|error| format!("Could not add MP4 video track: {error}"))?;
    writer
        .add_track(&TrackConfig {
            track_type: TrackType::Audio,
            timescale: audio_timescale,
            language: "und".to_string(),
            media_conf: MediaConfig::AacConfig(aac_config),
        })
        .map_err(|error| format!("Could not add MP4 audio track: {error}"))?;

    // Interleave by decode time. Each track's samples are already in decode order;
    // `start_time` is ignored by the writer (it accumulates durations), so the
    // running decode clocks only steer interleaving.
    let mut video_decode: u64 = 0;
    let mut audio_decode: u64 = 0;
    let mut video_index = 0;
    let mut audio_index = 0;
    while video_index < video.samples.len() || audio_index < audio.samples.len() {
        if cancelled.load(Ordering::Relaxed) {
            return Err("Download cancelled".into());
        }
        let take_video = match (
            video_index < video.samples.len(),
            audio_index < audio.samples.len(),
        ) {
            (true, true) => {
                u128::from(video_decode) * u128::from(audio_timescale)
                    <= u128::from(audio_decode) * u128::from(video_timescale)
            }
            (true, false) => true,
            _ => false,
        };
        if take_video {
            let sample = video.samples[video_index];
            let data = video.read_sample(sample)?;
            write_mp4_sample(&mut writer, 1, &sample, data, video_decode)?;
            video_decode += u64::from(sample.duration);
            video_index += 1;
        } else {
            let sample = audio.samples[audio_index];
            let data = audio.read_sample(sample)?;
            write_mp4_sample(&mut writer, 2, &sample, data, audio_decode)?;
            audio_decode += u64::from(sample.duration);
            audio_index += 1;
        }
    }
    writer
        .write_end()
        .map_err(|error| format!("Could not finalize MP4 output: {error}"))?;
    drop(writer);

    if let Err(error) = faststart::faststart_in_place(output_path) {
        tracing::warn!("MP4 faststart skipped: {error}");
    }
    Ok(())
}

fn write_mp4_sample(
    writer: &mut Mp4Writer<BufWriter<File>>,
    track_id: u32,
    sample: &mp4_demux::ProgressiveSample,
    data: Vec<u8>,
    decode_time: u64,
) -> Result<(), String> {
    writer
        .write_sample(
            track_id,
            &Mp4Sample {
                start_time: decode_time,
                duration: sample.duration,
                rendering_offset: sample.composition_offset,
                is_sync: sample.is_sync,
                bytes: Bytes::from(data),
            },
        )
        .map_err(|error| format!("Could not write MP4 sample: {error}"))
}

/// Extracts the first SPS and PPS NAL units from an `avcC` configuration record so the
/// `mp4` writer can rebuild the `avc1` sample entry. Samples stay in their length-prefixed
/// AVCC form (4-byte prefixes), which the writer copies verbatim.
fn parse_avc_sps_pps(avcc: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    if avcc.len() < 6 {
        return Err("H.264 avcC is too short".to_string());
    }
    let mut offset = 6;
    let sps_count = usize::from(avcc[5] & 0x1F);
    let sps = read_param_set(avcc, &mut offset, sps_count)?
        .ok_or_else(|| "H.264 avcC has no SPS".to_string())?;
    let pps_count = usize::from(
        *avcc
            .get(offset)
            .ok_or_else(|| "H.264 avcC is missing its PPS count".to_string())?,
    );
    offset += 1;
    let pps = read_param_set(avcc, &mut offset, pps_count)?
        .ok_or_else(|| "H.264 avcC has no PPS".to_string())?;
    Ok((sps, pps))
}

/// Reads `count` length-prefixed parameter sets, returning the first one.
fn read_param_set(
    data: &[u8],
    offset: &mut usize,
    count: usize,
) -> Result<Option<Vec<u8>>, String> {
    let mut first = None;
    for _ in 0..count {
        let length = data
            .get(*offset..*offset + 2)
            .map(|bytes| usize::from(u16::from_be_bytes([bytes[0], bytes[1]])))
            .ok_or_else(|| "H.264 avcC parameter set is truncated".to_string())?;
        *offset += 2;
        let nal = data
            .get(*offset..*offset + length)
            .ok_or_else(|| "H.264 avcC parameter set is truncated".to_string())?;
        if first.is_none() {
            first = Some(nal.to_vec());
        }
        *offset += length;
    }
    Ok(first)
}

/// Builds an [`AacConfig`] from a raw `AudioSpecificConfig`, falling back to the sample
/// entry's rate/channel count when the config uses escape values.
fn parse_aac_config(asc: &[u8], sample_rate: u32, channels: u16) -> Result<AacConfig, String> {
    if asc.len() < 2 {
        return Err("AAC AudioSpecificConfig is too short".to_string());
    }
    let object_type = (asc[0] >> 3) & 0x1F;
    let freq_index_raw = ((asc[0] & 0x07) << 1) | (asc[1] >> 7);
    let chan_conf_raw = (asc[1] >> 3) & 0x0F;

    let profile = AudioObjectType::try_from(object_type)
        .map_err(|_| format!("Unsupported AAC object type {object_type}"))?;
    let freq_index = SampleFreqIndex::try_from(freq_index_raw)
        .or_else(|_| freq_index_for_rate(sample_rate))
        .map_err(|()| "Unsupported AAC sample rate".to_string())?;
    let chan_conf = ChannelConfig::try_from(if chan_conf_raw == 0 {
        u8::try_from(channels).unwrap_or(2).max(1)
    } else {
        chan_conf_raw
    })
    .map_err(|_| "Unsupported AAC channel configuration".to_string())?;

    Ok(AacConfig {
        bitrate: 0,
        profile,
        freq_index,
        chan_conf,
    })
}

fn freq_index_for_rate(rate: u32) -> Result<SampleFreqIndex, ()> {
    match rate {
        96000 => Ok(SampleFreqIndex::Freq96000),
        88200 => Ok(SampleFreqIndex::Freq88200),
        64000 => Ok(SampleFreqIndex::Freq64000),
        48000 => Ok(SampleFreqIndex::Freq48000),
        44100 => Ok(SampleFreqIndex::Freq44100),
        32000 => Ok(SampleFreqIndex::Freq32000),
        24000 => Ok(SampleFreqIndex::Freq24000),
        22050 => Ok(SampleFreqIndex::Freq22050),
        16000 => Ok(SampleFreqIndex::Freq16000),
        12000 => Ok(SampleFreqIndex::Freq12000),
        11025 => Ok(SampleFreqIndex::Freq11025),
        8000 => Ok(SampleFreqIndex::Freq8000),
        7350 => Ok(SampleFreqIndex::Freq7350),
        _ => Err(()),
    }
}

/// A single coded frame, normalized so video (`WebM` or fragmented MP4) and audio
/// (`WebM`) tracks interleave through one Matroska writer.
#[derive(Clone)]
struct MatroskaPacket {
    timestamp_ns: i128,
    data: Vec<u8>,
    lacing: Option<BlockLacing>,
    invisible: bool,
    discardable: bool,
    keyframe: bool,
}

/// A demuxed track that yields [`MatroskaPacket`]s regardless of its source container.
/// The `WebM` iterator carries large internal buffers, so it is boxed to keep the
/// two variants similarly sized.
enum PacketSource {
    Webm(Box<MatroskaTrack>),
    Mp4(mp4_demux::SampleReader),
}

impl PacketSource {
    fn next_packet(&mut self) -> Result<Option<MatroskaPacket>, String> {
        match self {
            Self::Webm(track) => track.next_packet(),
            Self::Mp4(reader) => reader.next_packet(),
        }
    }
}

fn open_track_source(
    container: DownloadContainer,
    path: &Path,
    output_track: u64,
    kind: TrackKind,
) -> Result<(MatroskaSpec, PacketSource), String> {
    match container {
        DownloadContainer::Mkv => {
            let (entry, source_track) =
                read_matroska_track_entry(path, output_track, kind.label())?;
            let track = MatroskaTrack::open(path, source_track, kind.label())?;
            Ok((entry, PacketSource::Webm(Box::new(track))))
        }
        DownloadContainer::Mp4 => {
            let (entry, reader) = mp4_demux::open(path, output_track, kind)?;
            Ok((entry, PacketSource::Mp4(reader)))
        }
    }
}

struct MatroskaTrack {
    iterator: WebmIterator<File>,
    track_number: u64,
    timestamp_scale: u64,
    cluster_timestamp: i64,
    source_label: &'static str,
    source_path: PathBuf,
}

impl MatroskaTrack {
    fn open(path: &Path, track_number: u64, source_label: &'static str) -> Result<Self, String> {
        let file = File::open(path).map_err(|error| {
            format!(
                "Could not open Matroska {source_label} `{}`: {error}",
                path.display()
            )
        })?;
        Ok(Self {
            iterator: WebmIterator::new(file, &[]),
            track_number,
            timestamp_scale: 1_000_000,
            cluster_timestamp: 0,
            source_label,
            source_path: path.to_path_buf(),
        })
    }

    fn next_packet(&mut self) -> Result<Option<MatroskaPacket>, String> {
        for tag in self.iterator.by_ref() {
            let tag = tag.map_err(|error| {
                format!(
                    "Invalid Matroska {} packet stream in `{}`: {error}",
                    self.source_label,
                    self.source_path.display()
                )
            })?;
            match tag {
                MatroskaSpec::TimestampScale(scale) => self.timestamp_scale = scale.max(1),
                MatroskaSpec::Timestamp(timestamp) => {
                    self.cluster_timestamp = i64::try_from(timestamp)
                        .map_err(|_| "Matroska cluster timestamp is too large".to_string())?;
                }
                MatroskaSpec::SimpleBlock(data) => {
                    let block = SimpleBlock::try_from(data.as_slice())
                        .map_err(|error| format!("Invalid Matroska block: {error}"))?;
                    if block.track != self.track_number {
                        continue;
                    }
                    let absolute_ticks =
                        i128::from(self.cluster_timestamp) + i128::from(block.timestamp);
                    return Ok(Some(MatroskaPacket {
                        timestamp_ns: absolute_ticks * i128::from(self.timestamp_scale),
                        data: block.raw_frame_data().to_vec(),
                        lacing: block.lacing,
                        invisible: block.invisible,
                        discardable: block.discardable,
                        keyframe: block.keyframe,
                    }));
                }
                _ => {}
            }
        }
        Ok(None)
    }
}

#[allow(clippy::too_many_lines)] // Mirrors the ordered EBML header, track, cluster, and finalization pipeline.
fn mux_matroska(
    video_container: DownloadContainer,
    video_path: &Path,
    audio_container: DownloadContainer,
    audio_path: &Path,
    output_path: &Path,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let (video_entry, mut video) =
        open_track_source(video_container, video_path, 1, TrackKind::Video)?;
    let (audio_entry, mut audio) =
        open_track_source(audio_container, audio_path, 2, TrackKind::Audio)?;
    let output = File::create(output_path)
        .map_err(|error| format!("Could not create Matroska output: {error}"))?;
    let mut writer = WebmWriter::new(BufWriter::new(output));

    writer
        .write(&MatroskaSpec::Ebml(Master::Full(vec![
            MatroskaSpec::EbmlVersion(1),
            MatroskaSpec::EbmlReadVersion(1),
            MatroskaSpec::EbmlMaxIdLength(4),
            MatroskaSpec::EbmlMaxSizeLength(8),
            MatroskaSpec::DocType("matroska".to_string()),
            MatroskaSpec::DocTypeVersion(4),
            MatroskaSpec::DocTypeReadVersion(2),
        ])))
        .map_err(|error| format!("Could not write Matroska header: {error}"))?;
    writer
        .write_advanced(
            &MatroskaSpec::Segment(Master::Start),
            WriteOptions::is_unknown_sized_element(),
        )
        .map_err(|error| format!("Could not start Matroska segment: {error}"))?;
    writer
        .write(&MatroskaSpec::Info(Master::Full(vec![
            MatroskaSpec::TimestampScale(1_000_000),
            MatroskaSpec::MuxingApp("Flow Desktop".to_string()),
            MatroskaSpec::WritingApp("Flow Desktop".to_string()),
        ])))
        .map_err(|error| format!("Could not write Matroska info: {error}"))?;
    writer
        .write(&MatroskaSpec::Tracks(Master::Full(vec![
            video_entry,
            audio_entry,
        ])))
        .map_err(|error| format!("Could not write Matroska tracks: {error}"))?;

    let mut video_packet = video.next_packet()?;
    let mut audio_packet = audio.next_packet()?;
    let mut cluster_start_ms: Option<i64> = None;
    while video_packet.is_some() || audio_packet.is_some() {
        if cancelled.load(Ordering::Relaxed) {
            return Err("Download cancelled".into());
        }
        let take_video = match (&video_packet, &audio_packet) {
            (Some(video), Some(audio)) => video.timestamp_ns <= audio.timestamp_ns,
            (Some(_), None) => true,
            _ => false,
        };
        let (packet, output_track) = if take_video {
            (video_packet.take().expect("video packet is present"), 1)
        } else {
            (audio_packet.take().expect("audio packet is present"), 2)
        };
        let timestamp_ms = i64::try_from(packet.timestamp_ns / 1_000_000)
            .map_err(|_| "Matroska timestamp is outside the supported range".to_string())?
            .max(0);
        let should_rotate = match cluster_start_ms {
            None => true,
            Some(start) => {
                let relative = timestamp_ms - start;
                relative > i64::from(i16::MAX)
                    || (output_track == 1 && packet.keyframe && relative >= 5_000)
            }
        };
        if should_rotate {
            if cluster_start_ms.is_some() {
                writer
                    .write(&MatroskaSpec::Cluster(Master::End))
                    .map_err(|error| format!("Could not finish Matroska cluster: {error}"))?;
            }
            cluster_start_ms = Some(timestamp_ms);
            writer
                .write(&MatroskaSpec::Cluster(Master::Start))
                .map_err(|error| format!("Could not start Matroska cluster: {error}"))?;
            let timestamp = u64::try_from(timestamp_ms)
                .map_err(|_| "Matroska cluster timestamp cannot be negative".to_string())?;
            writer
                .write(&MatroskaSpec::Timestamp(timestamp))
                .map_err(|error| format!("Could not write Matroska cluster timestamp: {error}"))?;
        }
        let relative = timestamp_ms - cluster_start_ms.unwrap_or(timestamp_ms);
        let relative = i16::try_from(relative)
            .map_err(|_| "Matroska block timestamp exceeded its cluster range".to_string())?;
        let block = SimpleBlock::new_uncheked(
            packet.data.as_slice(),
            output_track,
            relative,
            packet.invisible,
            packet.lacing,
            packet.discardable,
            packet.keyframe,
        );
        writer
            .write(&MatroskaSpec::from(block))
            .map_err(|error| format!("Could not write Matroska block: {error}"))?;
        if take_video {
            video_packet = video.next_packet()?;
        } else {
            audio_packet = audio.next_packet()?;
        }
    }
    if cluster_start_ms.is_some() {
        writer
            .write(&MatroskaSpec::Cluster(Master::End))
            .map_err(|error| format!("Could not finish Matroska cluster: {error}"))?;
    }
    writer
        .write(&MatroskaSpec::Segment(Master::End))
        .map_err(|error| format!("Could not finish Matroska segment: {error}"))?;
    writer
        .into_inner()
        .map_err(|error| format!("Could not flush Matroska output: {error}"))?;
    Ok(())
}

fn read_matroska_track_entry(
    path: &Path,
    output_track: u64,
    source_label: &'static str,
) -> Result<(MatroskaSpec, u64), String> {
    let diagnostics = media_file_diagnostics(path);
    let file = File::open(path).map_err(|error| {
        format!(
            "Could not open Matroska {source_label} `{}`: {error}",
            path.display()
        )
    })?;
    let iterator = WebmIterator::new(file, &[MatroskaSpec::TrackEntry(Master::Start)]);
    for tag in iterator {
        let tag = tag.map_err(|error| {
            format!(
                "Invalid Matroska {source_label} metadata in `{}` ({diagnostics}): {error}",
                path.display()
            )
        })?;
        let MatroskaSpec::TrackEntry(Master::Full(mut children)) = tag else {
            continue;
        };
        let source_track = children.iter().find_map(|child| match child {
            MatroskaSpec::TrackNumber(number) => Some(*number),
            _ => None,
        });
        let track_type = children.iter().find_map(|child| match child {
            MatroskaSpec::TrackType(value) => Some(*value),
            _ => None,
        });
        let wanted_type = if output_track == 1 { 1 } else { 2 };
        if track_type != Some(wanted_type) {
            continue;
        }
        for child in &mut children {
            match child {
                MatroskaSpec::TrackNumber(number) | MatroskaSpec::TrackUID(number) => {
                    *number = output_track;
                }
                _ => {}
            }
        }
        return Ok((
            MatroskaSpec::TrackEntry(Master::Full(children)),
            source_track.unwrap_or(1),
        ));
    }
    Err(if output_track == 1 {
        "The source WebM does not contain a video track".to_string()
    } else {
        "The source WebM does not contain an audio track".to_string()
    })
}

fn media_file_diagnostics(path: &Path) -> String {
    let size = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);
    let mut prefix = [0_u8; 32];
    let read = File::open(path)
        .and_then(|mut file| file.read(&mut prefix))
        .unwrap_or(0);
    let prefix = prefix[..read]
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ");
    format!("size={size} bytes, first {read} bytes=[{prefix}]")
}

#[cfg(test)]
mod tests {
    use super::{parse_aac_config, parse_avc_sps_pps};
    use mp4::{AudioObjectType, ChannelConfig, SampleFreqIndex};

    #[test]
    fn extracts_sps_and_pps_from_avcc() {
        // version, profile/compat/level, lengthSize, numSPS=1, [len=2]{67 42}, numPPS=1, [len=2]{68 ce}
        let avcc = [
            1, 0x64, 0x00, 0x1f, 0xff, 0xe1, 0x00, 0x02, 0x67, 0x42, 0x01, 0x00, 0x02, 0x68, 0xce,
        ];
        let (sps, pps) = parse_avc_sps_pps(&avcc).expect("avcC parses");
        assert_eq!(sps, vec![0x67, 0x42]);
        assert_eq!(pps, vec![0x68, 0xce]);
    }

    #[test]
    fn reads_aac_lc_stereo_44100_config() {
        // AAC-LC (objectType 2), samplingFrequencyIndex 4 (44100), channelConfig 2.
        let config = parse_aac_config(&[0x12, 0x10], 44100, 2).expect("ASC parses");
        assert_eq!(config.profile, AudioObjectType::AacLowComplexity);
        assert_eq!(config.freq_index, SampleFreqIndex::Freq44100);
        assert_eq!(config.chan_conf, ChannelConfig::Stereo);
    }
}
