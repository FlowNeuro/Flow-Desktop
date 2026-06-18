//! Item renderers → [`YTItem`].
//!
//! Handles `musicResponsiveListItemRenderer` (list rows),
//! `musicTwoRowItemRenderer` (carousel/grid cards), and the
//! `musicCardShelfRenderer` "top result" card. Type dispatch is by `pageType`
//! with the **episode-before-song** ordering Metrolist marks as critical.

use serde_json::Value;

use super::endpoint::{browse_id, has_explicit, music_video_type, page_type, video_id};
use super::runs::{flex_text, parse_artists_and_year, parse_song_meta, runs_text};
use super::thumbnail::thumbnail_url;
use crate::api::innertube::music::endpoints;
use crate::models::music::{
    Album, AlbumItem, Artist, ArtistItem, EpisodeItem, PlaylistItem, PodcastItem, SongItem, YTItem,
};

/// Dispatch any carousel/list item wrapper to a [`YTItem`].
#[must_use]
pub fn parse_yt_item(item: &Value) -> Option<YTItem> {
    if let Some(r) = item.get("musicResponsiveListItemRenderer") {
        return parse_responsive_list_item(r);
    }
    if let Some(r) = item.get("musicTwoRowItemRenderer") {
        return parse_two_row_item(r);
    }
    None
}

fn song_from_responsive(r: &Value, title: String, thumbnail: Option<String>) -> Option<YTItem> {
    let vid = video_id(r)?;
    let (artists, album, duration) = parse_song_meta(r);
    let mvt = music_video_type(&r["flexColumns"][0]["musicResponsiveListItemFlexColumnRenderer"]
        ["text"]["runs"][0]["navigationEndpoint"])
        .or_else(|| music_video_type(&r["navigationEndpoint"]));
    Some(YTItem::Song(SongItem {
        id: vid.clone(),
        title,
        artists,
        album,
        duration,
        music_video_type: mvt,
        thumbnail: thumbnail.unwrap_or_default(),
        explicit: has_explicit(r),
        video_id: Some(vid),
        playlist_id: r["navigationEndpoint"]["watchEndpoint"]["playlistId"]
            .as_str()
            .map(ToOwned::to_owned),
        params: None,
    }))
}

/// Parse a `musicResponsiveListItemRenderer` row.
#[must_use]
pub fn parse_responsive_list_item(r: &Value) -> Option<YTItem> {
    let title = flex_text(r, 0)?;
    let thumbnail = thumbnail_url(r);
    let nav = &r["navigationEndpoint"];

    match page_type(nav) {
        Some(pt) if pt.contains("NON_MUSIC_AUDIO_TRACK") => {
            // Episode
            let id = video_id(r).or_else(|| browse_id(nav))?;
            Some(YTItem::Episode(EpisodeItem {
                id,
                title,
                author: parse_song_meta(r).0.into_iter().next(),
                thumbnail: thumbnail.unwrap_or_default(),
                explicit: has_explicit(r),
                publish_date_text: flex_text(r, 1),
            }))
        }
        Some(pt) if pt.contains("ARTIST") || pt.contains("USER_CHANNEL") => {
            let id = browse_id(nav)?;
            Some(YTItem::Artist(ArtistItem {
                id: id.clone(),
                title,
                thumbnail,
                channel_id: Some(id),
            }))
        }
        Some(pt) if pt.contains("ALBUM") || pt.contains("AUDIOBOOK") => {
            let browse = browse_id(nav).unwrap_or_default();
            let (artists, year) = parse_artists_and_year(
                &r["flexColumns"][1]["musicResponsiveListItemFlexColumnRenderer"]["text"],
            );
            Some(YTItem::Album(AlbumItem {
                browse_id: browse,
                playlist_id: String::new(),
                title,
                artists: (!artists.is_empty()).then_some(artists),
                year,
                thumbnail: thumbnail.unwrap_or_default(),
                explicit: has_explicit(r),
            }))
        }
        Some(pt) if pt.contains("PODCAST") => {
            let id = browse_id(nav).unwrap_or_default();
            Some(YTItem::Podcast(PodcastItem {
                id,
                title,
                author: parse_song_meta(r).0.into_iter().next(),
                episode_count_text: flex_text(r, 1),
                thumbnail,
            }))
        }
        Some(pt) if pt.contains("PLAYLIST") => {
            let id = endpoints::unvl(&browse_id(nav).unwrap_or_default()).to_string();
            Some(YTItem::Playlist(PlaylistItem {
                id,
                title,
                author: parse_song_meta(r).0.into_iter().next(),
                song_count_text: flex_text(r, 1),
                thumbnail,
            }))
        }
        _ => song_from_responsive(r, title, thumbnail),
    }
}

