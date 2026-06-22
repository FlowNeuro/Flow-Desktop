import { useCallback, useEffect, useRef, useState } from "react";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { getShortsFeed, loadMoreShorts, resetShortsFeed } from "./api/shorts";
import type { ShortItem, ShortsFeed } from "../types/shorts";

function currentSubIds(): string[] {
  return useSubscriptionStore.getState().subscriptions.map((s) => s.id);
}

const inFlightFeeds = new Map<string, Promise<ShortsFeed>>();
function dedupedGetFeed(subs: string[], seedId?: string): Promise<ShortsFeed> {
  const key = seedId ?? "__home__";
  const existing = inFlightFeeds.get(key);
  if (existing) return existing;
  const request = getShortsFeed(subs, seedId).finally(() => inFlightFeeds.delete(key));
  inFlightFeeds.set(key, request);
  return request;
}

function defaultSeedShort(seedId: string): ShortItem {
  return {
    id: seedId,
    title: "Short",
    channelName: "",
    channelId: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${seedId}/oar2.jpg`,
    channelAvatarUrl: null,
    viewCountText: null,
    likeCountText: null,
    commentCountText: null,
    publishedText: null,
    sequenceParams: null,
  };
}

function initialItems(seedItem: ShortItem | null, initialQueue?: ShortItem[] | null): ShortItem[] {
  const queued = initialQueue?.filter((item) => item.id) ?? [];
  if (!seedItem) return queued;
  if (queued.some((item) => item.id === seedItem.id)) return queued;
  return [seedItem, ...queued];
}

function mergeInitialItems(items: ShortItem[], initial: ShortItem[]): ShortItem[] {
  if (initial.length === 0) return items;
  const seen = new Set(initial.map((item) => item.id));
  const fresh = items.filter((item) => !seen.has(item.id));
  return [...initial, ...fresh];
}

export function useShortsFeed(
  seedId?: string,
  initialSeedItem?: ShortItem | null,
  initialQueue?: ShortItem[] | null,
  queueOnly = false,
) {
  const [items, setItems] = useState<ShortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continuationRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const seedFallback = initialSeedItem ?? (seedId ? defaultSeedShort(seedId) : null);
    const queuedItems = initialItems(seedFallback, initialQueue);
    setLoading(true);
    setError(null);
    seenIdsRef.current = new Set();
    queuedItems.forEach((item) => seenIdsRef.current.add(item.id));
    setItems(queuedItems);
    if (queueOnly && queuedItems.length > 0) {
      continuationRef.current = null;
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    dedupedGetFeed(currentSubIds(), seedId)
      .then((feed) => {
        if (cancelled) return;
        console.log("[shorts] feed loaded:", feed.items.length, "items, continuation:", feed.continuation);
        const mergedItems = mergeInitialItems(feed.items, queuedItems);
        mergedItems.forEach((s) => seenIdsRef.current.add(s.id));
        setItems(mergedItems);
        continuationRef.current = feed.continuation;
      })
      .catch((e) => {
        console.error("[shorts] feed error:", e);
        if (!cancelled) {
          if (queuedItems.length > 0) {
            queuedItems.forEach((item) => seenIdsRef.current.add(item.id));
            setItems(queuedItems);
          }
          setError(String(e));
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [seedId, initialSeedItem, initialQueue, queueOnly]);

  const loadMore = useCallback(async () => {
    if (queueOnly) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoadingMore(true);
    try {
      const feed = await loadMoreShorts(currentSubIds(), continuationRef.current);
      continuationRef.current = feed.continuation;
      const fresh = feed.items.filter((s) => !seenIdsRef.current.has(s.id));
      if (fresh.length) {
        fresh.forEach((s) => seenIdsRef.current.add(s.id));
        setItems((prev) => [...prev, ...fresh]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      inFlightRef.current = false;
      setLoadingMore(false);
    }
  }, [queueOnly]);

  const reset = useCallback(() => {
    void resetShortsFeed();
  }, []);

  return { items, loading, loadingMore, error, loadMore, reset };
}
