//! Renderer → domain parsing library for YouTube Music.
//!
//! Each tricky rule lives in exactly one place: the `videoId` fallback chain,
//! artist/byline splitting, the largest-thumbnail picker, the dual continuation
//! token format, and `pageType` dispatch. Extractors compose these helpers and
//! never walk raw JSON themselves.

pub mod continuation;
pub mod endpoint;
pub mod items;
pub mod runs;
pub mod shelves;
pub mod thumbnail;
