use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use sqlx::SqlitePool;

use crate::errors::AppResult;
use crate::models::video::{VideoSummary, MusicHomeSection, MusicHomeChip};
use crate::services::youtube_service::YoutubeService;
use crate::flow_neuro::scoring::{
    apply_smart_diversity, calculate_cosine_similarity, classify_persona, extract_features,
    calculate_feed_history_penalty, calculate_implicit_disinterest_penalty,
    calculate_rejection_pattern_penalty, calculate_relevance_floor,
    calculate_anti_recommendation_penalty,
    normalize_lemma, strip_domain_tag, tokenize, FeedEntry, ScoredVideo, TimeBucket, TimeDecay,
    TopicEvidence, FlowPersona, UserBrain, IdfSnapshot,
    AFFINITY_BOOST_PER_PAIR, AFFINITY_MAX_BOOST_PER_VIDEO, BINGE_NOVELTY_FACTOR, BINGE_THRESHOLD,
    CHANNEL_PROFILE_BLEND_WEIGHT, CHANNEL_PROFILE_MAX_TOPICS, CHANNEL_SUPPRESSION_DAYS,
    CLASSIC_VIEW_THRESHOLD, COLD_START_THRESHOLD,
    CURIOSITY_GAP_BONUS, IMPRESSION_CACHE_MAX, IMPRESSION_DECAY_RATE,
    IMPRESSION_PENALTY_HEAVY, IMPRESSION_PENALTY_LIGHT, IMPRESSION_PENALTY_MEDIUM, IMPRESSION_THRESHOLD_DROP,
    IMPRESSION_THRESHOLD_HEAVY, IMPRESSION_THRESHOLD_LIGHT, JITTER_COLD_START, JITTER_NORMAL,
    MUSIC_REWATCH_MAX_DURATION, ONBOARDING_MAX_BOOST, ONBOARDING_WARMUP_INTERACTIONS, SERENDIPITY_BONUS,
    FEED_HISTORY_EXPIRY_DAYS, FEED_HISTORY_MAX, NOT_INTERESTED_CHANNEL_FLOOR,
    QUERY_OVERLAP_THRESHOLD, RECENT_QUERY_TOKENS_MAX,
    SESSION_AFFINITY_MILD_BOOST, SESSION_AFFINITY_MILD_THRESHOLD, SESSION_AFFINITY_STRONG_BOOST,
    SESSION_AFFINITY_STRONG_THRESHOLD, SUBSCRIPTION_BOOST, WATCHED_PENALTY_FULL, WATCHED_PENALTY_HALF,
    VIDEO_SUPPRESSION_DAYS, WATCHED_PENALTY_SAMPLED, WATCHED_THRESHOLD_FULL, WATCHED_THRESHOLD_HALF,
    WATCHED_THRESHOLD_SAMPLED,
};
use crate::flow_neuro::signals::{
    get_or_create_brain, on_video_interaction, save_brain, InteractionType,
};

pub struct RecommendationService {
    pool: SqlitePool,
    impression_cache: Mutex<HashMap<String, (i32, u64)>>, // video_id -> (seen_count, last_seen_timestamp)
    session_topic_history: Mutex<Vec<String>>,
    session_video_count: Mutex<i32>,
    session_start_time: u64,
}

