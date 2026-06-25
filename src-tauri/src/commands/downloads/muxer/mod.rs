use std::fs::File;
use std::io::{BufWriter, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use mp4::{
    AacConfig, AvcConfig, MediaConfig, MediaType, Mp4Config, Mp4Reader, Mp4Sample, Mp4Writer,
    TrackConfig, TrackType,
};
use webm_iterable::matroska_spec::{BlockLacing, Master, MatroskaSpec, SimpleBlock};
use webm_iterable::{WebmIterator, WebmWriter, WriteOptions};

use crate::api::innertube::download::DownloadContainer;

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

fn mux_mp4(
    video_path: &Path,
    audio_path: &Path,
    output_path: &Path,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let video_file =
        File::open(video_path).map_err(|error| format!("Could not open video track: {error}"))?;
    let audio_file =
        File::open(audio_path).map_err(|error| format!("Could not open audio track: {error}"))?;
    let video_size = video_file
        .metadata()
        .map_err(|error| format!("Could not inspect video track: {error}"))?
        .len();
    let audio_size = audio_file
        .metadata()
        .map_err(|error| format!("Could not inspect audio track: {error}"))?
        .len();
    let mut video_reader = Mp4Reader::read_header(video_file, video_size)
        .map_err(|error| format!("Invalid MP4 video track: {error}"))?;
    let mut audio_reader = Mp4Reader::read_header(audio_file, audio_size)
        .map_err(|error| format!("Invalid MP4 audio track: {error}"))?;

    let video_track_id = find_mp4_track(&video_reader, TrackType::Video)?;
    let audio_track_id = find_mp4_track(&audio_reader, TrackType::Audio)?;
    let video_config = mp4_track_config(&video_reader, video_track_id)?;
    let audio_config = mp4_track_config(&audio_reader, audio_track_id)?;
    let movie_timescale = video_reader
        .timescale()
        .max(audio_reader.timescale())
        .max(1);
    let config = Mp4Config {
        major_brand: "isom"
            .parse()
            .map_err(|error| format!("Invalid MP4 brand: {error}"))?,
        minor_version: 512,
        compatible_brands: ["isom", "iso2", "mp41"]
            .into_iter()
            .map(|brand| {
                brand
                    .parse()
                    .map_err(|error| format!("Invalid MP4 brand: {error}"))
            })
            .collect::<Result<Vec<_>, _>>()?,
        timescale: movie_timescale,
    };
    let output = File::create(output_path)
        .map_err(|error| format!("Could not create MP4 output: {error}"))?;
    let mut writer = Mp4Writer::write_start(BufWriter::new(output), &config)
        .map_err(|error| format!("Could not initialize MP4 muxer: {error}"))?;
    writer
        .add_track(&video_config)
        .map_err(|error| format!("Could not add MP4 video track: {error}"))?;
    writer
        .add_track(&audio_config)
        .map_err(|error| format!("Could not add MP4 audio track: {error}"))?;

    let video_count = video_reader
        .sample_count(video_track_id)
        .map_err(|error| format!("Could not read MP4 video sample count: {error}"))?;
    let audio_count = audio_reader
        .sample_count(audio_track_id)
        .map_err(|error| format!("Could not read MP4 audio sample count: {error}"))?;
    let video_timescale = u64::from(video_config.timescale.max(1));
    let audio_timescale = u64::from(audio_config.timescale.max(1));
    let mut video_index = 1;
    let mut audio_index = 1;
    let mut video_sample = read_mp4_sample(&mut video_reader, video_track_id, video_index)?;
    let mut audio_sample = read_mp4_sample(&mut audio_reader, audio_track_id, audio_index)?;

    while video_sample.is_some() || audio_sample.is_some() {
        if cancelled.load(Ordering::Relaxed) {
            return Err("Download cancelled".into());
        }
        let take_video = match (&video_sample, &audio_sample) {
            (Some(video), Some(audio)) => {
                u128::from(video.start_time) * u128::from(audio_timescale)
                    <= u128::from(audio.start_time) * u128::from(video_timescale)
            }
            (Some(_), None) => true,
            _ => false,
        };
        if take_video {
            writer
                .write_sample(1, video_sample.as_ref().expect("video sample is present"))
                .map_err(|error| format!("Could not write MP4 video sample: {error}"))?;
            video_index += 1;
            video_sample = if video_index <= video_count {
                read_mp4_sample(&mut video_reader, video_track_id, video_index)?
            } else {
                None
            };
        } else {
            writer
                .write_sample(2, audio_sample.as_ref().expect("audio sample is present"))
                .map_err(|error| format!("Could not write MP4 audio sample: {error}"))?;
            audio_index += 1;
            audio_sample = if audio_index <= audio_count {
                read_mp4_sample(&mut audio_reader, audio_track_id, audio_index)?
            } else {
                None
            };
        }
    }
    writer
        .write_end()
        .map_err(|error| format!("Could not finalize MP4 output: {error}"))
}

fn find_mp4_track<R: std::io::Read + std::io::Seek>(
    reader: &Mp4Reader<R>,
    wanted: TrackType,
) -> Result<u32, String> {
    reader
        .tracks()
        .iter()
        .find_map(|(id, track)| (track.track_type().ok() == Some(wanted)).then_some(*id))
        .ok_or_else(|| format!("The source MP4 does not contain a {wanted:?} track"))
}

fn mp4_track_config<R: std::io::Read + std::io::Seek>(
    reader: &Mp4Reader<R>,
    track_id: u32,
) -> Result<TrackConfig, String> {
    let track = reader
        .tracks()
        .get(&track_id)
        .ok_or_else(|| "MP4 track disappeared while preparing the muxer".to_string())?;
    let media_conf = match track
        .media_type()
        .map_err(|error| format!("Unsupported MP4 track: {error}"))?
    {
        MediaType::H264 => MediaConfig::AvcConfig(AvcConfig {
            width: track.width(),
            height: track.height(),
            seq_param_set: track
                .sequence_parameter_set()
                .map_err(|error| format!("Missing H.264 sequence parameters: {error}"))?
                .to_vec(),
            pic_param_set: track
                .picture_parameter_set()
                .map_err(|error| format!("Missing H.264 picture parameters: {error}"))?
                .to_vec(),
        }),
        MediaType::AAC => MediaConfig::AacConfig(AacConfig {
            bitrate: track.bitrate(),
            profile: track
                .audio_profile()
                .map_err(|error| format!("Missing AAC profile: {error}"))?,
            freq_index: track
                .sample_freq_index()
                .map_err(|error| format!("Missing AAC sample frequency: {error}"))?,
            chan_conf: track
                .channel_config()
                .map_err(|error| format!("Missing AAC channel configuration: {error}"))?,
        }),
        media => return Err(format!("Unsupported MP4 media type: {media:?}")),
    };
    Ok(TrackConfig {
        track_type: track
            .track_type()
            .map_err(|error| format!("Invalid MP4 track type: {error}"))?,
        timescale: track.timescale(),
        language: track.language().to_string(),
        media_conf,
    })
}

fn read_mp4_sample<R: std::io::Read + std::io::Seek>(
    reader: &mut Mp4Reader<R>,
    track_id: u32,
    sample_id: u32,
) -> Result<Option<Mp4Sample>, String> {
    reader
        .read_sample(track_id, sample_id)
        .map_err(|error| format!("Could not read MP4 sample {sample_id}: {error}"))
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
            let (entry, source_track) = read_matroska_track_entry(path, output_track, kind.label())?;
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
    let (video_entry, mut video) = open_track_source(video_container, video_path, 1, TrackKind::Video)?;
    let (audio_entry, mut audio) = open_track_source(audio_container, audio_path, 2, TrackKind::Audio)?;
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
