//! Thumbnail extraction — always picks the **largest** entry (fixes the legacy
//! `thumbnails[0]` smallest-image bug) and tolerates renderer aliases.

use serde_json::Value;

fn normalize(url: &str) -> String {
    if let Some(rest) = url.strip_prefix("//") {
        format!("https://{rest}")
    } else {
        url.to_string()
    }
}

/// Last (highest-resolution) URL in a `thumbnails` array.
fn largest(arr: &Value) -> Option<String> {
    arr.as_array()
        .and_then(|a| a.last())
        .and_then(|t| t["url"].as_str())
        .map(normalize)
}

/// Pull the best thumbnail URL out of any music renderer, trying the known
/// wrapper spellings: `musicThumbnailRenderer`, `croppedSquareThumbnailRenderer`,
/// `musicAnimatedThumbnailRenderer.backupRenderer`, and a plain `thumbnail`.
#[must_use]
pub fn thumbnail_url(renderer: &Value) -> Option<String> {
    let probes = [
        &renderer["thumbnail"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"],
        &renderer["thumbnailRenderer"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"],
        &renderer["thumbnail"]["croppedSquareThumbnailRenderer"]["thumbnail"]["thumbnails"],
        &renderer["thumbnailRenderer"]["croppedSquareThumbnailRenderer"]["thumbnail"]["thumbnails"],
        &renderer["thumbnailRenderer"]["musicAnimatedThumbnailRenderer"]["backupRenderer"]
            ["musicThumbnailRenderer"]["thumbnail"]["thumbnails"],
        &renderer["thumbnail"]["thumbnails"],
        &renderer["background"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"],
        &renderer["foregroundThumbnail"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"],
    ];
    probes.into_iter().find_map(largest)
}

/// Rewrite a YouTube image URL to request a square `size`×`size` crop. Useful
/// for hi-res now-playing art. Falls back to the original URL on unknown shapes.
#[allow(dead_code)]
#[must_use]
pub fn square(url: &str, size: u32) -> String {
    if let Some(idx) = url.rfind("=w") {
        format!("{}=w{size}-h{size}-l90-rj", &url[..idx])
    } else if let Some(idx) = url.rfind("=s") {
        format!("{}=s{size}", &url[..idx])
    } else {
        url.to_string()
    }
}
