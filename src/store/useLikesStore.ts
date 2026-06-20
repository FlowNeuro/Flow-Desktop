import { create } from "zustand";
import { getSetting, setSetting } from "../lib/api/db";
import type { SongItem } from "../types/music";
import type { VideoSummary } from "../types/video";

export const LIKES_LIBRARY_UPDATED_EVENT = "flow:likes-library-updated";
const LIKES_SETTING_KEY = "liked_items";

export type LikedItemKind = "video" | "music";

export interface LikedVideoItem {
  kind: "video";
  id: string;
  likedAt: string;
  video: VideoSummary;
}

export interface LikedMusicItem {
  kind: "music";
  id: string;
  likedAt: string;
  song: SongItem;
}

export type LikedItem = LikedVideoItem | LikedMusicItem;

const songId = (song: SongItem) => song.videoId ?? song.id;
const itemKey = (kind: LikedItemKind, id: string) => `${kind}:${id}`;

function normalizeItems(items: LikedItem[]) {
  return [...items].sort((a, b) => Date.parse(b.likedAt) - Date.parse(a.likedAt));
}

async function persist(items: LikedItem[]) {
  await setSetting(LIKES_SETTING_KEY, JSON.stringify(normalizeItems(items)));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LIKES_LIBRARY_UPDATED_EVENT));
  }
}

interface LikesState {
  items: LikedItem[];
  loaded: boolean;
  load: () => Promise<void>;
  isLikedVideo: (videoId: string) => boolean;
  isLikedSong: (song: SongItem) => boolean;
  toggleVideo: (video: VideoSummary) => Promise<boolean>;
  toggleSong: (song: SongItem) => Promise<boolean>;
  remove: (kind: LikedItemKind, id: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useLikesStore = create<LikesState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await getSetting(LIKES_SETTING_KEY);
      const parsed = raw ? (JSON.parse(raw) as LikedItem[]) : [];
      set({ items: normalizeItems(Array.isArray(parsed) ? parsed : []), loaded: true });
    } catch (error) {
      console.warn("Failed to load likes", error);
      set({ loaded: true });
    }
  },

  isLikedVideo: (videoId) => get().items.some((item) => (
    item.kind === "video" && item.id === videoId
  )),

  isLikedSong: (song) => {
    const id = songId(song);
    return get().items.some((item) => item.kind === "music" && item.id === id);
  },

  toggleVideo: async (video) => {
    await get().load();
    const key = itemKey("video", video.id);
    const exists = get().items.some((item) => itemKey(item.kind, item.id) === key);
    const next = exists
      ? get().items.filter((item) => itemKey(item.kind, item.id) !== key)
      : [
          {
            kind: "video" as const,
            id: video.id,
            likedAt: new Date().toISOString(),
            video,
          },
          ...get().items,
        ];
    set({ items: normalizeItems(next) });
    await persist(next);
    return !exists;
  },

  toggleSong: async (song) => {
    await get().load();
    const id = songId(song);
    const key = itemKey("music", id);
    const exists = get().items.some((item) => itemKey(item.kind, item.id) === key);
    const next = exists
      ? get().items.filter((item) => itemKey(item.kind, item.id) !== key)
      : [
          {
            kind: "music" as const,
            id,
            likedAt: new Date().toISOString(),
            song,
          },
          ...get().items,
        ];
    set({ items: normalizeItems(next) });
    await persist(next);
    return !exists;
  },

  remove: async (kind, id) => {
    await get().load();
    const key = itemKey(kind, id);
    const next = get().items.filter((item) => itemKey(item.kind, item.id) !== key);
    set({ items: normalizeItems(next) });
    await persist(next);
  },

  clear: async () => {
    set({ items: [] });
    await persist([]);
  },
}));
