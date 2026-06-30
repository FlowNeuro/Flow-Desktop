//! Likes blob normalization: an item synced from another platform (e.g. Android) carries a flatter /
//! differently-keyed `meta`. `likes_to_blob` must still emit the desktop frontend's shape
//! (`{kind,id,likedAt, song|video:{…}}`) so `useLikes` never crashes on a missing nested object.

use flow_desktop_lib::sync::canonical::{Hlc, Like, LikeKind, LikeState};
use flow_desktop_lib::sync::mapping::{likes_to_blob, parse_likes_blob};
use serde_json::Value;

fn like(kind: LikeKind, id: &str, meta: Value) -> Like {
    Like {
        kind,
        id: id.to_string(),
        state: LikeState::Liked,
        updated_at_ms: 1_700_000_000_000,
        hlc: Hlc::new(1_700_000_000_000, 0, "dev-a"),
        meta: Some(meta),
    }
}

#[test]
fn foreign_flat_music_like_gets_a_synthesized_song_object() {
    // An Android-style like: flat fields, no nested `song`.
    let foreign = like(
        LikeKind::Music,
        "song-1",
        serde_json::json!({
            "kind": "music",
            "id": "song-1",
            "likedAt": "2023-11-14T22:13:20.000Z",
            "videoId": "yt-abc",
            "title": "Some Track",
            "artist": "Some Artist",
            "thumbnail": "https://img/x.jpg",
            "duration": 215
        }),
    );

    let blob = likes_to_blob(&[foreign]);
    let arr: Vec<Value> = serde_json::from_str(&blob).unwrap();
    assert_eq!(arr.len(), 1);
    let song = arr[0]
        .get("song")
        .expect("a nested song object is synthesized");
    assert!(song.is_object(), "song must be an object, not absent");
    // songVideoId(song) = song.videoId ?? song.id — must resolve, never undefined.
    assert_eq!(song.get("videoId").and_then(Value::as_str), Some("yt-abc"));
    assert_eq!(song.get("id").and_then(Value::as_str), Some("song-1"));
    assert_eq!(
        song.get("title").and_then(Value::as_str),
        Some("Some Track")
    );
    assert_eq!(song.get("duration").and_then(Value::as_i64), Some(215));
    // artists becomes an array the frontend can map over.
    let artists = song.get("artists").and_then(Value::as_array).unwrap();
    assert_eq!(
        artists[0].get("name").and_then(Value::as_str),
        Some("Some Artist")
    );

    // And it round-trips back through the parser (kind/id/likedAt preserved).
    let reparsed = parse_likes_blob(&blob, "dev-b");
    assert_eq!(reparsed.len(), 1);
    assert_eq!(reparsed[0].id, "song-1");
    assert_eq!(reparsed[0].kind, LikeKind::Music);
}

#[test]
fn desktop_origin_music_like_passes_through_losslessly() {
    // A desktop item already has a well-formed nested `song`; it must be kept verbatim.
    let native = like(
        LikeKind::Music,
        "song-2",
        serde_json::json!({
            "kind": "music",
            "id": "song-2",
            "likedAt": "2023-11-14T22:13:20.000Z",
            "song": {
                "id": "song-2",
                "title": "Native Track",
                "artists": [{ "name": "A", "id": null }],
                "album": null,
                "duration": 100,
                "musicVideoType": null,
                "thumbnail": "t.jpg",
                "explicit": false,
                "videoId": "vid-2",
                "playlistId": null,
                "params": null
            }
        }),
    );

    let blob = likes_to_blob(&[native]);
    let arr: Vec<Value> = serde_json::from_str(&blob).unwrap();
    let song = arr[0].get("song").unwrap();
    assert_eq!(
        song.get("title").and_then(Value::as_str),
        Some("Native Track")
    );
    assert_eq!(song.get("explicit").and_then(Value::as_bool), Some(false));
}

