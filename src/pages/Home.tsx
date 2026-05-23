import React, { useRef, useState, useEffect } from "react";
import { Loader2, ChevronDown } from "lucide-react";
import {
  getTrendingVideos,
  getChannelTab,
  getPersonalizedMusicRecommendations,
  getRelatedVideos,
  getSubscriptionRotationFeed,
  searchVideos,
} from "../lib/api/youtube";
import {
  generateDiscoveryQueries,
  getFeedQuotas,
  markNotInterested,
  recordFeedImpressions,
  rankVideos,
  logInteraction,
} from "../lib/api/recommendation";
import type { FeedQuotas } from "../lib/api/recommendation";
import { getSetting, getWatchHistory } from "../lib/api/db";
import type { VideoSummary } from "../types/video";
import type { WatchHistoryRecord } from "../types/db";
import { VideoGrid } from "../components/video/VideoGrid";

interface HomeProps {
  onPlay: (video: VideoSummary) => void;
  onAddToQueue: (video: VideoSummary) => void;
}

const HOME_FEED_CACHE_TTL_MS = 30 * 60 * 1000;
const SESSION_SEEN_VIDEO_LIMIT = 500;
const STARTER_SUBSCRIPTION_TIMEOUT_MS = 12000;
const STARTER_DISCOVERY_TIMEOUT_MS = 25000;
const STARTER_EMPTY_RESCUE_TIMEOUT_MS = 20000;
const FULL_DISCOVER_SOURCE_TIMEOUT_MS = 30000;
const VIRAL_FALLBACK_TIMEOUT_MS = 8000;
const DISCOVER_EMPTY_RESCUE_TIMEOUT_MS = 45000;
const LOAD_MORE_SOURCE_TIMEOUT_MS = 12000;
const LOAD_MORE_MUSIC_TIMEOUT_MS = 8000;

const STANDARD_DISCOVER_QUOTAS: FeedQuotas = {
  maturity: "mature",
  totalInteractions: 101,
  subscriptionPercent: 10 / 35,
  discoveryPercent: 15 / 35,
  viralPercent: 10 / 35,
  subscriptionLimit: 10,
  discoveryLimit: 15,
  viralLimit: 10,
};

const homeFeedCache: Record<"discover" | "trending", { videos: VideoSummary[]; timestamp: number }> = {
  discover: { videos: [], timestamp: 0 },
  trending: { videos: [], timestamp: 0 },
};

const logHomeFeed = (stage: string, details: Record<string, unknown>) => {
  console.info(`[home-feed] ${stage}`, details);
};

  const summarizeVideosForLog = (items: VideoSummary[]) => (
    items.slice(0, 5).map((video) => ({
      id: video.id,
      title: video.title,
    channel: video.channelName,
  }))
);

