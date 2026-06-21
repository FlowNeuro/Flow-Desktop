use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;

use futures_util::future::join_all;

use crate::api::innertube::extractors::shorts::encode_reel_seed_params;
use crate::errors::AppResult;
use crate::models::channel::ChannelItem;
use crate::models::search::SearchVideosRequest;
use crate::models::shorts::{ShortItem, ShortsFeed};
use crate::models::video::VideoSummary;
use crate::services::recommendation_service::RecommendationService;
use crate::services::youtube_service::YoutubeService;

/// Channel "Shorts" tab browse params — the videos-tab token with `videos`
/// swapped for `shorts` (`EgZ2aWRlb3PyBgQKAjoA` → `EgZzaG9ydHPyBgQKAjoA`).
const SHORTS_TAB_PARAMS: &str = "EgZzaG9ydHPyBgQKAjoA";

/// Shorts handed back per page.
const PAGE_SIZE: usize = 12;
/// Refill the buffer once it drops below this so swiping never blocks on the network.
const BUFFER_LOW_WATERMARK: usize = 15;
/// Topic-discovery searches per gather (each is one engine-generated query).
const MAX_DISCOVERY_QUERIES: usize = 3;
/// Results kept from each discovery search.
const SHORTS_PER_SEARCH: usize = 12;
/// Subscribed channels probed for fresh Shorts per gather.
const MAX_SUB_CHANNELS: usize = 6;
/// Upper bound (seconds) for a discovery-search result to count as a Short.
const SHORTS_DISCOVERY_MAX_DURATION: u64 = 180;
/// Session de-dup memory cap (prevents re-showing within a session).
const MAX_RECENTLY_SHOWN: usize = 300;

/// Which sources a single gather pass should draw from.
struct GatherSpec {
    reel_params: Option<String>,
    reel_sequence_params: Option<String>,
    include_discovery: bool,
    include_subs: bool,
}

impl GatherSpec {
    /// Personalised home feed: reel feed + topic discovery + subscription Shorts.
    fn home() -> Self {
        Self {
            reel_params: None,
            reel_sequence_params: None,
            include_discovery: true,
            include_subs: true,
        }
    }

    /// Collaborative "more like this" sequence seeded from a specific video.
    fn seeded(video_id: &str) -> Self {
        Self {
            reel_params: Some(encode_reel_seed_params(video_id)),
            reel_sequence_params: None,
            include_discovery: false,
            include_subs: false,
        }
    }

    /// Next page: continue the reel sequence and refresh topic discovery.
    fn continuation(token: Option<String>) -> Self {
        Self {
            reel_params: None,
            reel_sequence_params: token,
            include_discovery: true,
            include_subs: false,
        }
    }
}

/// Builds and serves the personalised Shorts feed. Candidates come from three
/// sources (reel sequence, topic discovery, subscription Shorts), then are ranked
/// by the shared `RecommendationService` — the same brain as the video feed,
/// which is where blocked topics, watched penalties and channel/topic diversity
/// get enforced. Ranked overflow is buffered so `load_more` serves instantly.
pub struct ShortsService {
    recently_shown: Mutex<HashSet<String>>,
    buffer: Mutex<VecDeque<ShortItem>>,
    last_continuation: Mutex<Option<String>>,
}

impl ShortsService {
    #[must_use]
    pub fn new() -> Self {
        Self {
            recently_shown: Mutex::new(HashSet::new()),
            buffer: Mutex::new(VecDeque::new()),
            last_continuation: Mutex::new(None),
        }
    }

    /// Open (or re-open) the feed. A `seed_video_id` switches to a collaborative
    /// sequence anchored on that video; otherwise the personalised home feed is built.
    pub async fn get_feed(
        &self,
        yt: &YoutubeService,
        rec: &RecommendationService,
        seed_video_id: Option<String>,
        user_subs: Vec<String>,
        region: Option<String>,
    ) -> AppResult<ShortsFeed> {
        let spec = match seed_video_id.as_deref() {
            Some(seed) if !seed.is_empty() => GatherSpec::seeded(seed),
            _ => GatherSpec::home(),
        };

        let (items, continuation) = self
            .gather_and_rank(yt, rec, &spec, &user_subs, region)
            .await?;

        self.last_continuation
            .lock()
            .unwrap()
            .clone_from(&continuation);

        let mut deque: VecDeque<ShortItem> = items.into();
        let page = drain(&mut deque, PAGE_SIZE);
        *self.buffer.lock().unwrap() = deque;

        Ok(ShortsFeed {
            items: page,
            continuation,
        })
    }