impl RecommendationService {
    pub fn new(pool: SqlitePool) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        Self {
            pool,
            impression_cache: Mutex::new(HashMap::new()),
            session_topic_history: Mutex::new(Vec::new()),
            session_video_count: Mutex::new(0),
            session_start_time: now,
        }
    }

    fn get_current_time_ms(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }

    pub fn parse_view_count(text: Option<&str>) -> u64 {
        let t = match text {
            Some(val) => val.to_lowercase(),
            None => return 0,
        };
        let clean: String = t.chars().filter(|c| c.is_ascii_digit() || *c == '.').collect();
        if clean.is_empty() {
            return 0;
        }
        let num: f64 = clean.parse().unwrap_or(0.0);
        if t.contains('m') {
            (num * 1_000_000.0) as u64
        } else if t.contains('k') {
            (num * 1_000.0) as u64
        } else if t.contains('b') {
            (num * 1_000_000_000.0) as u64
        } else {
            num as u64
        }
    }

    fn is_music_track(title: &str, channel: &str, duration_sec: Option<u64>) -> bool {
        let dur = duration_sec.unwrap_or(0);
        if dur > MUSIC_REWATCH_MAX_DURATION {
            return false;
        }
        let title_lower = title.to_lowercase();
        let channel_lower = channel.to_lowercase();
        let music_keywords = ["music", "song", "lyrics", "remix", "lofi", "playlist", "official video", "official audio"];
        music_keywords.iter().any(|&kw| title_lower.contains(kw) || channel_lower.contains(kw))
    }

    fn has_confirmed_topic_evidence(brain: &UserBrain, topic: &str) -> bool {
        let base = strip_domain_tag(topic);
        if brain.preferred_topics.iter().any(|preferred| normalize_lemma(preferred) == base) {
            return true;
        }

        let evidence = brain
            .topic_evidence
            .get(&base)
            .or_else(|| brain.topic_evidence.get(topic));

        matches!(
            evidence,
            Some(TopicEvidence {
                explicit_signals,
                watch_signals,
                positive_score,
                video_ids,
                ..
            }) if *explicit_signals > 0 || *watch_signals >= 2 || video_ids.len() >= 2 || *positive_score >= 1.2
        )
    }

    fn build_discovery_query(topic: &str, brain: &UserBrain) -> String {
        let base = strip_domain_tag(topic);
        if base.len() >= 6 {
            return base;
        }

        let partner = brain
            .topic_affinities
            .iter()
            .filter_map(|(key, score)| {
                if *score <= 0.12 {
                    return None;
                }
                let parts: Vec<&str> = key.split([':', '|']).collect();
                if parts.len() != 2 {
                    return None;
                }
                if parts[0] == base {
                    Some((parts[1].to_string(), *score))
                } else if parts[1] == base {
                    Some((parts[0].to_string(), *score))
                } else {
                    None
                }
            })
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(partner, _)| partner);

        if let Some(partner) = partner {
            format!("{} {}", base, strip_domain_tag(&partner))
        } else {
            base
        }
    }

    fn calculate_channel_profile_boost(
        brain: &UserBrain,
        channel_id: &str,
        video_vector: &crate::flow_neuro::scoring::ContentVector,
    ) -> f64 {
        let Some(profile) = brain.channel_topic_profiles.get(channel_id) else {
            return 0.0;
        };
        if profile.len() < 3 {
            return 0.0;
        }

        let profile_vector = crate::flow_neuro::scoring::ContentVector {
            topics: {
                let mut entries: Vec<(String, f64)> = profile
                    .iter()
                    .map(|(topic, weight)| (topic.clone(), *weight))
                    .collect();
                entries.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                entries.into_iter().take(CHANNEL_PROFILE_MAX_TOPICS).collect()
            },
            duration: 0.5,
            pacing: 0.5,
            complexity: 0.5,
            is_live: 0.0,
        };

        calculate_cosine_similarity(&profile_vector, video_vector) * CHANNEL_PROFILE_BLEND_WEIGHT
    }

    fn calculate_channel_score_multiplier(brain: &UserBrain, channel_id: &str) -> f64 {
        let Some(score) = brain.channel_scores.get(channel_id) else {
            return 1.0;
        };
        if *score >= NOT_INTERESTED_CHANNEL_FLOOR {
            return 1.0;
        }
        let normalized = 1.0 / (1.0 + (-8.0 * (score - 0.35)).exp());
        0.05 + 0.95 * normalized
    }

    fn calculate_adaptive_jitter(total_interactions: i32, feed_overlap_ratio: f64) -> f64 {
        if total_interactions < ONBOARDING_WARMUP_INTERACTIONS {
            JITTER_COLD_START
        } else if feed_overlap_ratio > 0.5 {
            0.12
        } else if feed_overlap_ratio > 0.2 {
            0.06
        } else {
            JITTER_NORMAL
        }
    }

    pub async fn generate_discovery_queries(&self) -> AppResult<Vec<String>> {
        let mut brain = get_or_create_brain(&self.pool).await?;
        let mut queries = Vec::new();

        let mut sorted_interest_scores: Vec<(String, f64)> = brain
            .global_vector
            .topics
            .iter()
            .filter(|(_, score)| **score > 0.0)
            .map(|(topic, score)| (strip_domain_tag(topic), *score))
            .collect();
        sorted_interest_scores.sort_by(|a, b| {
            b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)
        });

        let sorted_interests: Vec<String> = sorted_interest_scores
            .into_iter()
            .filter(|(topic, score)| {
                *score >= 0.20 || Self::has_confirmed_topic_evidence(&brain, topic)
            })
            .map(|(topic, _)| topic)
            .take(6)
            .collect();

        queries.extend(sorted_interests.iter().take(2).map(|topic| Self::build_discovery_query(topic, &brain)));

        let bucket_topic = brain
            .time_vectors
            .get(&TimeBucket::current())
            .and_then(|vector| {
                vector
                    .topics
                    .iter()
                    .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
                    .map(|(topic, _)| strip_domain_tag(topic))
            });
        if let Some(topic) = bucket_topic {
            queries.push(Self::build_discovery_query(&topic, &brain));
        }

        if sorted_interests.len() >= 2 {
            queries.push(format!("{} {}", sorted_interests[0], sorted_interests[1]));
        }
        if sorted_interests.len() >= 3 {
            queries.push(format!("{} {}", sorted_interests[0], sorted_interests[2]));
            queries.push(format!("{} {}", sorted_interests[1], sorted_interests[2]));
        }

        let mut affinities: Vec<(String, f64)> = brain.topic_affinities.iter().map(|(key, score)| (key.clone(), *score)).collect();
        affinities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        for (key, _) in affinities.into_iter().take(3) {
            let parts: Vec<&str> = key.split([':', '|']).collect();
            if parts.len() == 2 {
                queries.push(format!("{} {}", parts[0], parts[1]));
            }
        }

        if queries.len() < 5 {
            let mut channel_topics: Vec<(String, f64)> = brain
                .channel_topic_profiles
                .values()
                .flat_map(|profile| profile.iter())
                .map(|(topic, weight)| (strip_domain_tag(topic), *weight))
                .filter(|(topic, _)| Self::has_confirmed_topic_evidence(&brain, topic))
                .collect();
            channel_topics.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            let channel_topics: Vec<String> = channel_topics
                .into_iter()
                .map(|(topic, _)| topic)
                .filter(|topic| !queries.iter().any(|existing| existing.contains(topic)))
                .take(3)
                .collect();
            queries.extend(channel_topics);
        }

        let persona_suffix = match classify_persona(&brain) {
            FlowPersona::DeepDiver => Some("documentary"),
            FlowPersona::Scholar => Some("analysis explained"),
            FlowPersona::Audiophile => Some("playlist mix"),
            FlowPersona::Livewire => Some("live stream"),
            FlowPersona::Binger => Some("full movie"),
            FlowPersona::Skimmer => Some("shorts compilation"),
            _ => None,
        };
        if let (Some(suffix), Some(topic)) = (persona_suffix, sorted_interests.first()) {
            queries.push(format!("{} {}", topic, suffix));
        }

        if queries.is_empty() {
            queries.extend(brain.preferred_topics.iter().take(5).cloned());
        }
        if queries.is_empty() {
            queries.extend([
                "technology".to_string(),
                "music".to_string(),
                "gaming".to_string(),
                "science".to_string(),
                "documentary".to_string(),
            ]);
        }

        let mut deduped = Vec::new();
        let blocked = &brain.blocked_topics;
        for query in queries {
            let normalized = query.trim().to_lowercase();
            if normalized.is_empty() {
                continue;
            }
            if blocked.iter().any(|blocked_term| normalized.contains(blocked_term)) {
                continue;
            }
            if !deduped.iter().any(|existing: &String| existing == &normalized) {
                deduped.push(normalized);
            }
        }

        if brain.recent_query_tokens.len() > 0 && deduped.len() > 3 {
            let rotated: Vec<String> = deduped
                .iter()
                .filter(|query| {
                    let tokens: HashSet<String> = tokenize(query).into_iter().collect();
                    if tokens.is_empty() {
                        return true;
                    }
                    !brain.recent_query_tokens.iter().any(|recent| {
                        if recent.is_empty() {
                            return false;
                        }
                        let intersection = tokens.intersection(recent).count();
                        let union = tokens.union(recent).count();
                        union > 0 && (intersection as f64 / union as f64) > QUERY_OVERLAP_THRESHOLD
                    })
                })
                .cloned()
                .collect();
            if rotated.len() >= deduped.len() / 3 {
                deduped = rotated;
            }
        }

        brain.recent_query_tokens = deduped
            .iter()
            .map(|query| tokenize(query).into_iter().collect::<HashSet<String>>())
            .chain(brain.recent_query_tokens.into_iter())
            .take(RECENT_QUERY_TOKENS_MAX)
            .collect();
        save_brain(&self.pool, &brain).await?;

        Ok(deduped)
    }

    pub async fn rank_candidates(
        &self,
        candidates: Vec<VideoSummary>,
        user_subs: HashSet<String>,
    ) -> AppResult<Vec<VideoSummary>> {
        if candidates.is_empty() {
            return Ok(Vec::new());
        }
        let candidate_count = candidates.len();

        let mut brain = get_or_create_brain(&self.pool).await?;
        let now_ms = self.get_current_time_ms();
        let video_cutoff = now_ms.saturating_sub(VIDEO_SUPPRESSION_DAYS * 86_400_000);
        let channel_cutoff = now_ms.saturating_sub(CHANNEL_SUPPRESSION_DAYS * 86_400_000);

        // 1. Pre-filter blocked channels and topics
        let filtered: Vec<VideoSummary> = candidates
            .into_iter()
            .filter(|video| {
                let channel_id = video.channel_id.as_deref().unwrap_or(&video.id);
                if brain
                    .suppressed_video_ids
                    .get(&video.id)
                    .map(|ts| *ts >= video_cutoff)
                    .unwrap_or(false)
                {
                    return false;
                }
                if brain
                    .suppressed_channels
                    .get(channel_id)
                    .map(|ts| *ts >= channel_cutoff)
                    .unwrap_or(false)
                {
                    return false;
                }
                if brain.blocked_channels.contains(channel_id) {
                    return false;
                }
                let title_lower = video.title.to_lowercase();
                let channel_lower = video.channel_name.to_lowercase();
                !brain.blocked_topics.iter().any(|blocked| {
                    title_lower.contains(blocked) || channel_lower.contains(blocked)
                })
            })
            .collect();

        if filtered.is_empty() {
            return Ok(Vec::new());
        }

        // Snapshots of caches
        let idf_snapshot = IdfSnapshot {
            word_frequencies: brain.idf_word_frequency.clone(),
            total_documents: brain.idf_total_documents,
        };
        let impression_snap = self.impression_cache.lock().unwrap().clone();
        let session_topics = self.session_topic_history.lock().unwrap().clone();
        let session_vid_count = *self.session_video_count.lock().unwrap();
        let feed_overlap_ratio = if filtered.is_empty() || brain.feed_history.is_empty() {
            0.0
        } else {
            let candidate_ids: HashSet<String> = filtered.iter().map(|video| video.id.clone()).collect();
            let history_ids: HashSet<String> = brain
                .feed_history
                .iter()
                .filter(|(_, entry)| now_ms.saturating_sub(entry.last_shown) < 172_800_000)
                .map(|(video_id, _)| video_id.clone())
                .collect();
            let overlap = candidate_ids.intersection(&history_ids).count();
            overlap as f64 / candidate_ids.len() as f64
        };

        // Time context vector
        let current_bucket = TimeBucket::current();
        let time_context_vec = brain.time_vectors.get(&current_bucket).cloned().unwrap_or_default();

        // Boredom detection & dynamic temperatures
        let boredom_factor = (brain.consecutive_skips as f64 / 20.0).clamp(0.0, 0.5);
        let w_personality = 0.4 - (boredom_factor * 0.5);
        let w_context = 0.4 - (boredom_factor * 0.5);
        let w_novelty = 0.2 + boredom_factor;

        let is_onboarding = brain.total_interactions < ONBOARDING_WARMUP_INTERACTIONS;
        let onboarding_warmup = if is_onboarding {
            1.0 - (brain.total_interactions as f64 / ONBOARDING_WARMUP_INTERACTIONS as f64) * 0.5
        } else {
            0.5
        };

        let mut seed = now_ms;
        let mut next_random = move || {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (seed as f64) / (u64::MAX as f64)
        };

        // Score all candidate videos
        let mut scored_candidates = Vec::new();
        let mut rng = next_random();
        let jitter_amount = Self::calculate_adaptive_jitter(brain.total_interactions, feed_overlap_ratio);

        for video in filtered {
            let channel_id = video.channel_id.clone().unwrap_or_else(|| video.id.clone());
            let view_count = Self::parse_view_count(video.view_count_text.as_deref());
            let is_short = video.duration_seconds.unwrap_or(0) <= 60;
            let is_subscription = user_subs.contains(&channel_id);
            
            // Extract feature content vector for the candidate
            let video_vector = extract_features(
                &video.title,
                &video.channel_name,
                None, // Feeds don't have descriptions
                video.duration_seconds,
                false, // Feeds don't specify livestream status directly
                is_short,
                &idf_snapshot,
            );

            let personality_score = calculate_cosine_similarity(&brain.global_vector, &video_vector);
            let context_score = calculate_cosine_similarity(&time_context_vec, &video_vector);
            let novelty_score = 1.0 - personality_score;

            let mut total_score = (personality_score * w_personality)
                + (context_score * w_context)
                + (novelty_score * w_novelty);

            total_score += Self::calculate_channel_profile_boost(&brain, &channel_id, &video_vector);

            // Topic affinity boost
            let video_topics: Vec<String> = video_vector.topics.keys().cloned().collect();
            let mut affinity_boost = 0.0;
            for i in 0..video_topics.len() {
                for j in i + 1..video_topics.len() {
                    let key = if video_topics[i] < video_topics[j] {
                        format!("{}:{}", video_topics[i], video_topics[j])
                    } else {
                        format!("{}:{}", video_topics[j], video_topics[i])
                    };
                    if let Some(&affinity) = brain.topic_affinities.get(&key) {
                        affinity_boost += affinity * AFFINITY_BOOST_PER_PAIR;
                    }
                }
            }
            total_score += affinity_boost.min(AFFINITY_MAX_BOOST_PER_VIDEO);

            // Subscription boost
            if is_subscription {
                total_score += SUBSCRIPTION_BOOST;
            }

            // Serendipity bonus (graduated sigmoid-like ramp)
            let novelty_ramp = ((novelty_score - 0.4) / 0.4).clamp(0.0, 1.0);
            let context_ramp = ((context_score - 0.3) / 0.4).clamp(0.0, 1.0);
            total_score += SERENDIPITY_BONUS * novelty_ramp * context_ramp;

            // Cold start popularity
            if brain.total_interactions < COLD_START_THRESHOLD && view_count > 0 {
                let popularity_boost = (1.0 + view_count as f64).log10() / 10.0 * 0.05;
                total_score += popularity_boost;
            }

            // Clickbait filter & engagement rate floor
            // (Feeds usually don't have like counts directly, so we assume normal clickbait filtering is skipped if count is absent)

            // Time decay
            let age_multiplier = TimeDecay::calculate_multiplier(
                video.published_text.as_deref().unwrap_or(""),
                false,
            );
            let is_classic = view_count > CLASSIC_VIEW_THRESHOLD;
            let final_age_factor = if is_classic || is_subscription {
                (age_multiplier + 1.0) / 2.0
            } else {
                age_multiplier
            };
            total_score *= final_age_factor;

            total_score *= Self::calculate_channel_score_multiplier(&brain, &channel_id);
            total_score *= calculate_rejection_pattern_penalty(
                &video_vector,
                &brain.rejection_patterns,
                now_ms,
            );
            total_score *= calculate_feed_history_penalty(
                &video.id,
                &brain.feed_history,
                now_ms,
                candidate_count,
            );
            total_score *= calculate_implicit_disinterest_penalty(
                &video.id,
                &brain.feed_history,
                &brain.watch_history_map,
                now_ms,
            );
            total_score *= calculate_relevance_floor(
                personality_score,
                brain.total_interactions,
                is_subscription,
            );
            total_score *= calculate_anti_recommendation_penalty(&video_vector, &brain);

            // Curiosity gap (graduated ramp)
            if personality_score > 0.5 {
                let complexity_diff = (brain.global_vector.complexity - video_vector.complexity).abs();
                let curiosity_ramp = ((complexity_diff - 0.2) / 0.3).clamp(0.0, 1.0);
                let topic_safety = ((personality_score - 0.5) / 0.3).clamp(0.0, 1.0);
                total_score += CURIOSITY_GAP_BONUS * curiosity_ramp * topic_safety;
            }

            // Channel boredom penalty
            // (We skip if no channel score recorded)

            // Session fatigue
            let video_primary_topic = video_vector.topics
                .iter()
                .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
                .map(|(k, _)| k.clone())
                .unwrap_or_default();
                
            let topic_session_count = session_topics.iter().filter(|&t| t == &video_primary_topic).count();
            let fatigue_multiplier = if video_primary_topic.is_empty() {
                1.0
            } else if topic_session_count >= 5 {
                0.3
            } else if topic_session_count >= 3 {
                0.5
            } else if topic_session_count >= 1 {
                0.8
            } else {
                1.0
            };
            total_score *= fatigue_multiplier;

            // Onboarding warm-up boost
            if is_onboarding {
                let has_preferred = brain.preferred_topics.iter().any(|pref| {
                    video_vector.topics.contains_key(&normalize_lemma(pref))
                });
                if has_preferred {
                    total_score += onboarding_warmup * ONBOARDING_MAX_BOOST;
                }
            }

            // Session affinity
            if !session_topics.is_empty() && !video_primary_topic.is_empty() {
                let recent_topics: Vec<String> = session_topics.iter().rev().take(5).cloned().collect();
                let recent_count = recent_topics.iter().filter(|&t| t == &video_primary_topic).count();
                let session_affinity_boost = if recent_count >= SESSION_AFFINITY_STRONG_THRESHOLD {
                    SESSION_AFFINITY_STRONG_BOOST
                } else if recent_count >= SESSION_AFFINITY_MILD_THRESHOLD {
                    SESSION_AFFINITY_MILD_BOOST
                } else {
                    0.0
                };
                total_score += session_affinity_boost;
            }

            // Binge detection
            if session_vid_count > BINGE_THRESHOLD {
                let binge_novelty_boost = novelty_score * BINGE_NOVELTY_FACTOR;
                total_score += binge_novelty_boost;
            }

            // Impression fatigue
            if let Some(&(seen_count, last_seen)) = impression_snap.get(&video.id) {
                let hours_since_seen = (now_ms - last_seen) as f64 / 3_600_000.0;
                let decayed_count = (seen_count as f64 * (-IMPRESSION_DECAY_RATE * hours_since_seen).exp()) as i32;

                let impression_penalty = if decayed_count >= IMPRESSION_THRESHOLD_DROP {
                    IMPRESSION_PENALTY_HEAVY
                } else if decayed_count >= IMPRESSION_THRESHOLD_HEAVY {
                    IMPRESSION_PENALTY_MEDIUM
                } else if decayed_count >= IMPRESSION_THRESHOLD_LIGHT {
                    IMPRESSION_PENALTY_LIGHT
                } else {
                    1.0
                };
                total_score *= impression_penalty;
            }

            // Already-watched penalty
            if let Some(&percent) = brain.watch_history_map.get(&video.id) {
                let is_music = Self::is_music_track(&video.title, &video.channel_name, video.duration_seconds);
                let watched_penalty = if is_music && percent > WATCHED_THRESHOLD_HALF {
                    1.0
                } else if percent > WATCHED_THRESHOLD_FULL {
                    WATCHED_PENALTY_FULL
                } else if percent > WATCHED_THRESHOLD_HALF {
                    WATCHED_PENALTY_HALF
                } else if percent > WATCHED_THRESHOLD_SAMPLED {
                    WATCHED_PENALTY_SAMPLED
                } else {
                    1.0
                };
                total_score *= watched_penalty;
            }

            // Jitter
            let jitter = rng * jitter_amount;
            // Shift rng for next video
            rng = next_random();

            scored_candidates.push((
                video,
                ScoredVideo {
                    id: video_vector.topics.keys().next().cloned().unwrap_or_default(), // Dummy ID to satisfy signature
                    title: "".to_string(),
                    channel_id: "".to_string(),
                    score: total_score + jitter,
                    vector: video_vector,
                },
            ));
        }

        // Apply diversity re-ranking
        let scored_wrapper: Vec<ScoredVideo> = scored_candidates
            .iter()
            .map(|(v, sv)| ScoredVideo {
                id: v.id.clone(),
                title: v.title.clone(),
                channel_id: v.channel_id.clone().unwrap_or_else(|| v.id.clone()),
                score: sv.score,
                vector: sv.vector.clone(),
            })
            .collect();

        let reranked_ids = apply_smart_diversity(scored_wrapper);

        // Map reranked IDs back to their corresponding VideoSummary records
        let mut final_results = Vec::new();
        let mut candidates_map: HashMap<String, VideoSummary> = scored_candidates
            .into_iter()
            .map(|(v, _)| (v.id.clone(), v))
            .collect();

        {
            let mut cache = self.impression_cache.lock().unwrap();

            for id in reranked_ids {
                if let Some(video) = candidates_map.remove(&id) {
                    // Record impression for future reranking runs
                    let entry = cache.entry(id.clone()).or_insert((0, now_ms));
                    entry.0 += 1;
                    entry.1 = now_ms;

                    final_results.push(video);
                }
            }

            // Restrict size of impression cache to avoid memory leaks
            if cache.len() > IMPRESSION_CACHE_MAX {
                if let Some(oldest_key) = cache.keys().next().cloned() {
                    cache.remove(&oldest_key);
                }
            }
        }

        // Append any leftovers that smart diversity dropped to maintain full list
        for (_, video) in candidates_map {
            final_results.push(video);
        }

        for video in &final_results {
            let entry = brain.feed_history.entry(video.id.clone()).or_insert(FeedEntry {
                last_shown: now_ms,
                show_count: 0,
            });
            entry.last_shown = now_ms;
            entry.show_count += 1;
        }

        let feed_cutoff = now_ms.saturating_sub(FEED_HISTORY_EXPIRY_DAYS * 86_400_000);
        brain.feed_history.retain(|_, entry| entry.last_shown >= feed_cutoff);
        if brain.feed_history.len() > FEED_HISTORY_MAX {
            let mut entries: Vec<(String, FeedEntry)> = brain
                .feed_history
                .iter()
                .map(|(video_id, entry)| (video_id.clone(), entry.clone()))
                .collect();
            entries.sort_by(|a, b| a.1.last_shown.cmp(&b.1.last_shown));
            let removable: Vec<String> = entries
                .into_iter()
                .take(brain.feed_history.len() - FEED_HISTORY_MAX)
                .map(|(video_id, _)| video_id)
                .collect();
            for video_id in removable {
                brain.feed_history.remove(&video_id);
            }
        }

        save_brain(&self.pool, &brain).await?;

        Ok(final_results)
    }

    pub async fn log_video_interaction(
        &self,
        video_id: &str,
        title: &str,
        channel_name: &str,
        channel_id: &str,
        description: Option<&str>,
        duration_sec: Option<u64>,
        is_live: bool,
        is_short: bool,
        interaction_type: InteractionType,
        percent_watched: f32,
    ) -> AppResult<()> {
        on_video_interaction(
            &self.pool,
            video_id,
            title,
            channel_name,
            channel_id,
            description,
            duration_sec,
            is_live,
            is_short,
            interaction_type,
            percent_watched,
        )
        .await?;

        // Adjust session counts/topics on positive interaction
        if interaction_type == InteractionType::Click || interaction_type == InteractionType::Watched {
            let idf_snapshot = {
                let brain = get_or_create_brain(&self.pool).await?;
                IdfSnapshot {
                    word_frequencies: brain.idf_word_frequency.clone(),
                    total_documents: brain.idf_total_documents,
                }
            };
            let video_vector = extract_features(
                title,
                channel_name,
                description,
                duration_sec,
                is_live,
                is_short,
                &idf_snapshot,
            );
            if let Some((primary_topic, _)) = video_vector.topics.iter().max_by(|a, b| a.1.partial_cmp(b.1).unwrap()) {
                let mut history = self.session_topic_history.lock().unwrap();
                history.push(primary_topic.clone());
                if history.len() > 50 {
                    history.remove(0);
                }
            }
            let mut count = self.session_video_count.lock().unwrap();
            *count += 1;
        }

        Ok(())
    }

    pub async fn record_feed_impressions(
        &self,
        videos: Vec<VideoSummary>,
    ) -> AppResult<()> {
        if videos.is_empty() {
            return Ok(());
        }

        let now_ms = self.get_current_time_ms();
        let mut unique_videos = Vec::new();
        let mut seen = HashSet::new();
        for video in videos {
            if seen.insert(video.id.clone()) {
                unique_videos.push(video);
            }
        }

        {
            let mut cache = self.impression_cache.lock().unwrap();
            for video in &unique_videos {
                let entry = cache.entry(video.id.clone()).or_insert((0, now_ms));
                entry.0 += 1;
                entry.1 = now_ms;
            }

            if cache.len() > IMPRESSION_CACHE_MAX {
                if let Some(oldest_key) = cache.keys().next().cloned() {
                    cache.remove(&oldest_key);
                }
            }
        }

        let mut brain = get_or_create_brain(&self.pool).await?;
        for video in &unique_videos {
            let entry = brain.feed_history.entry(video.id.clone()).or_insert(FeedEntry {
                last_shown: now_ms,
                show_count: 0,
            });
            entry.last_shown = now_ms;
            entry.show_count += 1;
        }

        let feed_cutoff = now_ms.saturating_sub(FEED_HISTORY_EXPIRY_DAYS * 86_400_000);
        brain.feed_history.retain(|_, entry| entry.last_shown >= feed_cutoff);
        if brain.feed_history.len() > FEED_HISTORY_MAX {
            let mut entries: Vec<(String, FeedEntry)> = brain
                .feed_history
                .iter()
                .map(|(video_id, entry)| (video_id.clone(), entry.clone()))
                .collect();
            entries.sort_by(|a, b| b.1.last_shown.cmp(&a.1.last_shown));
            let retained: HashSet<String> = entries
                .into_iter()
                .take(FEED_HISTORY_MAX)
                .map(|(video_id, _)| video_id)
                .collect();
            brain.feed_history.retain(|video_id, _| retained.contains(video_id));
        }

        save_brain(&self.pool, &brain).await?;

        Ok(())
    }

    pub async fn get_personality(&self) -> AppResult<FlowPersona> {
        let brain = get_or_create_brain(&self.pool).await?;
        Ok(classify_persona(&brain))
    }

    pub async fn complete_onboarding(&self, preferred: HashSet<String>) -> AppResult<()> {
        let mut brain = get_or_create_brain(&self.pool).await?;
        brain.preferred_topics = preferred;
        brain.has_completed_onboarding = true;
        save_brain(&self.pool, &brain).await?;
        Ok(())
    }

    pub async fn get_onboarding_status(&self) -> AppResult<bool> {
        let brain = get_or_create_brain(&self.pool).await?;
        Ok(brain.has_completed_onboarding)
    }

    pub async fn get_cached_music_home(&self) -> AppResult<Option<(Vec<MusicHomeSection>, Vec<MusicHomeChip>)>> {
        let sections_rows = sqlx::query(
            "SELECT section_id, title, subtitle, tracks_json, order_by FROM music_home_sections ORDER BY order_by ASC"
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| crate::errors::AppError::Database(e.to_string()))?;

        let chips_rows = sqlx::query(
            "SELECT title, browse_id, params, order_by FROM music_home_chips ORDER BY order_by ASC"
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| crate::errors::AppError::Database(e.to_string()))?;

        if sections_rows.is_empty() && chips_rows.is_empty() {
            return Ok(None);
        }

        let mut sections = Vec::new();
        for r in sections_rows {
            let section_id: String = sqlx::Row::get(&r, 0);
            let title: String = sqlx::Row::get(&r, 1);
            let subtitle: Option<String> = sqlx::Row::get(&r, 2);
            let tracks_json: String = sqlx::Row::get(&r, 3);
            let order_by: i32 = sqlx::Row::get(&r, 4);

            let tracks = serde_json::from_str(&tracks_json)
                .unwrap_or_else(|_| Vec::new());

            sections.push(MusicHomeSection {
                section_id,
                title,
                subtitle,
                tracks,
                order_by,
            });
        }

        let mut chips = Vec::new();
        for r in chips_rows {
            let title: String = sqlx::Row::get(&r, 0);
            let browse_id: Option<String> = sqlx::Row::get(&r, 1);
            let params: Option<String> = sqlx::Row::get(&r, 2);
            let order_by: i32 = sqlx::Row::get(&r, 3);

            chips.push(MusicHomeChip {
                title,
                browse_id,
                params,
                order_by,
            });
        }

        Ok(Some((sections, chips)))
    }

    pub async fn cache_music_home(
        &self,
        sections: &[MusicHomeSection],
        chips: &[MusicHomeChip],
    ) -> AppResult<()> {
        let mut tx = self.pool.begin().await.map_err(|e| crate::errors::AppError::Database(e.to_string()))?;

        sqlx::query("DELETE FROM music_home_sections")
            .execute(&mut *tx)
            .await
            .map_err(|e| crate::errors::AppError::Database(e.to_string()))?;

        sqlx::query("DELETE FROM music_home_chips")
            .execute(&mut *tx)
            .await
            .map_err(|e| crate::errors::AppError::Database(e.to_string()))?;

        for section in sections {
            let tracks_json = serde_json::to_string(&section.tracks)
                .map_err(|e| crate::errors::AppError::Database(e.to_string()))?;
            sqlx::query(
                "INSERT INTO music_home_sections (section_id, title, subtitle, tracks_json, order_by) VALUES (?, ?, ?, ?, ?)"
            )
            .bind(&section.section_id)
            .bind(&section.title)
            .bind(&section.subtitle)
            .bind(tracks_json)
            .bind(section.order_by)
            .execute(&mut *tx)
            .await
            .map_err(|e| crate::errors::AppError::Database(e.to_string()))?;
        }

        for chip in chips {
            sqlx::query(
                "INSERT INTO music_home_chips (title, browse_id, params, order_by) VALUES (?, ?, ?, ?)"
            )
            .bind(&chip.title)
            .bind(&chip.browse_id)
            .bind(&chip.params)
            .bind(chip.order_by)
            .execute(&mut *tx)
            .await
            .map_err(|e| crate::errors::AppError::Database(e.to_string()))?;
        }

        tx.commit().await.map_err(|e| crate::errors::AppError::Database(e.to_string()))?;
        Ok(())
    }

    pub async fn get_personalized_music_recommendations(
        &self,
        youtube_service: &YoutubeService,
        limit: usize,
    ) -> AppResult<Vec<VideoSummary>> {
        let rows = sqlx::query(
            "SELECT video_id, title, channel_name, total_duration_seconds FROM watch_history ORDER BY datetime(watch_date) DESC, created_at DESC"
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| crate::errors::AppError::Database(e.to_string()))?;

        let mut music_seeds = Vec::new();
        for r in rows {
            let video_id: String = sqlx::Row::get(&r, 0);
            let title: String = sqlx::Row::get(&r, 1);
            let channel_name: Option<String> = sqlx::Row::get(&r, 2);
            let total_duration_seconds: Option<i64> = sqlx::Row::get(&r, 3);
            
            let ch_name = channel_name.as_deref().unwrap_or("");
            let duration = total_duration_seconds.map(|d| d as u64);
            if Self::is_music_track(&title, ch_name, duration) {
                if !music_seeds.contains(&video_id) {
                    music_seeds.push(video_id);
                    if music_seeds.len() >= 10 {
                        break;
                    }
                }
            }
        }

        let mut candidates = Vec::new();

        if !music_seeds.is_empty() {
            let mut seeds = Vec::new();
            let mut lcg_seed = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u32;
                
            let count_to_pick = music_seeds.len().min(4);
            let mut indices: Vec<usize> = (0..music_seeds.len()).collect();
            
            for i in (1..indices.len()).rev() {
                lcg_seed = lcg_seed.wrapping_mul(1103515245).wrapping_add(12345) & 0x7fffffff;
                let j = (lcg_seed as usize) % (i + 1);
                indices.swap(i, j);
            }
            
            for &idx in indices.iter().take(count_to_pick) {
                seeds.push(music_seeds[idx].clone());
            }

            let mut futures = Vec::new();
            for seed in &seeds {
                futures.push(youtube_service.get_music_related(seed));
            }

            let results = futures_util::future::join_all(futures).await;
            let mut seen_ids = HashSet::new();

            for res in results {
                if let Ok(tracks) = res {
                    for track in tracks {
                        if seen_ids.insert(track.id.clone()) {
                            candidates.push(track);
                        }
                    }
                }
            }
        }

        if candidates.is_empty() {
            if let Ok(trending_music) = youtube_service.search_music("trending songs", "songs").await {
                candidates = trending_music;
            } else if let Ok(trending_fallback) = youtube_service.get_trending_videos().await {
                candidates = trending_fallback.into_iter()
                    .filter(|v| Self::is_music_track(&v.title, &v.channel_name, v.duration_seconds))
                    .collect();
            }
        }

        let mut deduped: Vec<VideoSummary> = Vec::new();
        let mut seen = HashSet::new();
        for v in candidates {
            if seen.insert(v.id.clone()) {
                deduped.push(v);
            }
        }

        if !deduped.is_empty() {
            let mut lcg_seed = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u32;
            for i in (1..deduped.len()).rev() {
                lcg_seed = lcg_seed.wrapping_mul(1103515245).wrapping_add(12345) & 0x7fffffff;
                let j = (lcg_seed as usize) % (i + 1);
                deduped.swap(i, j);
            }
        }

        deduped.truncate(limit);
        Ok(deduped)
    }

    pub async fn get_subscription_rotation_feed(
        &self,
        youtube_service: &YoutubeService,
    ) -> AppResult<Vec<VideoSummary>> {
        #[derive(serde::Deserialize)]
        struct SubscribedChannel {
            id: String,
        }

        let subs_json = match crate::db::settings::get_setting(&self.pool, "subscriptions").await? {
            Some(s) => s,
            None => return Ok(Vec::new()),
        };

        let mut channel_ids = Vec::new();
        if let Ok(channels) = serde_json::from_str::<Vec<SubscribedChannel>>(&subs_json) {
            channel_ids = channels.into_iter().map(|c| c.id).collect();
        } else if let Ok(ids) = serde_json::from_str::<Vec<String>>(&subs_json) {
            channel_ids = ids;
        } else if let Ok(val) = serde_json::from_str::<serde_json::Value>(&subs_json) {
            if let Some(arr) = val.as_array() {
                for item in arr {
                    if let Some(id) = item.as_str() {
                        channel_ids.push(id.to_string());
                    } else if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        channel_ids.push(id.to_string());
                    }
                }
            }
        }

        if channel_ids.is_empty() {
            return Ok(Vec::new());
        }

        let cursor_str = crate::db::settings::get_setting(&self.pool, "homeSubsRotationCursor")
            .await?
            .unwrap_or_else(|| "0".to_string());
        let mut cursor: usize = cursor_str.parse().unwrap_or(0);

        let total_subs = channel_ids.len();
        if cursor >= total_subs {
            cursor = 0;
        }

        let batch_size = 5;
        let mut batch_channels = Vec::new();
        for i in 0..batch_size {
            let idx = (cursor + i) % total_subs;
            let cid = &channel_ids[idx];
            if !batch_channels.contains(cid) {
                batch_channels.push(cid.clone());
            }
        }

        let mut futures = Vec::new();
        for cid in &batch_channels {
            futures.push(youtube_service.get_channel_tab(cid, Some("EgZ2aWRlb3PyBgQKAjoA".to_string()), None, None));
        }

        let results = futures_util::future::join_all(futures).await;
        let mut candidates = Vec::new();
        let mut seen_ids = HashSet::new();

        for res in results {
            if let Ok(resp) = res {
                for item in resp.items {
                    if let crate::models::channel::ChannelItem::Video(video) = item {
                        if seen_ids.insert(video.id.clone()) {
                            candidates.push(video);
                        }
                    }
                }
            }
        }

        if !candidates.is_empty() {
            let mut lcg_seed = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u32;
            for i in (1..candidates.len()).rev() {
                lcg_seed = lcg_seed.wrapping_mul(1103515245).wrapping_add(12345) & 0x7fffffff;
                let j = (lcg_seed as usize) % (i + 1);
                candidates.swap(i, j);
            }
        }

        let next_cursor = (cursor + batch_channels.len()) % total_subs;
        crate::db::settings::set_setting(
            &self.pool,
            "homeSubsRotationCursor",
            &next_cursor.to_string(),
        )
        .await?;

        Ok(candidates)
    }

    pub async fn get_brain_snapshot(&self) -> AppResult<UserBrain> {
        get_or_create_brain(&self.pool).await
    }

    pub async fn unblock_topic(&self, topic: String) -> AppResult<()> {
        let mut brain = get_or_create_brain(&self.pool).await?;
        let topic_lower = topic.trim().to_lowercase();
        brain.blocked_topics.retain(|t| t.to_lowercase() != topic_lower);
        save_brain(&self.pool, &brain).await
    }

    pub async fn unblock_channel(&self, channel_id: String) -> AppResult<()> {
        let mut brain = get_or_create_brain(&self.pool).await?;
        brain.blocked_channels.remove(&channel_id);
        save_brain(&self.pool, &brain).await
    }

    pub async fn reset_brain(&self) -> AppResult<()> {
        let brain = UserBrain::default();
        save_brain(&self.pool, &brain).await
    }
}
