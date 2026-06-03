import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { getChannelDetails } from './api/youtube';

// ─── Shared singleton state ────────────────────────────────────

/** Resolved avatars: channelId → URL | null. */
const avatarCache = new Map<string, string | null>();

/** In-flight fetch promises keyed by channelId – deduplicates. */
const pendingFetches = new Map<string, Promise<string | null>>();

/** Queue of channelIds waiting to be fetched. */
let fetchQueue: string[] = [];

/** Drain timer handle. */
let drainTimer: ReturnType<typeof setTimeout> | null = null;

/** Monotonically increasing counter – bumped whenever the cache changes. */
let cacheVersion = 0;

/** Listeners that need to re-render when cacheVersion changes. */
const listeners = new Set<() => void>();

function notifyListeners() {
  cacheVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

function subscribeToCacheUpdates(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getCacheVersion() {
  return cacheVersion;
}

// ─── Validation ────────────────────────────────────────────────

function isValidAvatarUrl(url?: string | null): url is string {
  if (!url || !url.startsWith('http')) return false;
  // Reject video thumbnails that were accidentally stored as avatars
  if (/ytimg\.com\/vi\//i.test(url)) return false;
  return true;
}

// ─── Batch fetcher ─────────────────────────────────────────────

const MAX_CONCURRENT = 4;
let activeFetches = 0;

function fetchAvatarForChannel(channelId: string): Promise<string | null> {
  const existing = pendingFetches.get(channelId);
  if (existing) return existing;

  const promise = getChannelDetails(channelId)
    .then((details) => {
      const url = isValidAvatarUrl(details.avatarUrl) ? details.avatarUrl : null;
      avatarCache.set(channelId, url);
      notifyListeners();
      return url;
    })
    .catch(() => {
      avatarCache.set(channelId, null);
      notifyListeners();
      return null;
    })
    .finally(() => {
      pendingFetches.delete(channelId);
      activeFetches = Math.max(0, activeFetches - 1);
      drainQueue();
    });

  pendingFetches.set(channelId, promise);
  return promise;
}

function drainQueue() {
  while (fetchQueue.length > 0 && activeFetches < MAX_CONCURRENT) {
    const channelId = fetchQueue.shift()!;
    // Skip if already resolved or in-flight
    if (avatarCache.has(channelId) || pendingFetches.has(channelId)) continue;
    activeFetches += 1;
    fetchAvatarForChannel(channelId);
  }
}

function enqueueAvatarFetch(channelId: string) {
  if (avatarCache.has(channelId) || pendingFetches.has(channelId)) return;
  if (fetchQueue.includes(channelId)) return;
  fetchQueue.push(channelId);

  // Debounce drain to batch rapid mount calls
  if (drainTimer) clearTimeout(drainTimer);
  drainTimer = setTimeout(drainQueue, 50);
}

// ─── Public hook ───────────────────────────────────────────────

/**
 * Resolves a channel avatar URL by:
 * 1. Checking the subscription store (instant, free)
 * 2. Checking the in-memory cache
 * 3. Queueing a batched `getChannelDetails()` fetch (max 4 concurrent)
 *
 * Automatically re-renders when the avatar resolves.
 */
export function useChannelAvatar(
  channelId: string | null | undefined,
): string | null {
  const { subscriptions } = useSubscriptionStore();

  // Subscribe to cache updates for re-rendering when fetches complete
  useSyncExternalStore(subscribeToCacheUpdates, getCacheVersion);

  // Enqueue fetch if needed (inside effect to comply with React rules)
  useEffect(() => {
    if (!channelId) return;
    // Already resolved in cache
    if (avatarCache.has(channelId)) return;
    // Already available from subscriptions
    const sub = subscriptions.find((s) => s.id === channelId);
    if (sub && isValidAvatarUrl(sub.avatarUrl)) return;

    enqueueAvatarFetch(channelId);
  }, [channelId, subscriptions]);

  // ── Resolve synchronously ────────────────────────────────────
  if (!channelId) return null;

  // 1. Check subscription store
  const sub = subscriptions.find((s) => s.id === channelId);
  if (sub && isValidAvatarUrl(sub.avatarUrl)) {
    return sub.avatarUrl;
  }

  // 2. Check cache
  if (avatarCache.has(channelId)) {
    return avatarCache.get(channelId) ?? null;
  }

  return null;
}