    /// Serve the next page from the prefetch buffer, refilling once it runs low so
    /// swiping never waits on the network.
    pub async fn load_more(
        &self,
        yt: &YoutubeService,
        rec: &RecommendationService,
        continuation: Option<String>,
        user_subs: Vec<String>,
        region: Option<String>,
    ) -> AppResult<ShortsFeed> {
        if continuation.is_some() {
            *self.last_continuation.lock().unwrap() = continuation;
        }

        let mut page = drain(&mut self.buffer.lock().unwrap(), PAGE_SIZE);

        if self.buffer.lock().unwrap().len() < BUFFER_LOW_WATERMARK {
            let token = self.last_continuation.lock().unwrap().clone();
            let spec = GatherSpec::continuation(token);
            if let Ok((items, new_continuation)) =
                self.gather_and_rank(yt, rec, &spec, &user_subs, region).await
            {
                if new_continuation.is_some() {
                    *self.last_continuation.lock().unwrap() = new_continuation;
                }
                self.buffer.lock().unwrap().extend(items);
            }
        }

        if page.is_empty() {
            page = drain(&mut self.buffer.lock().unwrap(), PAGE_SIZE);
        }

        Ok(ShortsFeed {
            items: page,
            continuation: self.last_continuation.lock().unwrap().clone(),
        })
    }

    /// Drop session state so the next `get_feed` starts fresh.
    pub fn reset(&self) {
        self.recently_shown.lock().unwrap().clear();
        self.buffer.lock().unwrap().clear();
        *self.last_continuation.lock().unwrap() = None;
    }

    /// Gather candidates from the spec's sources, de-dup, then rank through the engine.
    async fn gather_and_rank(
        &self,
        yt: &YoutubeService,
        rec: &RecommendationService,
        spec: &GatherSpec,
        user_subs: &[String],
        region: Option<String>,
    ) -> AppResult<(Vec<ShortItem>, Option<String>)> {
        let reel_fut = yt.get_shorts_sequence(
            spec.reel_params.clone(),
            spec.reel_sequence_params.clone(),
            region,
        );
        let discovery_fut = async {
            if spec.include_discovery {
                gather_discovery(yt, rec).await
            } else {
                Vec::new()
            }
        };
        let subs_fut = async {
            if spec.include_subs {
                gather_subscription_shorts(yt, user_subs).await
            } else {
                Vec::new()
            }
        };

        let (reel_res, discovery, subs) = tokio::join!(reel_fut, discovery_fut, subs_fut);

        // Reel items carry rich overlay metadata (avatar, likes); keep it so the
        // ranked result is reassembled with that detail intact.
        let mut rich: HashMap<String, ShortItem> = HashMap::new();
        let mut candidates: Vec<VideoSummary> = Vec::new();
        let mut continuation = None;

        if let Ok(feed) = reel_res {
            continuation = feed.continuation;
            for item in feed.items {
                candidates.push(item.to_video_summary());
                rich.insert(item.id.clone(), item);
            }
        }
        candidates.extend(discovery);
        candidates.extend(subs);

        let candidates = self.dedup_unseen(candidates);
        if candidates.is_empty() {
            return Ok((Vec::new(), continuation));
        }

        let subs_set: HashSet<String> = user_subs.iter().cloned().collect();
        let ranked = rec.rank_candidates(candidates, subs_set).await?;
        if ranked.is_empty() {
            return Ok((Vec::new(), continuation));
        }

        // Record impressions so the ranker's fatigue penalties decay these out of future pages.
        let _ = rec.record_feed_impressions(ranked.clone()).await;
        self.mark_shown(ranked.iter().map(|video| video.id.clone()));

        let items = ranked
            .into_iter()
            .map(|video| {
                rich.remove(&video.id)
                    .unwrap_or_else(|| ShortItem::from_video_summary(video))
            })
            .collect();

        Ok((items, continuation))
    }

