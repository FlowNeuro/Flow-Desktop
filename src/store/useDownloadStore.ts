import { create } from "zustand";

import type { SongItem } from "../types/music";
import type { VideoSummary } from "../types/video";
import type { DownloadProgress } from "../lib/api/downloads";

type DownloadDialogTarget =
  | { kind: "video"; video: VideoSummary }
  | { kind: "music"; track: SongItem }
  | { kind: "activity"; id: string };

interface DownloadState {
  dialog: DownloadDialogTarget | null;
  active: Record<string, DownloadProgress>;
  openVideo: (video: VideoSummary) => void;
  openMusic: (track: SongItem) => void;
  openActivity: (id: string) => void;
  closeDialog: () => void;
  updateProgress: (progress: DownloadProgress) => void;
  dismissProgress: (id: string) => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  dialog: null,
  active: {},
  openVideo: (video) => set({ dialog: { kind: "video", video } }),
  openMusic: (track) => set({ dialog: { kind: "music", track } }),
  openActivity: (id) => set({ dialog: { kind: "activity", id } }),
  closeDialog: () => set({ dialog: null }),
  updateProgress: (progress) =>
    set((state) => ({
      active: {
        ...state.active,
        [progress.id]: progress,
      },
    })),
  dismissProgress: (id) =>
    set((state) => {
      const active = { ...state.active };
      delete active[id];
      return { active };
    }),
}));
