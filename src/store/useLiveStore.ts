import { create } from "zustand";

interface LiveState {
  liveIds: Set<string>;
  markLive: (videoId: string) => void;
  isLive: (videoId: string) => boolean;
}

export const useLiveStore = create<LiveState>((set, get) => ({
  liveIds: new Set<string>(),
  markLive: (videoId) => {
    if (!videoId || get().liveIds.has(videoId)) return;
    set((state) => ({ liveIds: new Set(state.liveIds).add(videoId) }));
  },
  isLive: (videoId) => get().liveIds.has(videoId),
}));