#[test]
fn foreign_flat_video_like_gets_a_synthesized_video_object() {
    let foreign = like(
        LikeKind::Video,
        "vid-1",
        serde_json::json!({
            "kind": "video",
            "id": "vid-1",
            "likedAt": "2023-11-14T22:13:20.000Z",
            "title": "A Video",
            "channelName": "A Channel",
            "thumbnail": "https://img/v.jpg",
            "durationSeconds": 600
        }),
    );

    let blob = likes_to_blob(&[foreign]);
    let arr: Vec<Value> = serde_json::from_str(&blob).unwrap();
    let video = arr[0]
        .get("video")
        .expect("a nested video object is synthesized");
    assert_eq!(video.get("id").and_then(Value::as_str), Some("vid-1"));
    assert_eq!(video.get("title").and_then(Value::as_str), Some("A Video"));
    assert_eq!(
        video.get("channelName").and_then(Value::as_str),
        Some("A Channel")
    );
    assert_eq!(
        video.get("durationSeconds").and_then(Value::as_i64),
        Some(600)
    );
}

fn artist_names(song: &Value) -> Vec<String> {
    song.get("artists")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.get("name").and_then(Value::as_str).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

#[test]
fn nested_song_with_string_array_artists_is_normalized() {
    // A foreign song whose `artists` is an array of plain strings — the frontend maps over
    // `artist.name`, so without normalization every track read as "Unknown Artist".
    let foreign = like(
        LikeKind::Music,
        "song-3",
        serde_json::json!({
            "kind": "music", "id": "song-3", "likedAt": "2023-11-14T22:13:20.000Z",
            "song": { "id": "song-3", "title": "T", "artists": ["STOSLIV", "LOVIXX"] }
        }),
    );
    let blob = likes_to_blob(&[foreign]);
    let arr: Vec<Value> = serde_json::from_str(&blob).unwrap();
    let song = arr[0].get("song").unwrap();
    assert_eq!(artist_names(song), vec!["STOSLIV", "LOVIXX"]);
}

#[test]
fn nested_song_missing_artists_is_filled_from_the_parent_meta() {
    // The nested song carries no artist at all, but the parent like object does (flat `artist`).
    let foreign = like(
        LikeKind::Music,
        "song-4",
        serde_json::json!({
            "kind": "music", "id": "song-4", "likedAt": "2023-11-14T22:13:20.000Z",
            "artist": "Bruno Mars",
            "song": { "id": "song-4", "title": "T", "thumbnail": "t.jpg" }
        }),
    );
    let blob = likes_to_blob(&[foreign]);
    let arr: Vec<Value> = serde_json::from_str(&blob).unwrap();
    let song = arr[0].get("song").unwrap();
    assert_eq!(artist_names(song), vec!["Bruno Mars"]);
    // existing song fields are kept (fill, don't clobber).
    assert_eq!(song.get("title").and_then(Value::as_str), Some("T"));
    assert_eq!(song.get("thumbnail").and_then(Value::as_str), Some("t.jpg"));
}

#[test]
fn artists_from_subtitle_field_are_recovered() {
    // YTM-style flat like with the artist tucked into `subtitle`.
    let foreign = like(
        LikeKind::Music,
        "song-5",
        serde_json::json!({
            "kind": "music", "id": "song-5", "likedAt": "2023-11-14T22:13:20.000Z",
            "title": "Track", "subtitle": "Some Artist", "videoId": "vid-5"
        }),
    );
    let blob = likes_to_blob(&[foreign]);
    let arr: Vec<Value> = serde_json::from_str(&blob).unwrap();
    let song = arr[0].get("song").unwrap();
    assert_eq!(artist_names(song), vec!["Some Artist"]);
}

#[test]
fn a_like_with_no_meta_still_yields_a_valid_item() {
    // `meta: None` (or a non-object meta) must not panic and must still synthesize a usable item.
    let like_no_meta = like(LikeKind::Music, "bare-1", Value::Null);
    let blob = likes_to_blob(&[like_no_meta]);
    let arr: Vec<Value> = serde_json::from_str(&blob).unwrap();
    let item = &arr[0];
    assert_eq!(item.get("kind").and_then(Value::as_str), Some("music"));
    assert_eq!(item.get("id").and_then(Value::as_str), Some("bare-1"));
    assert!(item.get("likedAt").and_then(Value::as_str).is_some());
    let song = item.get("song").expect("song still synthesized");
    // songVideoId falls back to the like id, so it is never empty.
    assert_eq!(song.get("id").and_then(Value::as_str), Some("bare-1"));
}
