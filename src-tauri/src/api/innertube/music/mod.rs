//! Self-contained YouTube Music subsystem.
//!
//! This module is **additive** — it has its own HTTP layer ([`client`]),
//! client profiles ([`clients`]), constants ([`endpoints`]), parser library
//! ([`parse`]), and a multi-client stream resolver ([`playback`]). It reuses
//! only the shared `reqwest::Client` on [`crate::api::innertube::InnertubeClient`]
//! and the streaming proxy; it never modifies the video extraction path
//! (`core::http`, `extractors::player`).
//!
//! All methods are inherent `impl InnertubeClient` blocks split by domain.

pub mod album;
pub mod artist;
pub mod browse;
pub mod client;
pub mod clients;
pub mod endpoints;
pub mod parse;
pub mod playback;
pub mod playlist;
pub mod search;
pub mod watch;
