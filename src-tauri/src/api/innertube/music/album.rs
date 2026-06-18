//! Album page extractor: header (title/artists/year/description/counts) + the
//! full track list, with continuation paging.

use serde_json::Value;

use super::parse::items::album_track;
use super::parse::runs::{parse_artists_and_year, runs_text};
use super::parse::thumbnail::thumbnail_url;
use super::parse::{continuation, shelves};
use crate::api::innertube::InnertubeClient;
use crate::errors::AppResult;
use crate::models::music::{Album, AlbumItem, SongItem};
use crate::models::music_pages::AlbumPage;

impl InnertubeClient {
    /// Fetch an album page by its browse id (`MPRE…`).
    pub(crate) async fn music_album_page(&self, browse_id: &str) -> AppResult<AlbumPage> {
        let visitor = self.music_visitor_data().await;
        let res = self
            .music_browse(Some(browse_id), None, None, visitor.as_deref())
            .await?;

        let header = find_album_header(&res);
        let title = runs_text(&header["title"]).unwrap_or_default();
        let thumbnail = thumbnail_url(header);

        let (mut artists, mut year) = parse_artists_and_year(&header["straplineTextOne"]);
        if artists.is_empty() {
            let (a, y) = parse_artists_and_year(&header["subtitle"]);
            artists = a;
            year = year.or(y);
        }

        let description =
            runs_text(&header["description"]["musicDescriptionShelfRenderer"]["description"]);
        let second = runs_text(&header["secondSubtitle"]);
        let (song_count, duration_text) = parse_count_and_duration(second.as_deref());

        let album_ref = Album {
            name: title.clone(),
            id: browse_id.to_string(),
        };
        let (songs, continuation_token) = collect_album_tracks(&res, &album_ref);

        let album = AlbumItem {
            browse_id: browse_id.to_string(),
            playlist_id: extract_album_playlist_id(&res, header),
            title,
            artists: (!artists.is_empty()).then_some(artists),
            year,
            thumbnail: thumbnail.unwrap_or_default(),
            explicit: false,
        };

        Ok(AlbumPage {
            album,
            description,
            song_count,
            duration_text,
            songs,
            continuation: continuation_token,
        })
    }

    /// Continue an album's track list.
    pub(crate) async fn music_album_continuation(
        &self,
        token: &str,
    ) -> AppResult<(Vec<SongItem>, Option<String>)> {
        let visitor = self.music_visitor_data().await;
        let res = self
            .music_browse(None, None, Some(token), visitor.as_deref())
            .await?;
        let shelf = &res["continuationContents"]["musicPlaylistShelfContinuation"];
        let mut songs = Vec::new();
        if let Some(arr) = shelf["contents"].as_array() {
            for item in arr {
                if let Some(s) = album_track(&item["musicResponsiveListItemRenderer"], None) {
                    songs.push(s);
                }
            }
        }
        let next = continuation::any(shelf, &shelf["contents"]);
        Ok((songs, next))
    }
}

/// Locate the album header renderer across the known layouts.
fn find_album_header(res: &Value) -> &Value {
    let two_col = &res["contents"]["twoColumnBrowseResultsRenderer"]["tabs"][0]["tabRenderer"]["content"]
        ["sectionListRenderer"]["contents"][0]["musicResponsiveHeaderRenderer"];
    if !two_col.is_null() {
        return two_col;
    }
    let responsive = &res["header"]["musicResponsiveHeaderRenderer"];
    if !responsive.is_null() {
        return responsive;
    }
    &res["header"]["musicDetailHeaderRenderer"]
}

/// Collect album tracks from either the two-column secondary contents or the
/// single-column section list.
fn collect_album_tracks(res: &Value, album: &Album) -> (Vec<SongItem>, Option<String>) {
    let mut songs = Vec::new();
    let mut cont = None;

    let mut sections: Vec<Value> = shelves::section_list_contents(res);
    if let Some(arr) = res["contents"]["twoColumnBrowseResultsRenderer"]["secondaryContents"]
        ["sectionListRenderer"]["contents"]
        .as_array()
    {
        sections.extend(arr.iter().cloned());
    }

    for section in &sections {
        let shelf = if !section["musicShelfRenderer"].is_null() {
            &section["musicShelfRenderer"]
        } else if !section["musicPlaylistShelfRenderer"].is_null() {
            &section["musicPlaylistShelfRenderer"]
        } else {
            continue;
        };
        if let Some(arr) = shelf["contents"].as_array() {
            for item in arr {
                if let Some(s) = album_track(&item["musicResponsiveListItemRenderer"], Some(album))
                {
                    songs.push(s);
                }
            }
        }
        if cont.is_none() {
            cont = continuation::any(shelf, &shelf["contents"]);
        }
    }

    (songs, cont)
}

/// Album playlist id from microformat `urlCanonical` (`?list=…`) or the header
/// play button's watch-playlist endpoint.
fn extract_album_playlist_id(res: &Value, header: &Value) -> String {
    if let Some(url) = res["microformat"]["microformatDataRenderer"]["urlCanonical"].as_str() {
        if let Some(idx) = url.rfind("list=") {
            return url[idx + 5..].to_string();
        }
    }
    header["buttons"]
        .as_array()
        .and_then(|btns| {
            btns.iter().find_map(|b| {
                b["musicPlayButtonRenderer"]["playNavigationEndpoint"]["watchEndpoint"]
                    ["playlistId"]
                    .as_str()
            })
        })
        .unwrap_or_default()
        .to_string()
}

/// Parse "N songs • X minutes" style text into (count, duration text).
fn parse_count_and_duration(second: Option<&str>) -> (Option<u32>, Option<String>) {
    let Some(text) = second else {
        return (None, None);
    };
    let mut count = None;
    let mut duration = None;
    for part in text.split('•') {
        let p = part.trim();
        let lower = p.to_ascii_lowercase();
        if lower.contains("song") || lower.contains("track") {
            count = p
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == ',')
                .filter(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u32>()
                .ok();
        } else if lower.contains("minute") || lower.contains("hour") || lower.contains("second") {
            duration = Some(p.to_string());
        }
    }
    (count, duration)
}