export const Home: React.FC<HomeProps> = ({ onPlay, onAddToQueue }) => {
  const [activeTab] = useState<"discover" | "trending">("discover");
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreDiscover, setHasMoreDiscover] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const requestSequenceRef = useRef(0);
  const lastImpressionSignatureRef = useRef<string>("");
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const initialDiscoverHydratingRef = useRef(false);
  const didRequestInitialFeedRef = useRef(false);
  const videosRef = useRef<VideoSummary[]>([]);
  const loadMoreBackoffUntilRef = useRef(0);
  const loadMoreMissesRef = useRef(0);
  const discoveryQueriesRef = useRef<string[]>([]);
  const discoveryIndexRef = useRef(0);
  const subscriptionIdsRef = useRef<string[]>([]);
  const subscriptionIndexRef = useRef(0);
  const watchHistoryRef = useRef<WatchHistoryRecord[]>([]);
  const watchedIdsRef = useRef<Set<string>>(new Set());
  const sessionSeenOrderRef = useRef<string[]>([]);
  const sessionSeenIdsRef = useRef<Set<string>>(new Set());

  const uniqueByVideoId = (items: VideoSummary[]) => {
    const seen = new Set<string>();
    return items.filter((video) => {
      if (seen.has(video.id)) {
        return false;
      }
      seen.add(video.id);
      return true;
    });
  };

  const updateCache = (tab: "discover" | "trending", nextVideos: VideoSummary[]) => {
    homeFeedCache[tab] = {
      videos: nextVideos,
      timestamp: Date.now(),
    };
  };

  const rememberSeenVideos = (items: VideoSummary[]) => {
    for (const video of items) {
      if (sessionSeenIdsRef.current.has(video.id)) {
        continue;
      }
      sessionSeenIdsRef.current.add(video.id);
      sessionSeenOrderRef.current.push(video.id);
    }

    while (sessionSeenOrderRef.current.length > SESSION_SEEN_VIDEO_LIMIT) {
      const oldestId = sessionSeenOrderRef.current.shift();
      if (oldestId) {
        sessionSeenIdsRef.current.delete(oldestId);
      }
    }
  };

  const preferSessionFreshVideos = (items: VideoSummary[], minimumCount = 0) => {
    const unseen: VideoSummary[] = [];
    const seen: VideoSummary[] = [];

    for (const video of uniqueByVideoId(items)) {
      if (sessionSeenIdsRef.current.has(video.id)) {
        seen.push(video);
      } else {
        unseen.push(video);
      }
    }

    if (minimumCount <= 0 || unseen.length >= minimumCount) {
      return unseen;
    }

    return [...unseen, ...seen.slice(0, Math.max(0, minimumCount - unseen.length))];
  };

  const isDiscoverJunkVideo = (video: VideoSummary) => {
    const text = `${video.title ?? ""} ${video.channelName ?? ""}`.toLowerCase();
    const junkPatterns = [
      "viral",
      "popular meme",
      "internet meme",
      "memes now",
      "tiktok",
      "funniest",
      "street food",
      "compilation",
      "went viral",
      "then and now",
    ];

    return junkPatterns.some((pattern) => text.includes(pattern));
  };

  const withTimeout = async <T,>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T,
    label: string,
  ): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => {
          timer = setTimeout(() => {
            logHomeFeed("source-timeout", { label, timeoutMs });
            resolve(fallback);
          }, timeoutMs);
        }),
      ]);
    } catch (error: any) {
      console.warn(`${label} failed`, error?.message || error);
      return fallback;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  const getFreshCachedFeed = (tab: "discover" | "trending") => {
    const cache = homeFeedCache[tab];
    if (cache.videos.length === 0) {
      return null;
    }
    if ((Date.now() - cache.timestamp) > HOME_FEED_CACHE_TTL_MS) {
      return null;
    }

    const minimumCount = tab === "discover" ? 12 : 8;
    const cachedVideos = tab === "discover"
      ? cache.videos.filter((video) => !isDiscoverJunkVideo(video))
      : cache.videos;
    const sessionFresh = preferSessionFreshVideos(cachedVideos, minimumCount);
    return sessionFresh.length > 0 ? sessionFresh : null;
  };

  const isLikelyLive = (video: VideoSummary) => {
    const published = video.publishedText?.toLowerCase() ?? "";
    const views = video.viewCountText?.toLowerCase() ?? "";
    return published.includes("live") || views.includes("watching");
  };

  const isValidFeedVideo = (video: VideoSummary) => {
    const duration = video.durationSeconds ?? 0;
    if (isLikelyLive(video)) {
      return true;
    }
    return duration > 120;
  };

  const getMostlyWatchedIds = (history: WatchHistoryRecord[]) => {
    const watched = new Set<string>();
    for (const record of history) {
      const total = record.totalDurationSeconds ?? 0;
      const ratio = total > 0 ? record.watchDurationSeconds / total : 0;
      if (ratio >= 0.85 || (total === 0 && record.watchDurationSeconds >= 1800)) {
        watched.add(record.videoId);
      }
    }
    return watched;
  };

  const filterFeedVideos = (items: VideoSummary[], watchedIds: Set<string>) => {
    return uniqueByVideoId(items).filter((video) => {
      if (!isValidFeedVideo(video)) {
        return false;
      }
      return !watchedIds.has(video.id);
    });
  };

  const filterDiscoveryLane = (items: VideoSummary[]) => {
    return items.filter((video) => {
      const published = video.publishedText?.toLowerCase() ?? "";
      const years = Number.parseInt(published.replace(/\D+/g, ""), 10);
      const isOld = published.includes("year") && Number.isFinite(years) && years > 4;
      const viewCountText = video.viewCountText?.toLowerCase() ?? "";
      const isClassic = viewCountText.includes("m") || viewCountText.includes("million");
      return !isOld || isClassic;
    });
  };

  const appendUniqueVideos = (currentVideos: VideoSummary[], newVideos: VideoSummary[]) => {
    const currentIds = new Set(currentVideos.map((video) => video.id));
    const recentChannels = new Set(
      currentVideos.slice(-8).map((video) => video.channelId ?? video.id),
    );

    const freshCandidates = preferSessionFreshVideos(newVideos);
    const fallbackCandidates = uniqueByVideoId(newVideos);

    const preferred = freshCandidates.filter((video) => {
      if (currentIds.has(video.id)) {
        return false;
      }
      const channelKey = video.channelId ?? video.id;
      return !recentChannels.has(channelKey);
    });

    const fallback = fallbackCandidates.filter((video) => !currentIds.has(video.id));
    return [...currentVideos, ...(preferred.length > 0 ? preferred : fallback)];
  };

  const mixRankedLanes = (
    discoveryLane: VideoSummary[],
    subscriptionLane: VideoSummary[],
    viralLane: VideoSummary[],
    quotas: FeedQuotas = STANDARD_DISCOVER_QUOTAS,
  ) => {
    const finalMix: VideoSummary[] = [];
    const usedVideos = new Set<string>();
    const recentChannels = new Set<string>();
    type LaneName = "subscriptions" | "discovery" | "viral";
    const queues = {
      discovery: [...discoveryLane],
      subscriptions: [...subscriptionLane],
      viral: [...viralLane],
    };
    const targets: Record<LaneName, number> = {
      subscriptions: quotas.subscriptionLimit,
      discovery: quotas.discoveryLimit,
      viral: quotas.viralLimit,
    };
    const counts: Record<LaneName, number> = {
      subscriptions: 0,
      discovery: 0,
      viral: 0,
    };
    const targetTotal = Math.max(
      1,
      quotas.subscriptionLimit + quotas.discoveryLimit + quotas.viralLimit,
    );

    const pushUnique = (candidate?: VideoSummary, relaxChannel = false) => {
      if (!candidate || usedVideos.has(candidate.id)) {
        return false;
      }
      const channelKey = candidate.channelId ?? candidate.id;
      if (!relaxChannel && recentChannels.has(channelKey) && finalMix.length > 0) {
        return false;
      }
      finalMix.push(candidate);
      usedVideos.add(candidate.id);
      recentChannels.add(channelKey);
      if (recentChannels.size > 6) {
        const firstIndex = finalMix.length - 6;
        const firstCandidate = firstIndex >= 0 ? finalMix[firstIndex] : undefined;
        const first = firstCandidate?.channelId ?? firstCandidate?.id;
        if (first) {
          recentChannels.delete(first);
        }
      }
      return true;
    };

    const pushFromLane = (lane: LaneName) => {
      const queue = queues[lane];
      const attempts = queue.length;
      const deferred: VideoSummary[] = [];

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const candidate = queue.shift();
        if (!candidate) {
          break;
        }
        if (pushUnique(candidate)) {
          queue.push(...deferred);
          return true;
        }
        if (!usedVideos.has(candidate.id)) {
          deferred.push(candidate);
        }
      }

      for (const candidate of deferred) {
        if (pushUnique(candidate, true)) {
          queue.push(...deferred.filter((item) => item.id !== candidate.id));
          return true;
        }
      }

      queue.push(...deferred);
      return false;
    };

    while (finalMix.length < targetTotal) {
      const underTarget = (["subscriptions", "discovery", "viral"] as LaneName[])
        .filter((lane) => queues[lane].length > 0)
        .filter((lane) => targets[lane] > 0 && counts[lane] < targets[lane]);
      const backfill = (["subscriptions", "discovery"] as LaneName[])
        .filter((lane) => queues[lane].length > 0);
      const candidates = underTarget.length > 0 ? underTarget : backfill;

      if (candidates.length === 0) {
        break;
      }

      candidates.sort((a, b) => {
        const ratioA = counts[a] / Math.max(targets[a], 1);
        const ratioB = counts[b] / Math.max(targets[b], 1);
        if (ratioA !== ratioB) {
          return ratioA - ratioB;
        }
        const priority: Record<LaneName, number> = {
          subscriptions: 0,
          discovery: 1,
          viral: 2,
        };
        return priority[a] - priority[b];
      });

      const lane = candidates[0];
      if (!lane) {
        break;
      }
      const pushed = pushFromLane(lane);
      if (pushed) {
        counts[lane] += 1;
      } else {
        queues[lane] = [];
      }
    }

    return finalMix.length > 0
      ? finalMix
      : interleaveByChannel([discoveryLane, subscriptionLane, viralLane]);
  };

  const interleaveByChannel = (lanes: VideoSummary[][]) => {
    const queues = lanes.map((lane) => [...lane]);
    const result: VideoSummary[] = [];
    const seenVideos = new Set<string>();
    const recentChannels: string[] = [];

    while (queues.some((queue) => queue.length > 0)) {
      let progressed = false;

      for (const queue of queues) {
        while (queue.length > 0) {
          const next = queue.shift()!;
          const channelKey = next.channelId ?? next.id;
          if (seenVideos.has(next.id)) {
            continue;
          }
          if (recentChannels.slice(-2).includes(channelKey) && queue.length > 0) {
            queue.push(next);
            break;
          }
          seenVideos.add(next.id);
          recentChannels.push(channelKey);
          if (recentChannels.length > 8) {
            recentChannels.shift();
          }
          result.push(next);
          progressed = true;
          break;
        }
      }

      if (!progressed) {
        for (const queue of queues) {
          const next = queue.shift();
          if (!next || seenVideos.has(next.id)) {
            continue;
          }
          seenVideos.add(next.id);
          result.push(next);
        }
      }
    }

    return result;
  };

  const loadSubscriptions = async (): Promise<string[]> => {
    try {
      const subsJson = await getSetting("subscriptions");
      const subObjects = subsJson ? JSON.parse(subsJson) : [];
      if (!Array.isArray(subObjects)) {
        return [];
      }
      return subObjects
        .map((entry: unknown) => {
          if (typeof entry === "string") {
            return entry;
          }
          if (entry && typeof entry === "object" && "id" in entry) {
            return typeof (entry as { id?: unknown }).id === "string"
              ? (entry as { id: string }).id
              : "";
          }
          return "";
        })
        .filter((value): value is string => value.length > 0);
    } catch (dbErr: any) {
      console.warn("Subscriptions db fetch failed. Error:", dbErr?.message || dbErr);
      return [];
    }
  };

  const fetchDiscoveryPool = async (
    queryCandidates: string[],
    stage = "discovery-pool",
    queryLimit = 6,
  ) => {
    const queries = queryCandidates.slice(0, queryLimit);
    if (queries.length === 0) {
      logHomeFeed(stage, {
        queries,
        breakdown: [],
        uniqueCount: 0,
        sample: [],
      });
      return [];
    }

    const settled = await Promise.allSettled(
      queries.map((query) => searchVideos({ query })),
    );

    const queryBreakdown = queries.map((query, index) => {
      const result = settled[index];
      if (result?.status !== "fulfilled") {
        return { query, status: "rejected", count: 0 };
      }
      return { query, status: "fulfilled", count: result.value.items.length };
    });

    const pool = uniqueByVideoId(
      settled.flatMap((result) =>
        result.status === "fulfilled" ? result.value.items : [],
      ),
    );

    logHomeFeed(stage, {
      queries,
      breakdown: queryBreakdown,
      uniqueCount: pool.length,
      sample: summarizeVideosForLog(pool),
    });

    return pool;
  };

  const fetchWatchHistoryRelatedPool = async (history: WatchHistoryRecord[], seedLimit = 4) => {
    const seedVideoIds = uniqueByVideoId(
      history
        .filter((record) => {
          const total = record.totalDurationSeconds ?? 0;
          const ratio = total > 0 ? record.watchDurationSeconds / total : 0;
          return ratio >= 0.35 || record.watchDurationSeconds >= 180;
        })
        .map((record) => ({
          id: record.videoId,
          title: record.title,
          channelName: record.channelName ?? "",
        }) as VideoSummary),
    )
      .slice(0, seedLimit)
      .map((record) => record.id);

    if (seedVideoIds.length === 0) {
      return [];
    }

    const settled = await Promise.allSettled(
      seedVideoIds.map((videoId) => getRelatedVideos(videoId)),
    );

    return uniqueByVideoId(
      settled.flatMap((result) => {
        if (result.status !== "fulfilled") {
          return [];
        }

        return result.value
          .filter((item) => item.itemType === "video" && !item.isMix)
          .map((item) => ({
            id: item.videoId ?? item.id,
            title: item.title,
            channelName: item.channelName,
            channelId: item.channelId ?? null,
            thumbnailUrl: item.thumbnailUrl ?? null,
            durationSeconds: item.durationSeconds ?? null,
            publishedText: item.publishedText ?? null,
            viewCountText: item.viewCountText ?? null,
          } satisfies VideoSummary));
      }),
    );
  };

  const getChannelVideosHelper = async (channelId: string) => {
    const res = await getChannelTab(channelId);
    return {
      channelId: res.channelId,
      videos: res.items.filter(i => i.type === 'video') as VideoSummary[],
      nextPageToken: res.nextPageToken
    };
  };

  const fetchSubscriptionPool = async (subscriptionIds: string[], channelLimit = 6) => {
    if (subscriptionIds.length === 0) {
      return [];
    }

    const settled = await Promise.allSettled(
      subscriptionIds.slice(0, channelLimit).map((channelId) => getChannelVideosHelper(channelId)),
    );

    return uniqueByVideoId(
      settled.flatMap((result) =>
        result.status === "fulfilled" ? result.value.videos : [],
      ),
    );
  };

  const fetchSubscriptionBatchPool = async (channelIds: string[]) => {
    if (channelIds.length === 0) {
      return [];
    }

    const settled = await Promise.allSettled(
      channelIds.map((channelId) => getChannelVideosHelper(channelId)),
    );

    return uniqueByVideoId(
      settled.flatMap((result) =>
        result.status === "fulfilled" ? result.value.videos : [],
      ),
    );
  };

  const fetchSubscriptionRotationPool = async () => {
    try {
      return uniqueByVideoId(await getSubscriptionRotationFeed());
    } catch (error) {
      console.warn("Failed to load subscription rotation feed", error);
      return [];
    }
  };

  const fetchPersonalizedMusicPool = async () => {
    try {
      return uniqueByVideoId(await getPersonalizedMusicRecommendations(12));
    } catch (error) {
      console.warn("Failed to load personalized music candidates", error);
      return [];
    }
  };

  const getRotatedSubscriptionBatch = (subscriptionIds: string[], batchSize: number) => {
    if (subscriptionIds.length === 0 || batchSize <= 0) {
      return [];
    }

    const result: string[] = [];
    const start = subscriptionIndexRef.current % subscriptionIds.length;
    const limit = Math.min(batchSize, subscriptionIds.length);
    for (let offset = 0; offset < limit; offset += 1) {
      const channelId = subscriptionIds[(start + offset) % subscriptionIds.length];
      if (channelId) {
        result.push(channelId);
      }
    }

    subscriptionIndexRef.current = (start + limit) % subscriptionIds.length;
    return result;
  };

  const fetchTrendingPool = async () => {
    try {
      const trending = await getTrendingVideos();
      if (trending.length > 0) {
        return trending;
      }
    } catch (err: any) {
      console.warn("Live trending api failed, falling back to search-based viral pool.", err?.message || err);
    }

    const settled = await Promise.allSettled([
      searchVideos({ query: "trending" }),
      searchVideos({ query: "viral videos" }),
      searchVideos({ query: "popular now" }),
    ]);

    const fallbackTrending = uniqueByVideoId(
      settled.flatMap((result) =>
        result.status === "fulfilled" ? result.value.items : [],
      ),
    );

    return fallbackTrending;
  };

  const handleLoadMore = async () => {
    if (
      activeTab !== "discover" ||
      loadingMoreRef.current ||
      initialDiscoverHydratingRef.current ||
      loadingMore ||
      loading ||
      !hasMoreDiscover
    ) {
      return;
    }
    if (Date.now() < loadMoreBackoffUntilRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      let queryPool = discoveryQueriesRef.current;
      if (queryPool.length === 0 || discoveryIndexRef.current >= queryPool.length) {
        queryPool = await withTimeout(
          generateDiscoveryQueries(),
          5000,
          [] as string[],
          "load-more-query-refresh",
        );
        discoveryQueriesRef.current = queryPool;
        discoveryIndexRef.current = 0;
        logHomeFeed("load-more-refresh-discovery-queries", {
          queryPool,
          queryCount: queryPool.length,
        });
      }

      const queryA = queryPool[discoveryIndexRef.current];
      const queryB = queryPool[discoveryIndexRef.current + 1];
      const queryC = queryPool[discoveryIndexRef.current + 2];
      discoveryIndexRef.current += 3;

      const searchQueries = [queryA, queryB, queryC].filter(
        (query): query is string => typeof query === "string" && query.length > 0,
      );
      const finalQueries = searchQueries;
      const subscriptionBatchIds = getRotatedSubscriptionBatch(subscriptionIdsRef.current, 3);
      logHomeFeed("load-more-inputs", {
        queryPoolSize: queryPool.length,
        discoveryIndex: discoveryIndexRef.current,
        finalQueries,
        subscriptionBatchIds,
      });

      const [rawDiscoveryVideos, rawSubscriptionVideos, subscriptionRotationVideos, personalizedMusicVideos, relatedVideos] = await Promise.all([
        withTimeout(
          fetchDiscoveryPool(finalQueries, "load-more-discovery-pool", 3),
          LOAD_MORE_SOURCE_TIMEOUT_MS,
          [] as VideoSummary[],
          "load-more-discovery",
        ),
        withTimeout(
          fetchSubscriptionBatchPool(subscriptionBatchIds),
          LOAD_MORE_SOURCE_TIMEOUT_MS,
          [] as VideoSummary[],
          "load-more-subscription-batch",
        ),
        withTimeout(
          fetchSubscriptionRotationPool(),
          LOAD_MORE_SOURCE_TIMEOUT_MS,
          [] as VideoSummary[],
          "load-more-subscription-rotation",
        ),
        withTimeout(
          fetchPersonalizedMusicPool(),
          LOAD_MORE_MUSIC_TIMEOUT_MS,
          [] as VideoSummary[],
          "load-more-personalized-music",
        ),
        withTimeout(
          fetchWatchHistoryRelatedPool(watchHistoryRef.current, 2),
          LOAD_MORE_SOURCE_TIMEOUT_MS,
          [] as VideoSummary[],
          "load-more-related",
        ),
      ]);

      const filteredDiscovery = filterDiscoveryLane(
        preferSessionFreshVideos(
          filterFeedVideos([...personalizedMusicVideos, ...relatedVideos, ...rawDiscoveryVideos], watchedIdsRef.current),
        ),
      );
      const filteredSubscriptions = preferSessionFreshVideos(
        filterFeedVideos([...subscriptionRotationVideos, ...rawSubscriptionVideos], watchedIdsRef.current),
      );

      logHomeFeed("load-more-pools", {
        finalQueries,
        rawDiscoveryCount: rawDiscoveryVideos.length,
        rawSubscriptionCount: rawSubscriptionVideos.length,
        subscriptionRotationCount: subscriptionRotationVideos.length,
        personalizedMusicCount: personalizedMusicVideos.length,
        relatedCount: relatedVideos.length,
        filteredDiscoveryCount: filteredDiscovery.length,
        filteredSubscriptionCount: filteredSubscriptions.length,
        filteredDiscoverySample: summarizeVideosForLog(filteredDiscovery),
      });

      if (filteredDiscovery.length === 0 && filteredSubscriptions.length === 0) {
        loadMoreMissesRef.current += 1;
        loadMoreBackoffUntilRef.current = Date.now() + Math.min(8000, 1500 * loadMoreMissesRef.current);
        logHomeFeed("load-more-empty", {
          finalQueries,
          subscriptionBatchIds,
          misses: loadMoreMissesRef.current,
        });
        return;
      }

      const [rankedSubscriptions, rankedDiscovery] = await Promise.all([
        filteredSubscriptions.length > 0
          ? withTimeout(
              rankVideos(filteredSubscriptions, subscriptionIdsRef.current),
              5000,
              filteredSubscriptions,
              "load-more-rank-subscriptions",
            ).then((items) => items.slice(0, 8))
          : Promise.resolve([]),
        filteredDiscovery.length > 0
          ? withTimeout(
              rankVideos(filteredDiscovery, subscriptionIdsRef.current),
              5000,
              filteredDiscovery,
              "load-more-rank-discovery",
            ).then((items) => items.slice(0, 12))
          : Promise.resolve([]),
      ]);

      const dedupedBatch = mixRankedLanes(rankedDiscovery, rankedSubscriptions, []);
      logHomeFeed("load-more-ranked", {
        rankedDiscoveryCount: rankedDiscovery.length,
        rankedSubscriptionCount: rankedSubscriptions.length,
        appendedCandidateCount: dedupedBatch.length,
        sample: summarizeVideosForLog(dedupedBatch),
      });

      let appendedVideos: VideoSummary[] = [];
      setVideos((currentVideos) => {
        const nextVideos = appendUniqueVideos(currentVideos, dedupedBatch);
        appendedVideos = nextVideos.slice(currentVideos.length);
        if (activeTab === "discover") {
          updateCache("discover", nextVideos);
        }
        return nextVideos;
      });

      if (appendedVideos.length > 0) {
        loadMoreMissesRef.current = 0;
        loadMoreBackoffUntilRef.current = 0;
        setHasMoreDiscover(true);
        rememberSeenVideos(appendedVideos);
        logHomeFeed("load-more-appended", {
          appendedCount: appendedVideos.length,
          sample: summarizeVideosForLog(appendedVideos),
        });
        void recordFeedImpressions(appendedVideos.slice(0, 12)).catch((error) => {
          console.warn("Failed to record appended feed impressions", error);
        });
      } else {
        loadMoreMissesRef.current += 1;
        loadMoreBackoffUntilRef.current = Date.now() + Math.min(8000, 1500 * loadMoreMissesRef.current);
        if (discoveryIndexRef.current >= discoveryQueriesRef.current.length) {
          discoveryQueriesRef.current = [];
          discoveryIndexRef.current = 0;
        }
        logHomeFeed("load-more-no-append", {
          dedupedBatchCount: dedupedBatch.length,
          misses: loadMoreMissesRef.current,
        });
      }
    } catch (error) {
      console.warn("Failed to load more videos", error);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const buildDiscoverFeedFromPools = async (
    pools: {
      subscriptionPool: VideoSummary[];
      subscriptionRotationPool: VideoSummary[];
      discoveryPool: VideoSummary[];
      relatedPool: VideoSummary[];
      personalizedMusicPool: VideoSummary[];
      viralPool: VideoSummary[];
    },
    watchedIds: Set<string>,
    subscriptionIds: string[],
    feedQuotas: FeedQuotas,
    rankTimeoutMs?: number,
    rankLabelPrefix = "discover",
  ) => {
    const filteredSubscriptions = preferSessionFreshVideos(
      filterFeedVideos([...pools.subscriptionRotationPool, ...pools.subscriptionPool], watchedIds),
    );
    const filteredDiscovery = filterDiscoveryLane(
      preferSessionFreshVideos(
        filterFeedVideos([...pools.personalizedMusicPool, ...pools.relatedPool, ...pools.discoveryPool], watchedIds),
      ),
    );

    const rankLane = async (
      lane: VideoSummary[],
      limit: number,
      label: string,
    ) => {
      if (lane.length === 0 || limit <= 0) {
        return [];
      }

      const fallback = lane.slice(0, limit);
      const ranked = rankVideos(lane, subscriptionIds).then((items) => items.slice(0, limit));
      return rankTimeoutMs
        ? withTimeout(ranked, rankTimeoutMs, fallback, `${rankLabelPrefix}-rank-${label}`)
        : ranked;
    };

    let rankedLanes: [VideoSummary[], VideoSummary[], VideoSummary[]];
    try {
      const [bestSubscriptions, bestDiscovery, bestViral] = await Promise.all([
        rankLane(filteredSubscriptions, feedQuotas.subscriptionLimit, "subscriptions"),
        rankLane(filteredDiscovery, feedQuotas.discoveryLimit, "discovery"),
        rankLane(pools.viralPool, feedQuotas.viralLimit, "viral"),
      ]);
      rankedLanes = [bestSubscriptions, bestDiscovery, bestViral];
    } catch (rankErr: any) {
      console.warn("Ranking engine failed, displaying baseline feed. Error:", rankErr?.message || rankErr);
      rankedLanes = [
        filteredSubscriptions.slice(0, feedQuotas.subscriptionLimit),
        filteredDiscovery.slice(0, feedQuotas.discoveryLimit),
        pools.viralPool.slice(0, feedQuotas.viralLimit),
      ];
    }

    return {
      filteredSubscriptions,
      filteredDiscovery,
      rankedLanes,
      mixedFeed: mixRankedLanes(rankedLanes[1], rankedLanes[0], rankedLanes[2], feedQuotas),
    };
  };

  const buildStarterDiscoverFeed = async (
    starterRotationPool: VideoSummary[],
    starterDiscoveryPool: VideoSummary[],
    watchedIds: Set<string>,
    subscriptionIds: string[],
    feedQuotas: FeedQuotas,
    rankLabelPrefix = "starter",
  ) => {
    const starterSubscriptions = preferSessionFreshVideos(
      filterFeedVideos(starterRotationPool, watchedIds),
    );
    const starterDiscovery = filterDiscoveryLane(
      preferSessionFreshVideos(
        filterFeedVideos(starterDiscoveryPool, watchedIds)
          .filter((video) => !isDiscoverJunkVideo(video)),
      ),
    );

    const starterQuotas: FeedQuotas = {
      ...feedQuotas,
      subscriptionLimit: Math.min(feedQuotas.subscriptionLimit, 8),
      discoveryLimit: Math.min(feedQuotas.discoveryLimit, 12),
      viralLimit: 0,
      viralPercent: 0,
    };

    const [rankedStarterSubscriptions, rankedStarterDiscovery] = await Promise.all([
      starterSubscriptions.length > 0
        ? withTimeout(
            rankVideos(starterSubscriptions, subscriptionIds),
            1800,
            starterSubscriptions,
            `${rankLabelPrefix}-rank-subscriptions`,
          ).then((items) => items.slice(0, starterQuotas.subscriptionLimit))
        : Promise.resolve([]),
      starterDiscovery.length > 0
        ? withTimeout(
            rankVideos(starterDiscovery, subscriptionIds),
            1800,
            starterDiscovery,
            `${rankLabelPrefix}-rank-discovery`,
          ).then((items) => items.slice(0, starterQuotas.discoveryLimit))
        : Promise.resolve([]),
    ]);

    return {
      starterSubscriptions,
      starterDiscovery,
      rankedStarterSubscriptions,
      rankedStarterDiscovery,
      starterFeed: mixRankedLanes(
        rankedStarterDiscovery,
        rankedStarterSubscriptions,
        [],
        starterQuotas,
      ),
    };
  };

  const fetchFeed = async (isRefresh = false) => {
    const requestId = ++requestSequenceRef.current;
    let renderedInitialFeed = false;
    initialDiscoverHydratingRef.current = activeTab === "discover";
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    if (!isRefresh) {
      const cached = getFreshCachedFeed(activeTab);
      if (cached) {
        setVideos(cached);
        videosRef.current = cached;
        rememberSeenVideos(cached);
        renderedInitialFeed = true;
        setLoading(false);
      }
    }

    try {
      const [subscriptionIds, watchedHistory, queryCandidates, feedQuotas] = await Promise.all([
        loadSubscriptions(),
        getWatchHistory(200, 0),
        generateDiscoveryQueries(),
        getFeedQuotas(),
      ]);
      const watchedIds = getMostlyWatchedIds(watchedHistory);
      subscriptionIdsRef.current = subscriptionIds;
      subscriptionIndexRef.current = subscriptionIds.length === 0 ? 0 : Math.min(subscriptionIds.length, 6) % subscriptionIds.length;
      watchHistoryRef.current = watchedHistory;
      watchedIdsRef.current = watchedIds;
      discoveryQueriesRef.current = queryCandidates;
      discoveryIndexRef.current = 3;
      loadMoreMissesRef.current = 0;
      loadMoreBackoffUntilRef.current = 0;
      setHasMoreDiscover(true);
      logHomeFeed("initial-inputs", {
        activeTab,
        requestId,
        isRefresh,
        subscriptions: subscriptionIds.length,
        watchHistory: watchedHistory.length,
        watchedIds: watchedIds.size,
        queryCandidates,
        feedQuotas,
      });
      if (requestSequenceRef.current !== requestId) {
        return;
      }
      if (activeTab === "trending") {
        initialDiscoverHydratingRef.current = false;
        const trendingList = preferSessionFreshVideos(
          filterFeedVideos(await fetchTrendingPool(), watchedIds),
          12,
        );
        if (requestSequenceRef.current !== requestId) {
          return;
        }
        logHomeFeed("trending-feed", {
          trendingCount: trendingList.length,
          finalCount: trendingList.length,
          sample: summarizeVideosForLog(trendingList),
        });
        setVideos(trendingList);
        videosRef.current = trendingList;
        rememberSeenVideos(trendingList);
        updateCache("trending", trendingList);
      } else {
        const starterRotationPoolPromise = fetchSubscriptionRotationPool();
        const starterDiscoveryPoolPromise = fetchDiscoveryPool(queryCandidates, "discovery-starter-pool", 2);
        const [starterRotationPool, starterDiscoveryPool] = await Promise.all([
          withTimeout(
            starterRotationPoolPromise,
            STARTER_SUBSCRIPTION_TIMEOUT_MS,
            [] as VideoSummary[],
            "starter-subscription-rotation",
          ),
          withTimeout(
            starterDiscoveryPoolPromise,
            STARTER_DISCOVERY_TIMEOUT_MS,
            [] as VideoSummary[],
            "starter-discovery",
          ),
        ]);

        const starterResult = await buildStarterDiscoverFeed(
          starterRotationPool,
          starterDiscoveryPool,
          watchedIds,
          subscriptionIds,
          feedQuotas,
        );

        if (starterResult.starterFeed.length > 0) {
          if (requestSequenceRef.current !== requestId) {
            return;
          }
          logHomeFeed("discover-starter-feed", {
            starterSubscriptions: starterResult.rankedStarterSubscriptions.length,
            starterDiscovery: starterResult.rankedStarterDiscovery.length,
            starterFeedCount: starterResult.starterFeed.length,
            sample: summarizeVideosForLog(starterResult.starterFeed),
          });
          setVideos(starterResult.starterFeed);
          videosRef.current = starterResult.starterFeed;
          rememberSeenVideos(starterResult.starterFeed);
          renderedInitialFeed = true;
          setLoading(false);
        } else if (requestSequenceRef.current === requestId) {
          logHomeFeed("discover-starter-empty", {
            starterSubscriptions: starterResult.starterSubscriptions.length,
            starterDiscovery: starterResult.starterDiscovery.length,
          });

          if (!renderedInitialFeed && videosRef.current.length === 0) {
            const [lateStarterRotationPool, lateStarterDiscoveryPool] = await Promise.all([
              withTimeout(
                starterRotationPoolPromise,
                STARTER_EMPTY_RESCUE_TIMEOUT_MS,
                [] as VideoSummary[],
                "starter-subscription-rotation-rescue",
              ),
              withTimeout(
                starterDiscoveryPoolPromise,
                STARTER_EMPTY_RESCUE_TIMEOUT_MS,
                [] as VideoSummary[],
                "starter-discovery-rescue",
              ),
            ]);
            const lateStarterResult = await buildStarterDiscoverFeed(
              lateStarterRotationPool,
              lateStarterDiscoveryPool,
              watchedIds,
              subscriptionIds,
              feedQuotas,
              "starter-rescue",
            );

            logHomeFeed("discover-starter-rescue", {
              starterSubscriptions: lateStarterResult.rankedStarterSubscriptions.length,
              starterDiscovery: lateStarterResult.rankedStarterDiscovery.length,
              starterFeedCount: lateStarterResult.starterFeed.length,
              sample: summarizeVideosForLog(lateStarterResult.starterFeed),
            });

            if (requestSequenceRef.current !== requestId) {
              return;
            }
            if (lateStarterResult.starterFeed.length > 0) {
              setVideos(lateStarterResult.starterFeed);
              videosRef.current = lateStarterResult.starterFeed;
              rememberSeenVideos(lateStarterResult.starterFeed);
              renderedInitialFeed = true;
              setLoading(false);
            }
          }
        }

        const subscriptionPoolPromise = fetchSubscriptionPool(subscriptionIds, 3);
        const subscriptionRotationPoolPromise = fetchSubscriptionRotationPool();
        const discoveryPoolPromise = fetchDiscoveryPool(queryCandidates, "discovery-pool", 4);
        const relatedPoolPromise = fetchWatchHistoryRelatedPool(watchedHistory, 2);
        const personalizedMusicPoolPromise = fetchPersonalizedMusicPool();

        const [subscriptionPool, subscriptionRotationPool, discoveryPool, relatedPool, personalizedMusicPool] = await Promise.all([
          withTimeout(subscriptionPoolPromise, FULL_DISCOVER_SOURCE_TIMEOUT_MS, [] as VideoSummary[], "subscriptions"),
          withTimeout(subscriptionRotationPoolPromise, FULL_DISCOVER_SOURCE_TIMEOUT_MS, [] as VideoSummary[], "subscription-rotation"),
          withTimeout(discoveryPoolPromise, FULL_DISCOVER_SOURCE_TIMEOUT_MS, [] as VideoSummary[], "discovery"),
          withTimeout(relatedPoolPromise, FULL_DISCOVER_SOURCE_TIMEOUT_MS, [] as VideoSummary[], "related"),
          withTimeout(personalizedMusicPoolPromise, FULL_DISCOVER_SOURCE_TIMEOUT_MS, [] as VideoSummary[], "personalized-music"),
        ]);

        const viralPool = feedQuotas.viralLimit > 0
          ? preferSessionFreshVideos(
              filterFeedVideos(
                await withTimeout(fetchTrendingPool(), VIRAL_FALLBACK_TIMEOUT_MS, [] as VideoSummary[], "viral-fallback"),
                watchedIds,
              )
                .filter((video) => !isDiscoverJunkVideo(video)),
              feedQuotas.viralLimit,
            )
          : [];
        const discoverFeed = await buildDiscoverFeedFromPools(
          {
            subscriptionPool,
            subscriptionRotationPool,
            discoveryPool,
            relatedPool,
            personalizedMusicPool,
            viralPool,
          },
          watchedIds,
          subscriptionIds,
          feedQuotas,
          8000,
        );

        logHomeFeed("discover-pools", {
          queryCandidates,
          subscriptionPool: subscriptionPool.length,
          subscriptionRotationPool: subscriptionRotationPool.length,
          discoveryPool: discoveryPool.length,
          relatedPool: relatedPool.length,
          personalizedMusicPool: personalizedMusicPool.length,
          filteredSubscriptions: discoverFeed.filteredSubscriptions.length,
          filteredDiscovery: discoverFeed.filteredDiscovery.length,
          discoverySample: summarizeVideosForLog(discoverFeed.filteredDiscovery),
          subscriptionSample: summarizeVideosForLog(discoverFeed.filteredSubscriptions),
          viralSample: summarizeVideosForLog(viralPool),
          feedQuotas,
        });

        logHomeFeed("discover-ranked", {
          rankedSubscriptions: discoverFeed.rankedLanes[0].length,
          rankedDiscovery: discoverFeed.rankedLanes[1].length,
          rankedViral: discoverFeed.rankedLanes[2].length,
          feedQuotas,
          mixedFeedCount: discoverFeed.mixedFeed.length,
          finalFeedSample: summarizeVideosForLog(discoverFeed.mixedFeed),
        });
        if (requestSequenceRef.current !== requestId) {
          return;
        }
        if (discoverFeed.mixedFeed.length > 0) {
          setVideos(discoverFeed.mixedFeed);
          videosRef.current = discoverFeed.mixedFeed;
          rememberSeenVideos(discoverFeed.mixedFeed);
          updateCache("discover", discoverFeed.mixedFeed);
          setHasMoreDiscover(true);
        } else {
          logHomeFeed("discover-ranked-empty-keep-current", {
            queryCandidates,
            feedQuotas,
          });
          if (!renderedInitialFeed && videosRef.current.length === 0) {
            logHomeFeed("discover-empty-rescue-start", {
              queryCandidates,
              timeoutMs: DISCOVER_EMPTY_RESCUE_TIMEOUT_MS,
            });

            const [
              rescuedSubscriptionPool,
              rescuedSubscriptionRotationPool,
              rescuedDiscoveryPool,
              rescuedRelatedPool,
              rescuedPersonalizedMusicPool,
            ] = await Promise.all([
              withTimeout(subscriptionPoolPromise, DISCOVER_EMPTY_RESCUE_TIMEOUT_MS, [] as VideoSummary[], "subscriptions-rescue"),
              withTimeout(subscriptionRotationPoolPromise, DISCOVER_EMPTY_RESCUE_TIMEOUT_MS, [] as VideoSummary[], "subscription-rotation-rescue"),
              withTimeout(discoveryPoolPromise, DISCOVER_EMPTY_RESCUE_TIMEOUT_MS, [] as VideoSummary[], "discovery-rescue"),
              withTimeout(relatedPoolPromise, DISCOVER_EMPTY_RESCUE_TIMEOUT_MS, [] as VideoSummary[], "related-rescue"),
              withTimeout(personalizedMusicPoolPromise, DISCOVER_EMPTY_RESCUE_TIMEOUT_MS, [] as VideoSummary[], "personalized-music-rescue"),
            ]);

            const rescuedViralPool = feedQuotas.viralLimit > 0
              ? preferSessionFreshVideos(
                  filterFeedVideos(
                    await withTimeout(fetchTrendingPool(), VIRAL_FALLBACK_TIMEOUT_MS, [] as VideoSummary[], "viral-fallback-rescue"),
                    watchedIds,
                  )
                    .filter((video) => !isDiscoverJunkVideo(video)),
                  feedQuotas.viralLimit,
                )
              : [];
            const rescuedFeed = await buildDiscoverFeedFromPools(
              {
                subscriptionPool: rescuedSubscriptionPool,
                subscriptionRotationPool: rescuedSubscriptionRotationPool,
                discoveryPool: rescuedDiscoveryPool,
                relatedPool: rescuedRelatedPool,
                personalizedMusicPool: rescuedPersonalizedMusicPool,
                viralPool: rescuedViralPool,
              },
              watchedIds,
              subscriptionIds,
              feedQuotas,
              8000,
              "discover-rescue",
            );

            logHomeFeed("discover-empty-rescue-ranked", {
              subscriptionPool: rescuedSubscriptionPool.length,
              subscriptionRotationPool: rescuedSubscriptionRotationPool.length,
              discoveryPool: rescuedDiscoveryPool.length,
              relatedPool: rescuedRelatedPool.length,
              personalizedMusicPool: rescuedPersonalizedMusicPool.length,
              filteredSubscriptions: rescuedFeed.filteredSubscriptions.length,
              filteredDiscovery: rescuedFeed.filteredDiscovery.length,
              rankedSubscriptions: rescuedFeed.rankedLanes[0].length,
              rankedDiscovery: rescuedFeed.rankedLanes[1].length,
              rankedViral: rescuedFeed.rankedLanes[2].length,
              mixedFeedCount: rescuedFeed.mixedFeed.length,
              sample: summarizeVideosForLog(rescuedFeed.mixedFeed),
            });

            if (requestSequenceRef.current !== requestId) {
              return;
            }
            if (rescuedFeed.mixedFeed.length > 0) {
              setVideos(rescuedFeed.mixedFeed);
              videosRef.current = rescuedFeed.mixedFeed;
              rememberSeenVideos(rescuedFeed.mixedFeed);
              updateCache("discover", rescuedFeed.mixedFeed);
              setHasMoreDiscover(true);
            }
          }
        }
      }
    } catch (e: any) {
      console.error("Failed to load feed. Error:", e?.message || e);
      if (requestSequenceRef.current === requestId) {
        setVideos([]);
        videosRef.current = [];
      }
    } finally {
      if (requestSequenceRef.current === requestId) {
        initialDiscoverHydratingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    if (didRequestInitialFeedRef.current) {
      return;
    }
    didRequestInitialFeedRef.current = true;
    void fetchFeed();
  }, [activeTab]);

  useEffect(() => {
    if (loading || videos.length === 0) {
      return;
    }

    const visibleVideos = videos.slice(0, 24);
    const signature = `${activeTab}:${visibleVideos.map((video) => video.id).join("|")}`;
    if (signature === lastImpressionSignatureRef.current) {
      return;
    }
    lastImpressionSignatureRef.current = signature;

    logHomeFeed("record-impressions", {
      activeTab,
      count: visibleVideos.length,
      sample: summarizeVideosForLog(visibleVideos),
    });

    void recordFeedImpressions(visibleVideos).catch((error) => {
      console.warn("Failed to record feed impressions", error);
    });
  }, [activeTab, loading, videos]);

  useEffect(() => {
    if (
      activeTab !== "discover" ||
      loading ||
      loadingMore ||
      !hasMoreDiscover ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const root = scrollContainerRef.current;
    const target = loadMoreSentinelRef.current;
    if (!root || !target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const shouldLoad = entries.some((entry) => entry.isIntersecting);
        if (shouldLoad) {
          void handleLoadMore();
        }
      },
      {
        root,
        rootMargin: "0px 0px 320px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [activeTab, hasMoreDiscover, loading, loadingMore, videos.length]);

  useEffect(() => {
    if (activeTab !== "discover" || loading || loadingMore || videos.length > 0) {
      return;
    }

    const retry = window.setTimeout(() => {
      void handleLoadMore();
    }, 500);

    return () => window.clearTimeout(retry);
  }, [activeTab, loading, loadingMore, videos.length]);

  const handlePlayVideo = async (video: VideoSummary) => {
    onPlay(video);
    try {
      await logInteraction(
        video.id,
        video.title,
        video.channelName,
        video.channelId ?? video.id,
        null,
        video.durationSeconds ?? null,
        false,
        (video.durationSeconds ?? 0) <= 60,
        "CLICK",
        0.0
      );
    } catch (err) {
      console.warn("Failed to log interaction", err);
    }
  };

  const handleMarkNotInterested = async (videoId: string) => {
    const dismissed = videos.find((video) => video.id === videoId);
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    try {
      await markNotInterested(
        videoId,
        dismissed?.title ?? "Dismiss Item",
        dismissed?.channelName ?? "Dismissed Channel",
        dismissed?.channelId ?? videoId,
        null,
        dismissed?.durationSeconds ?? null,
        false,
        false,
      );
    } catch (err) {
      console.warn("Failed to log dismissal", err);
    }
  };

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
      {/* Grid List layout */}
      {loading ? (
        <VideoGrid loading={true} onPlay={handlePlayVideo} />
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-800 rounded-3xl p-8 bg-zinc-900/10">
          <h3 className="font-bold text-zinc-300">No content found</h3>
          <p className="text-zinc-500 text-xs mt-1 max-w-sm">
            Try playing some videos or searching to help the recommendation engine learn your profile
          </p>
        </div>
      ) : (
        <>
          <VideoGrid
            videos={videos}
            onPlay={handlePlayVideo}
            onAddToQueue={onAddToQueue}
            onMarkNotInterested={handleMarkNotInterested}
          />

          {activeTab === "discover" && (
            <div className="flex flex-col items-center gap-3 pb-20">
              <div ref={loadMoreSentinelRef} className="h-px w-full" />
              <button
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-red-400" />
                    Loading more
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    Load more
                  </>
                )}
              </button>
              {!loadingMore && (
                <p className="text-xs text-zinc-500">
                  More recommendations load automatically as you scroll.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Home;
