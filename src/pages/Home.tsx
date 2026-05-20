import React, { useRef, useState, useEffect } from "react";
import { Sparkles, Loader2, ChevronDown } from "lucide-react";
import { getChannelVideos, getTrendingVideos, searchVideos } from "../lib/api/youtube";
import {
  generateDiscoveryQueries,
  markNotInterested,
  recordFeedImpressions,
  rankVideos,
  logInteraction,
} from "../lib/api/recommendation";
import { getSetting, getWatchHistory } from "../lib/api/db";
import type { VideoSummary } from "../types/video";
import type { WatchHistoryRecord } from "../types/db";
import { VideoGrid } from "../components/video/VideoGrid";

interface HomeProps {
  onPlay: (video: VideoSummary) => void;
  onAddToQueue: (video: VideoSummary) => void;
}

const FALLBACK_VIDEOS: VideoSummary[] = [
  {
    id: "dQw4w9WgXcQ",
    title: "Building an Offline Recommendation Engine with Rust & SQLite",
    channelName: "Fireship",
    thumbnailUrl: "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=300",
    durationSeconds: 156,
    publishedText: "3 days ago",
    viewCountText: "235K views",
  },
  {
    id: "3s7h2tqD9oI",
    title: "Astrophysics Masterclass: Understanding the Quantum Field",
    channelName: "Veritasium",
    thumbnailUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=300",
    durationSeconds: 980,
    publishedText: "1 week ago",
    viewCountText: "1.2M views",
  },
  {
    id: "9T8y3H1xQ4s",
    title: "Cosmic Lo-Fi Session: Music to Code/Relax/Study",
    channelName: "Lofi Girl",
    thumbnailUrl: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?q=80&w=300",
    durationSeconds: 18000,
    publishedText: "Live Now",
    viewCountText: "45K watching",
  },
  {
    id: "6H7J8K9L0M1",
    title: "Designing Material 3 Systems for Desktop Applications",
    channelName: "Google Design",
    thumbnailUrl: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?q=80&w=300",
    durationSeconds: 642,
    publishedText: "2 weeks ago",
    viewCountText: "85K views",
  },
  {
    id: "y8Y9z0A1B2C",
    title: "Rust Concurrency Deep-Dive: Channels & Mutexes",
    channelName: "Jon Gjengset",
    thumbnailUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=300",
    durationSeconds: 7200,
    publishedText: "5 days ago",
    viewCountText: "120K views",
  },
  {
    id: "d3E4f5G6h7I",
    title: "Ambient Landscapes: Chill Synthwave Sessions",
    channelName: "Synthwave Odyssey",
    thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300",
    durationSeconds: 10800,
    publishedText: "3 months ago",
    viewCountText: "1.8M views",
  }
];

const HOME_FEED_CACHE_TTL_MS = 30 * 60 * 1000;
const SESSION_SEEN_VIDEO_LIMIT = 500;

