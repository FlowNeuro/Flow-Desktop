import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { getSetting, setSetting, addWatchRecord } from "../lib/api/db";
import {
  logInteraction,
  markNotInterested,
  blockChannel as apiBlockChannel,
} from "../lib/api/recommendation";
import { shouldRecordWatchHistory } from "../lib/deepFlow";
import type { VideoSummary } from "../types/video";

// Global recommendation-feedback state shared by every video card, mirroring the mobile
// FeedInvalidationBus: card menus call the actions here, and feeds filter against the sets, so a
// dismiss/block/watch takes effect everywhere instantly and persists across restarts.
const STORE_KEY = "feed_actions_state_v1";
const DISMISSED_CAP = 2000;
const BLOCKED_CAP = 500;
const SUPPRESSED_CHANNEL_CAP = 500;
const WATCHED_CAP = 2000;
const CHANNEL_SUPPRESSION_MS = 14 * 24 * 60 * 60 * 1000;

interface FeedActionsState {
  dismissedVideoIds: Set<string>;
  blockedChannelIds: Set<string>;
  suppressedChannelIds: Map<string, number>;
  watchedVideoIds: Set<string>;
  loaded: boolean;
  load: () => Promise<void>;
  notInterested: (video: VideoSummary) => Promise<void>;
  blockChannel: (video: VideoSummary) => Promise<void>;
  markWatched: (video: VideoSummary) => Promise<void>;
  moreLikeThis: (video: VideoSummary) => Promise<void>;
}

function addCapped(set: Set<string>, value: string, cap: number): Set<string> {
  if (!value || set.has(value)) return set;
  const next = new Set(set);
  next.add(value);
  // Set preserves insertion order, so slicing the tail keeps the most recent entries.
  return next.size > cap ? new Set([...next].slice(next.size - cap)) : next;
}

function addCappedMap(
  map: Map<string, number>,
  key: string,
  value: number,
  cap: number,
): Map<string, number> {
  if (!key) return map;
  const next = new Map(map);
  next.set(key, value);
  return next.size > cap ? new Map([...next].slice(next.size - cap)) : next;
}

export function cleanChannelId(channelId?: string | null) {
  return (channelId ?? "").replace(/^channel:/, "").trim();
}

function activeSuppressedChannels(entries: Map<string, number>) {
  const cutoff = Date.now() - CHANNEL_SUPPRESSION_MS;
  return new Map([...entries].filter(([, timestamp]) => timestamp >= cutoff));
}

function meta(video: VideoSummary) {
  const duration = video.durationSeconds ?? null;
  return {
    channelId: cleanChannelId(video.channelId),
    duration,
    isShort: (duration ?? 0) > 0 && (duration ?? 0) <= 60,
  };
}

