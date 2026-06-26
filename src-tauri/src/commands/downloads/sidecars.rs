//! Best-effort companion files written next to a finished download: the poster
//! image (both kinds), `SponsorBlock` segments for video, and lyrics for music.

use std::path::{Path, PathBuf};
use std::time::Duration;

use tauri::{AppHandle, Manager};

use super::{DownloadMediaKind, ProgressEmitter};
use crate::commands::youtube::fetch_sponsorblock_segments;
use crate::services::music_service::MusicService;

const IMAGE_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

pub async fn write_sidecars(
    app: &AppHandle,
    media_kind: DownloadMediaKind,
    media_path: &Path,
    video_id: Option<&str>,
    thumbnail_url: Option<&str>,
    emitter: &ProgressEmitter,
) {
    if let Some(url) = thumbnail_url.map(str::trim).filter(|url| !url.is_empty()) {
        match download_poster(media_path, url).await {
            Ok(path) => emitter.log(format!("Saved poster image to `{}`", path.display())),
            Err(error) => emitter.log(format!("Could not save the poster image: {error}")),
        }
    }

    let Some(video_id) = video_id.map(str::trim).filter(|id| !id.is_empty()) else {
        return;
    };

    match media_kind {
        DownloadMediaKind::Video => match write_sponsorblock(media_path, video_id).await {
            Ok(Some(path)) => {
                emitter.log(format!(
                    "Saved SponsorBlock segments to `{}`",
                    path.display()
                ));
            }
            Ok(None) => {}
            Err(error) => emitter.log(format!("Could not save SponsorBlock segments: {error}")),
        },
        DownloadMediaKind::Music | DownloadMediaKind::Audio => {
            match write_lyrics(app, media_path, video_id).await {
                Ok(Some(path)) => emitter.log(format!("Saved lyrics to `{}`", path.display())),
                Ok(None) => {}
                Err(error) => emitter.log(format!("Could not save lyrics: {error}")),
            }
        }
    }
}

async fn download_poster(media_path: &Path, url: &str) -> Result<PathBuf, String> {
    let client = reqwest::Client::builder()
        .user_agent(IMAGE_USER_AGENT)
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("client error: {error}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("image server returned {}", response.status()));
    }
    let extension = poster_extension(&response, url);
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("could not read image: {error}"))?;
    if bytes.is_empty() {
        return Err("image was empty".to_string());
    }
    let path = media_path.with_extension(extension);
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|error| format!("could not write image: {error}"))?;
    Ok(path)
}

fn poster_extension(response: &reqwest::Response, url: &str) -> &'static str {
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let url_extension = url
        .split('?')
        .next()
        .unwrap_or(url)
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if content_type.contains("png") || url_extension == "png" {
        "png"
    } else if content_type.contains("webp") || url_extension == "webp" {
        "webp"
    } else {
        "jpg"
    }
}

async fn write_sponsorblock(media_path: &Path, video_id: &str) -> Result<Option<PathBuf>, String> {
    let segments = fetch_sponsorblock_segments(video_id, None)
        .await
        .map_err(|error| error.to_string())?;
    if segments.as_array().is_none_or(Vec::is_empty) {
        return Ok(None);
    }
    let body = serde_json::to_vec_pretty(&segments).map_err(|error| error.to_string())?;
    let path = media_path.with_extension("sponsorblock.json");
    tokio::fs::write(&path, body)
        .await
        .map_err(|error| format!("could not write segments: {error}"))?;
    Ok(Some(path))
}

async fn write_lyrics(
    app: &AppHandle,
    media_path: &Path,
    video_id: &str,
) -> Result<Option<PathBuf>, String> {
    let Some(music) = app.try_state::<MusicService>() else {
        return Err("music service is unavailable".to_string());
    };
    let lyrics = music
        .lyrics(video_id)
        .await
        .map_err(|error| error.to_string())?;
    let Some(text) = lyrics.filter(|text| !text.trim().is_empty()) else {
        return Ok(None);
    };
    let path = media_path.with_extension("lrc");
    tokio::fs::write(&path, text.as_bytes())
        .await
        .map_err(|error| format!("could not write lyrics: {error}"))?;
    Ok(Some(path))
}