const homeFeedCache: Record<"discover" | "trending", { videos: VideoSummary[]; timestamp: number }> = {
  discover: { videos: [], timestamp: 0 },
  trending: { videos: [], timestamp: 0 },
};

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
  const discoveryQueriesRef = useRef<string[]>([]);
  const discoveryIndexRef = useRef(0);
  const subscriptionIdsRef = useRef<string[]>([]);
  const subscriptionIndexRef = useRef(0);
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

  const getFreshCachedFeed = (tab: "discover" | "trending") => {
    const cache = homeFeedCache[tab];
    if (cache.videos.length === 0) {
      return null;
    }
    if ((Date.now() - cache.timestamp) > HOME_FEED_CACHE_TTL_MS) {
      return null;
    }

    const minimumCount = tab === "discover" ? 12 : 8;
    const sessionFresh = preferSessionFreshVideos(cache.videos, minimumCount);
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
  ) => {
    const finalMix: VideoSummary[] = [];
    const usedVideos = new Set<string>();
    const recentChannels = new Set<string>();
    const queues = {
      discovery: [...discoveryLane],
      subscriptions: [...subscriptionLane],
      viral: [...viralLane],
    };

    const pushUnique = (candidate?: VideoSummary) => {
      if (!candidate || usedVideos.has(candidate.id)) {
        return;
      }
      const channelKey = candidate.channelId ?? candidate.id;
      if (recentChannels.has(channelKey) && finalMix.length > 0) {
        return;
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
    };

    while (
      queues.discovery.length > 0 ||
      queues.subscriptions.length > 0 ||
      queues.viral.length > 0
    ) {
      pushUnique(queues.discovery.shift());
      pushUnique(queues.subscriptions.shift());
      pushUnique(queues.discovery.shift());
      pushUnique(queues.viral.shift());

      if (queues.discovery.length === 0 && queues.subscriptions.length === 0 && queues.viral.length === 0) {
        break;
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

  const fetchDiscoveryPool = async (queryCandidates: string[]) => {
    const queries = queryCandidates.length > 0
      ? queryCandidates.slice(0, 3)
      : ["technology", "music", "gaming"];

    const settled = await Promise.allSettled(
      queries.map((query) => searchVideos({ query })),
    );

    return uniqueByVideoId(
      settled.flatMap((result) =>
        result.status === "fulfilled" ? result.value.items : [],
      ),
    );
  };

  const fetchSubscriptionPool = async (subscriptionIds: string[]) => {
    if (subscriptionIds.length === 0) {
      return [];
    }

    const settled = await Promise.allSettled(
      subscriptionIds.slice(0, 6).map((channelId) => getChannelVideos(channelId)),
    );

    return uniqueByVideoId(
      settled.flatMap((result) =>
        result.status === "fulfilled" ? result.value.videos : [],
      ),
    );
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

    return fallbackTrending.length > 0 ? fallbackTrending : FALLBACK_VIDEOS;
  };

  const handleLoadMore = async () => {
    if (activeTab !== "discover" || loadingMoreRef.current || loadingMore || loading || !hasMoreDiscover) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      let queryPool = discoveryQueriesRef.current;
      if (queryPool.length === 0 || discoveryIndexRef.current >= queryPool.length) {
        queryPool = await generateDiscoveryQueries();
        discoveryQueriesRef.current = queryPool;
        discoveryIndexRef.current = 0;
      }

      const queryA = queryPool[discoveryIndexRef.current];
      const queryB = queryPool[discoveryIndexRef.current + 1];
      discoveryIndexRef.current += 2;

      const searchQueries = [queryA, queryB].filter(
        (query): query is string => typeof query === "string" && query.length > 0,
      );
      const finalQueries = searchQueries.length > 0 ? searchQueries : ["viral"];
      const subscriptionBatchIds = getRotatedSubscriptionBatch(subscriptionIdsRef.current, 3);

      const searchSettled = await Promise.allSettled(
        finalQueries.map((query) => searchVideos({ query })),
      );
      const subscriptionSettled = await Promise.allSettled(
        subscriptionBatchIds.map((channelId) => getChannelVideos(channelId)),
      );

      const rawDiscoveryVideos = searchSettled.flatMap((result) =>
        result.status === "fulfilled" ? result.value.items : [],
      );
      const rawSubscriptionVideos = subscriptionSettled.flatMap((result) =>
        result.status === "fulfilled" ? result.value.videos : [],
      );

      const filteredDiscovery = filterDiscoveryLane(
        preferSessionFreshVideos(
          filterFeedVideos(rawDiscoveryVideos, watchedIdsRef.current),
        ),
      );
      const filteredSubscriptions = preferSessionFreshVideos(
        filterFeedVideos(rawSubscriptionVideos, watchedIdsRef.current),
      );

      if (filteredDiscovery.length === 0 && filteredSubscriptions.length === 0) {
        setHasMoreDiscover(false);
        return;
      }

      const [rankedSubscriptions, rankedDiscovery] = await Promise.all([
        filteredSubscriptions.length > 0
          ? rankVideos(filteredSubscriptions, subscriptionIdsRef.current).then((items) => items.slice(0, 8))
          : Promise.resolve([]),
        filteredDiscovery.length > 0
          ? rankVideos(filteredDiscovery, subscriptionIdsRef.current).then((items) => items.slice(0, 12))
          : Promise.resolve([]),
      ]);

      const dedupedBatch = mixRankedLanes(rankedDiscovery, rankedSubscriptions, []);

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
        rememberSeenVideos(appendedVideos);
        void recordFeedImpressions(appendedVideos.slice(0, 12)).catch((error) => {
          console.warn("Failed to record appended feed impressions", error);
        });
      } else {
        setHasMoreDiscover(false);
      }
    } catch (error) {
      console.warn("Failed to load more videos", error);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const fetchFeed = async (isRefresh = false) => {
    const requestId = ++requestSequenceRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    if (!isRefresh) {
      const cached = getFreshCachedFeed(activeTab);
      if (cached) {
        setVideos(cached);
        rememberSeenVideos(cached);
        setLoading(false);
      }
    }

    try {
      const [subscriptionIds, watchedHistory, queryCandidates] = await Promise.all([
        loadSubscriptions(),
        getWatchHistory(200, 0),
        generateDiscoveryQueries(),
      ]);
      const watchedIds = getMostlyWatchedIds(watchedHistory);
      subscriptionIdsRef.current = subscriptionIds;
      subscriptionIndexRef.current = subscriptionIds.length === 0 ? 0 : Math.min(subscriptionIds.length, 6) % subscriptionIds.length;
      watchedIdsRef.current = watchedIds;
      discoveryQueriesRef.current = queryCandidates;
      discoveryIndexRef.current = 3;
      setHasMoreDiscover(true);
      const trendingPromise = fetchTrendingPool();

      if (activeTab === "trending") {
        const trendingList = preferSessionFreshVideos(
          filterFeedVideos(await trendingPromise, watchedIds),
          12,
        );
        if (requestSequenceRef.current !== requestId) {
          return;
        }
        const finalTrending = trendingList.length > 0 ? trendingList : FALLBACK_VIDEOS;
        setVideos(finalTrending);
        rememberSeenVideos(finalTrending);
        updateCache("trending", finalTrending);
      } else {
        const quickTrending = preferSessionFreshVideos(
          filterFeedVideos(await trendingPromise, watchedIds),
          18,
        );
        if (quickTrending.length > 0) {
          const quickFeed = (await rankVideos(quickTrending, subscriptionIds)).slice(0, 15);
          if (requestSequenceRef.current !== requestId) {
            return;
          }
          if (quickFeed.length > 0) {
            setVideos(quickFeed);
            rememberSeenVideos(quickFeed);
            setLoading(false);
          }
        }

        const [subscriptionPool, discoveryPool] = await Promise.all([
          fetchSubscriptionPool(subscriptionIds),
          fetchDiscoveryPool(queryCandidates),
        ]);

        const viralPool = quickTrending;
        const filteredSubscriptions = preferSessionFreshVideos(
          filterFeedVideos(subscriptionPool, watchedIds),
        );
        const filteredDiscovery = filterDiscoveryLane(
          preferSessionFreshVideos(
            filterFeedVideos(discoveryPool, watchedIds),
          ),
        );

        let rankedLanes: [VideoSummary[], VideoSummary[], VideoSummary[]];
        try {
          const [bestSubscriptions, bestDiscovery, bestViral] = await Promise.all([
            filteredSubscriptions.length > 0
              ? rankVideos(filteredSubscriptions, subscriptionIds).then((items) => items.slice(0, 10))
              : Promise.resolve([]),
            filteredDiscovery.length > 0
              ? rankVideos(filteredDiscovery, subscriptionIds).then((items) => items.slice(0, 15))
              : Promise.resolve([]),
            viralPool.length > 0
              ? rankVideos(viralPool, subscriptionIds).then((items) => items.slice(0, 10))
              : Promise.resolve([]),
          ]);
          rankedLanes = [bestSubscriptions, bestDiscovery, bestViral];
        } catch (rankErr: any) {
          console.warn("Ranking engine failed, displaying baseline feed. Error:", rankErr?.message || rankErr);
          rankedLanes = [filteredSubscriptions, filteredDiscovery, viralPool];
        }

        const mixedFeed = mixRankedLanes(rankedLanes[1], rankedLanes[0], rankedLanes[2]);
        if (requestSequenceRef.current !== requestId) {
          return;
        }
        const finalFeed = mixedFeed.length > 0 ? mixedFeed : FALLBACK_VIDEOS;
        setVideos(finalFeed);
        rememberSeenVideos(finalFeed);
        updateCache("discover", finalFeed);
      }
    } catch (e: any) {
      console.error("Failed to load feed. Error:", e?.message || e);
      if (requestSequenceRef.current === requestId) {
        setVideos(FALLBACK_VIDEOS);
        rememberSeenVideos(FALLBACK_VIDEOS);
      }
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchFeed();
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

  const handlePlayVideo = async (video: VideoSummary) => {
    onPlay(video);
    try {
      // Log interaction dynamically to refine recommendation matrix
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
          <Sparkles className="text-zinc-600 mb-4" size={48} />
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
                disabled={loadingMore || !hasMoreDiscover}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-red-400" />
                    Loading more
                  </>
                ) : hasMoreDiscover ? (
                  <>
                    <ChevronDown size={16} />
                    Load more
                  </>
                ) : (
                  "No more recommendations right now"
                )}
              </button>
              {hasMoreDiscover && !loadingMore && (
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
