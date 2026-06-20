import { create } from "zustand";
import type { VideoSummary } from "../types/video";

interface PlaylistModalState {
  addTarget: VideoSummary | null;
  openAddToPlaylist: (video: VideoSummary) => void;
  closeAddToPlaylist: () => void;
}

export const usePlaylistModalStore = create<PlaylistModalState>((set) => ({
  addTarget: null,
  openAddToPlaylist: (video) => set({ addTarget: video }),
  closeAddToPlaylist: () => set({ addTarget: null }),
}));
