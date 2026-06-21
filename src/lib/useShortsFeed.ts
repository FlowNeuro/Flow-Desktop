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

export function useShortsFeed(seedId?: string) {
  const [items, setItems] = useState<ShortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continuationRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    seenIdsRef.current = new Set();
    dedupedGetFeed(currentSubIds(), seedId)
      .then((feed) => {
        if (cancelled) return;
        console.log("[shorts] feed loaded:", feed.items.length, "items, continuation:", feed.continuation);
        feed.items.forEach((s) => seenIdsRef.current.add(s.id));
        setItems(feed.items);
        continuationRef.current = feed.continuation;
      })
      .catch((e) => {
        console.error("[shorts] feed error:", e);
        if (!cancelled) setError(String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [seedId]);

  const loadMore = useCallback(async () => {
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
  }, []);

  const reset = useCallback(() => {
    void resetShortsFeed();
  }, []);

  return { items, loading, loadingMore, error, loadMore, reset };
}