/// Parse a `musicTwoRowItemRenderer` (carousel/grid card).
#[must_use]
pub fn parse_two_row_item(r: &Value) -> Option<YTItem> {
    let title = runs_text(&r["title"])?;
    let thumbnail = thumbnail_url(r);
    let nav = &r["navigationEndpoint"];
    let subtitle = &r["subtitle"];

    // Watch endpoint present → it's a song/video.
    if let Some(vid) = nav["watchEndpoint"]["videoId"].as_str() {
        let (artists, _year) = parse_artists_and_year(subtitle);
        return Some(YTItem::Song(SongItem {
            id: vid.to_string(),
            title,
            artists,
            album: None,
            duration: None,
            music_video_type: music_video_type(nav),
            thumbnail: thumbnail.unwrap_or_default(),
            explicit: has_explicit(r),
            video_id: Some(vid.to_string()),
            playlist_id: nav["watchEndpoint"]["playlistId"]
                .as_str()
                .map(ToOwned::to_owned),
            params: None,
        }));
    }

    match page_type(nav) {
        Some(pt) if pt.contains("ARTIST") || pt.contains("USER_CHANNEL") => {
            let id = browse_id(nav)?;
            Some(YTItem::Artist(ArtistItem {
                id: id.clone(),
                title,
                thumbnail,
                channel_id: Some(id),
            }))
        }
        Some(pt) if pt.contains("ALBUM") || pt.contains("AUDIOBOOK") => {
            let (artists, year) = parse_artists_and_year(subtitle);
            Some(YTItem::Album(AlbumItem {
                browse_id: browse_id(nav).unwrap_or_default(),
                playlist_id: nav["watchPlaylistEndpoint"]["playlistId"]
                    .as_str()
                    .map(ToOwned::to_owned)
                    .unwrap_or_default(),
                title,
                artists: (!artists.is_empty()).then_some(artists),
                year,
                thumbnail: thumbnail.unwrap_or_default(),
                explicit: has_explicit(r),
            }))
        }
        Some(pt) if pt.contains("PODCAST") => Some(YTItem::Podcast(PodcastItem {
            id: browse_id(nav).unwrap_or_default(),
            title,
            author: parse_artists_and_year(subtitle).0.into_iter().next(),
            episode_count_text: runs_text(subtitle),
            thumbnail,
        })),
        _ => {
            // Default to playlist (two-row playlist/mix cards).
            let id = endpoints::unvl(&browse_id(nav).unwrap_or_default()).to_string();
            if id.is_empty() {
                return None;
            }
            Some(YTItem::Playlist(PlaylistItem {
                id,
                title,
                author: parse_artists_and_year(subtitle).0.into_iter().next(),
                song_count_text: runs_text(subtitle),
                thumbnail,
            }))
        }
    }
}

/// Parse the "top result" `musicCardShelfRenderer` card.
#[must_use]
pub fn parse_card_shelf(card: &Value) -> Option<YTItem> {
    let title = runs_text(&card["title"])?;
    let thumbnail = thumbnail_url(card);
    let on_tap = &card["onTap"];
    let subtitle = &card["subtitle"];

    if let Some(vid) = on_tap["watchEndpoint"]["videoId"].as_str() {
        let (artists, _) = parse_artists_and_year(subtitle);
        return Some(YTItem::Song(SongItem {
            id: vid.to_string(),
            title,
            artists,
            album: None,
            duration: None,
            music_video_type: music_video_type(on_tap),
            thumbnail: thumbnail.unwrap_or_default(),
            explicit: has_explicit(card),
            video_id: Some(vid.to_string()),
            playlist_id: None,
            params: None,
        }));
    }

    match page_type(on_tap) {
        Some(pt) if pt.contains("ARTIST") || pt.contains("USER_CHANNEL") => {
            let id = browse_id(on_tap)?;
            Some(YTItem::Artist(ArtistItem {
                id: id.clone(),
                title,
                thumbnail,
                channel_id: Some(id),
            }))
        }
        Some(pt) if pt.contains("ALBUM") || pt.contains("AUDIOBOOK") => {
            let (artists, year) = parse_artists_and_year(subtitle);
            Some(YTItem::Album(AlbumItem {
                browse_id: browse_id(on_tap).unwrap_or_default(),
                playlist_id: String::new(),
                title,
                artists: (!artists.is_empty()).then_some(artists),
                year,
                thumbnail: thumbnail.unwrap_or_default(),
                explicit: has_explicit(card),
            }))
        }
        Some(pt) if pt.contains("PLAYLIST") => Some(YTItem::Playlist(PlaylistItem {
            id: endpoints::unvl(&browse_id(on_tap).unwrap_or_default()).to_string(),
            title,
            author: None,
            song_count_text: runs_text(subtitle),
            thumbnail,
        })),
        _ => None,
    }
}

/// Album helper used by the album-songs continuation loop.
#[must_use]
pub fn album_track(r: &Value, album: Option<&Album>) -> Option<SongItem> {
    let title = flex_text(r, 0)?;
    let vid = video_id(r)?;
    let (mut artists, parsed_album, duration) = parse_song_meta(r);
    if artists.is_empty() {
        if let Some(a) = album {
            artists.push(Artist {
                name: a.name.clone(),
                id: Some(a.id.clone()),
            });
        }
    }
    Some(SongItem {
        id: vid.clone(),
        title,
        artists,
        album: parsed_album.or_else(|| album.cloned()),
        duration,
        music_video_type: None,
        thumbnail: thumbnail_url(r).unwrap_or_default(),
        explicit: has_explicit(r),
        video_id: Some(vid),
        playlist_id: None,
        params: None,
    })
}
