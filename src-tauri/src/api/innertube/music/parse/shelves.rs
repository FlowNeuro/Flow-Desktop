//! Shelf / section / grid walking → [`MusicShelf`] + item collection.

use serde_json::Value;

use super::endpoint::{browse_id, browse_params};
use super::items::parse_yt_item;
use super::runs::{first_run, runs_text};
use crate::models::music::YTItem;
use crate::models::music_pages::MusicShelf;
use crate::models::video::MusicHomeChip;

/// The section-list contents of a browse response, handling the three layouts
/// (single-column tabs, bare `sectionListRenderer`, two-column secondary).
#[must_use]
pub fn section_list_contents(res: &Value) -> Vec<Value> {
    let contents = &res["contents"];

    if let Some(arr) = contents["sectionListRenderer"]["contents"].as_array() {
        return arr.clone();
    }
    if let Some(tabs) = contents["singleColumnBrowseResultsRenderer"]["tabs"].as_array() {
        if let Some(arr) = tabs
            .first()
            .and_then(|t| t["tabRenderer"]["content"]["sectionListRenderer"]["contents"].as_array())
        {
            return arr.clone();
        }
    }
    if let Some(arr) = contents["twoColumnBrowseResultsRenderer"]["secondaryContents"]
        ["sectionListRenderer"]["contents"]
        .as_array()
    {
        return arr.clone();
    }
    Vec::new()
}

/// Map an array of item wrappers (`musicResponsiveListItemRenderer` /
/// `musicTwoRowItemRenderer`) into typed items, skipping unparseable entries.
#[must_use]
pub fn collect_items(contents: &Value) -> Vec<YTItem> {
    contents
        .as_array()
        .map(|arr| arr.iter().filter_map(parse_yt_item).collect())
        .unwrap_or_default()
}

/// Parse one section node into a [`MusicShelf`] (carousel, music shelf, or grid).
#[must_use]
pub fn parse_section(section: &Value) -> Option<MusicShelf> {
    if let Some(carousel) = section.get("musicCarouselShelfRenderer") {
        return parse_carousel(carousel);
    }
    if let Some(carousel) = section.get("musicImmersiveCarouselShelfRenderer") {
        return parse_carousel(carousel);
    }
    if let Some(shelf) = section.get("musicShelfRenderer") {
        return parse_music_shelf(shelf);
    }
    if let Some(shelf) = section.get("musicPlaylistShelfRenderer") {
        return parse_music_shelf(shelf);
    }
    if let Some(grid) = section.get("gridRenderer") {
        return parse_grid(grid);
    }
    None
}

fn parse_carousel(carousel: &Value) -> Option<MusicShelf> {
    let header = &carousel["header"]["musicCarouselShelfBasicHeaderRenderer"];
    let title = runs_text(&header["title"]).unwrap_or_else(|| "Featured".to_string());
    let subtitle = runs_text(&header["strapline"]);
    let more = &header["moreContentButton"]["buttonRenderer"]["navigationEndpoint"];
    let items = collect_items(&carousel["contents"]);
    if items.is_empty() {
        return None;
    }
    Some(MusicShelf {
        title,
        subtitle,
        browse_id: browse_id(more),
        params: browse_params(more),
        items,
    })
}

fn parse_music_shelf(shelf: &Value) -> Option<MusicShelf> {
    let title = runs_text(&shelf["title"]).unwrap_or_default();
    let items = collect_items(&shelf["contents"]);
    if items.is_empty() {
        return None;
    }
    let more = &shelf["bottomEndpoint"];
    Some(MusicShelf {
        title,
        subtitle: None,
        browse_id: browse_id(more),
        params: browse_params(more),
        items,
    })
}

fn parse_grid(grid: &Value) -> Option<MusicShelf> {
    let title = runs_text(&grid["header"]["gridHeaderRenderer"]["title"]).unwrap_or_default();
    let items = collect_items(&grid["items"]);
    if items.is_empty() {
        return None;
    }
    Some(MusicShelf {
        title,
        subtitle: None,
        browse_id: None,
        params: None,
        items,
    })
}

/// Parse a chip-cloud header into navigation chips.
#[must_use]
pub fn parse_chips(res: &Value) -> Vec<MusicHomeChip> {
    let arr = res["header"]["chipCloudRenderer"]["chips"]
        .as_array()
        .or_else(|| {
            res["contents"]["singleColumnBrowseResultsRenderer"]["tabs"][0]["tabRenderer"]
                ["content"]["sectionListRenderer"]["header"]["chipCloudRenderer"]["chips"]
                .as_array()
        });

    let Some(arr) = arr else {
        return Vec::new();
    };

    arr.iter()
        .enumerate()
        .filter_map(|(idx, item)| {
            let chip = &item["chipCloudChipRenderer"];
            let title = first_run(&chip["text"])?;
            if title.is_empty() {
                return None;
            }
            Some(MusicHomeChip {
                title,
                browse_id: browse_id(&chip["navigationEndpoint"]),
                params: browse_params(&chip["navigationEndpoint"]),
                order_by: i32::try_from(idx).unwrap_or(0),
            })
        })
        .collect()
}