    /// Remove blank/duplicate ids and anything already shown this session.
    fn dedup_unseen(&self, candidates: Vec<VideoSummary>) -> Vec<VideoSummary> {
        let shown = self.recently_shown.lock().unwrap();
        let mut seen = HashSet::new();
        candidates
            .into_iter()
            .filter(|video| {
                !video.id.is_empty() && !shown.contains(&video.id) && seen.insert(video.id.clone())
            })
            .collect()
    }

    fn mark_shown(&self, ids: impl Iterator<Item = String>) {
        let mut shown = self.recently_shown.lock().unwrap();
        shown.extend(ids);
        if shown.len() > MAX_RECENTLY_SHOWN {
            let excess = shown.len() - MAX_RECENTLY_SHOWN;
            let stale: Vec<String> = shown.iter().take(excess).cloned().collect();
            for id in stale {
                shown.remove(&id);
            }
        }
    }
}

impl Default for ShortsService {
    fn default() -> Self {
        Self::new()
    }
}

/// Pop up to `count` items off the front of a deque.
fn drain(buffer: &mut VecDeque<ShortItem>, count: usize) -> Vec<ShortItem> {
    let take = count.min(buffer.len());
    buffer.drain(..take).collect()
}

/// Topic discovery: search the engine's learned-interest queries for on-topic
/// Shorts so the pool is taste-aligned before ranking.
async fn gather_discovery(yt: &YoutubeService, rec: &RecommendationService) -> Vec<VideoSummary> {
    let queries = rec.generate_discovery_queries().await.unwrap_or_default();
    if queries.is_empty() {
        return Vec::new();
    }

    let searches = queries.into_iter().take(MAX_DISCOVERY_QUERIES).map(|query| {
        let request = SearchVideosRequest {
            query: format!("{query} #shorts"),
            duration: Some("short".to_string()),
            ..SearchVideosRequest::default()
        };
        async move { yt.search_videos(request).await }
    });

    join_all(searches)
        .await
        .into_iter()
        .filter_map(Result::ok)
        .flat_map(|response| {
            response
                .items
                .into_iter()
                .filter(is_short_candidate)
                .take(SHORTS_PER_SEARCH)
        })
        .collect()
}

/// Subscription Shorts: pull the Shorts tab for a slice of the user's subs; these
/// earn the subscription boost during ranking.
async fn gather_subscription_shorts(yt: &YoutubeService, user_subs: &[String]) -> Vec<VideoSummary> {
    if user_subs.is_empty() {
        return Vec::new();
    }

    let fetches = user_subs.iter().take(MAX_SUB_CHANNELS).map(|channel_id| {
        let channel_id = channel_id.clone();
        async move {
            let response = yt
                .get_channel_tab(&channel_id, Some(SHORTS_TAB_PARAMS.to_string()), None, None)
                .await;
            (channel_id, response)
        }
    });

    let mut shorts = Vec::new();
    for (channel_id, response) in join_all(fetches).await {
        let Ok(tab) = response else { continue };
        for item in tab.items {
            if let ChannelItem::Short(short) = item {
                if short.id.is_empty() {
                    continue;
                }
                shorts.push(VideoSummary {
                    id: short.id,
                    title: short.title,
                    channel_name: String::new(),
                    channel_id: Some(channel_id.clone()),
                    thumbnail_url: short.thumbnail_url,
                    duration_seconds: None,
                    published_text: None,
                    view_count_text: short.view_count_text,
                    channel_avatar_url: None,
                    is_live: false,
                });
            }
        }
    }
    shorts
}

/// A search result counts as a Short when it is a real video id under the ceiling.
fn is_short_candidate(video: &VideoSummary) -> bool {
    video.id.len() == 11
        && !video.id.starts_with("channel:")
        && video
            .duration_seconds
            .is_some_and(|seconds| (1..=SHORTS_DISCOVERY_MAX_DURATION).contains(&seconds))
}
