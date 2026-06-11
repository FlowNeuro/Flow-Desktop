//! Music playlist page extractor: header + tracks + continuation paging.

use serde_json::Value;

use super::endpoints;
use super::parse::items::parse_responsive_list_item;
use super::parse::runs::{parse_artists_and_year, runs_text};
use super::parse::thumbnail::thumbnail_url;
use super::parse::{continuation, shelves};
use crate::api::innertube::InnertubeClient;
use crate::errors::AppResult;
use crate::models::music::{SongItem, YTItem};
use crate::models::music_pages::MusicPlaylistPage;

impl InnertubeClient {
    /// Fetch a music playlist by its id (with or without the `VL` prefix).
    pub(crate) async fn music_playlist_page(
        &self,
        playlist_id: &str,
    ) -> AppResult<MusicPlaylistPage> {
        let visitor = self.music_visitor_data().await;
        let browse = endpoints::vl(playlist_id);
        let res = self
            .music_browse(Some(&browse), None, None, visitor.as_deref())
            .await?;

        let header = find_playlist_header(&res);
        let title = runs_text(&header["title"]).unwrap_or_default();
        let thumbnail = thumbnail_url(header);
        let description = runs_text(
            &header["description"]["musicDescriptionShelfRenderer"]["description"],
        )
        .or_else(|| runs_text(&header["description"]));
        let author = parse_artists_and_year(&header["straplineTextOne"])
            .0
            .into_iter()
            .next()
            .or_else(|| parse_artists_and_year(&header["subtitle"]).0.into_iter().next());
        let song_count_text =
            runs_text(&header["secondSubtitle"]).or_else(|| runs_text(&header["subtitle"]));

        let (songs, continuation_token) = collect_playlist_tracks(&res);

        Ok(MusicPlaylistPage {
            id: endpoints::unvl(&browse).to_string(),
            title,
            author,
            song_count_text,
            thumbnail,
            description,
            songs,
            continuation: continuation_token,
        })
    }

    /// Continue a playlist's track list.
    pub(crate) async fn music_playlist_continuation(
        &self,
        token: &str,
    ) -> AppResult<(Vec<SongItem>, Option<String>)> {
        let visitor = self.music_visitor_data().await;
        let res = self.music_browse(None, None, Some(token), visitor.as_deref()).await?;
        let shelf = if !res["continuationContents"]["musicPlaylistShelfContinuation"].is_null() {
            &res["continuationContents"]["musicPlaylistShelfContinuation"]
        } else {
            &res["continuationContents"]["musicShelfContinuation"]
        };
        let mut songs = Vec::new();
        if let Some(arr) = shelf["contents"].as_array() {
            for item in arr {
                if let Some(YTItem::Song(s)) =
                    parse_responsive_list_item(&item["musicResponsiveListItemRenderer"])
                {
                    songs.push(s);
                }
            }
        }
        let next = continuation::any(shelf, &shelf["contents"]);
        Ok((songs, next))
    }
}

fn find_playlist_header(res: &Value) -> &Value {
    for key in [
        "musicResponsiveHeaderRenderer",
        "musicEditablePlaylistDetailHeaderRenderer",
        "musicDetailHeaderRenderer",
    ] {
        let node = &res["header"][key];
        if !node.is_null() {
            return node;
        }
        // two-column layout nests the header in the first section
        let two_col = &res["contents"]["twoColumnBrowseResultsRenderer"]["tabs"][0]["tabRenderer"]
            ["content"]["sectionListRenderer"]["contents"][0][key];
        if !two_col.is_null() {
            return two_col;
        }
    }
    &res["header"]["musicResponsiveHeaderRenderer"]
}

fn collect_playlist_tracks(res: &Value) -> (Vec<SongItem>, Option<String>) {
    let mut songs = Vec::new();
    let mut cont = None;

    let mut sections = shelves::section_list_contents(res);
    if let Some(arr) = res["contents"]["twoColumnBrowseResultsRenderer"]["secondaryContents"]
        ["sectionListRenderer"]["contents"]
        .as_array()
    {
        sections.extend(arr.iter().cloned());
    }

    for section in &sections {
        let shelf = if !section["musicPlaylistShelfRenderer"].is_null() {
            &section["musicPlaylistShelfRenderer"]
        } else if !section["musicShelfRenderer"].is_null() {
            &section["musicShelfRenderer"]
        } else {
            continue;
        };
        if let Some(arr) = shelf["contents"].as_array() {
            for item in arr {
                if let Some(YTItem::Song(s)) =
                    parse_responsive_list_item(&item["musicResponsiveListItemRenderer"])
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