export const useFeedActionsStore = create<FeedActionsState>((set, get) => {
  const persist = () => {
    const { dismissedVideoIds, blockedChannelIds, suppressedChannelIds, watchedVideoIds } = get();
    const activeSuppressed = activeSuppressedChannels(suppressedChannelIds);
    void setSetting(
      STORE_KEY,
      JSON.stringify({
        dismissed: [...dismissedVideoIds],
        blocked: [...blockedChannelIds],
        suppressedChannels: [...activeSuppressed.entries()],
        watched: [...watchedVideoIds],
      }),
    ).catch((e) => console.warn("Failed to persist feed actions", e));
  };

  return {
    dismissedVideoIds: new Set(),
    blockedChannelIds: new Set(),
    suppressedChannelIds: new Map(),
    watchedVideoIds: new Set(),
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const raw = await getSetting(STORE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            dismissed?: string[];
            blocked?: string[];
            suppressedChannels?: [string, number][] | Record<string, number>;
            watched?: string[];
          };
          const rawSuppressed = parsed.suppressedChannels;
          const suppressedEntries = Array.isArray(rawSuppressed)
            ? rawSuppressed
            : Object.entries(rawSuppressed ?? {});
          set({
            dismissedVideoIds: new Set(parsed.dismissed ?? []),
            blockedChannelIds: new Set((parsed.blocked ?? []).map(cleanChannelId).filter(Boolean)),
            suppressedChannelIds: activeSuppressedChannels(
              new Map(
                suppressedEntries
                  .map(([channelId, timestamp]) => [cleanChannelId(channelId), Number(timestamp)] as const)
                  .filter(([channelId, timestamp]) => channelId.length > 0 && Number.isFinite(timestamp)),
              ),
            ),
            watchedVideoIds: new Set(parsed.watched ?? []),
            loaded: true,
          });
          return;
        }
      } catch (e) {
        console.warn("Failed to load feed actions", e);
      }
      set({ loaded: true });
    },

    notInterested: async (video) => {
      const m = meta(video);
      set((s) => ({
        dismissedVideoIds: addCapped(s.dismissedVideoIds, video.id, DISMISSED_CAP),
        suppressedChannelIds: m.channelId
          ? addCappedMap(s.suppressedChannelIds, m.channelId, Date.now(), SUPPRESSED_CHANNEL_CAP)
          : s.suppressedChannelIds,
      }));
      persist();
      try {
        await markNotInterested(
          video.id,
          video.title,
          video.channelName,
          m.channelId,
          null,
          m.duration,
          false,
          m.isShort,
        );
      } catch (e) {
        console.warn("Failed to record not interested", e);
      }
    },

    blockChannel: async (video) => {
      const channelId = cleanChannelId(video.channelId);
      if (!channelId) return;
      set((s) => ({ blockedChannelIds: addCapped(s.blockedChannelIds, channelId, BLOCKED_CAP) }));
      persist();
      try {
        await apiBlockChannel(channelId);
      } catch (e) {
        console.warn("Failed to block channel", e);
      }
    },

    markWatched: async (video) => {
      set((s) => ({ watchedVideoIds: addCapped(s.watchedVideoIds, video.id, WATCHED_CAP) }));
      persist();
      const m = meta(video);
      try {
        await logInteraction(
          video.id,
          video.title,
          video.channelName,
          m.channelId,
          null,
          m.duration,
          false,
          m.isShort,
          "WATCHED",
          1.0,
        );
        if (shouldRecordWatchHistory()) {
          await addWatchRecord({
            videoId: video.id,
            title: video.title,
            channelName: video.channelName,
            channelId: video.channelId ?? null,
            watchDate: new Date().toISOString(),
            watchDurationSeconds: m.duration ?? 0,
            totalDurationSeconds: m.duration ?? 0,
          });
        }
      } catch (e) {
        console.warn("Failed to mark watched", e);
      }
    },

    moreLikeThis: async (video) => {
      const m = meta(video);
      try {
        await logInteraction(
          video.id,
          video.title,
          video.channelName,
          m.channelId,
          null,
          m.duration,
          false,
          m.isShort,
          "LIKED",
          1.0,
        );
      } catch (e) {
        console.warn("Failed to record more like this", e);
      }
    },
  };
});

/// Reactive predicate for feeds: true when a video should be hidden (dismissed, watched, or its
/// channel blocked). Subscribes to the sets so feeds re-filter the instant an action fires.
export function useFeedHiddenFilter({ hideWatched = true }: { hideWatched?: boolean } = {}) {
  const dismissed = useFeedActionsStore((s) => s.dismissedVideoIds);
  const blocked = useFeedActionsStore((s) => s.blockedChannelIds);
  const suppressed = useFeedActionsStore((s) => s.suppressedChannelIds);
  const watched = useFeedActionsStore((s) => s.watchedVideoIds);
  const activeSuppressed = useMemo(() => activeSuppressedChannels(suppressed), [suppressed]);
  return useCallback(
    (video: VideoSummary) => {
      if (dismissed.has(video.id) || (hideWatched && watched.has(video.id))) return true;
      const channelId = cleanChannelId(video.channelId);
      return channelId.length > 0 && (blocked.has(channelId) || activeSuppressed.has(channelId));
    },
    [dismissed, blocked, activeSuppressed, watched, hideWatched],
  );
}
