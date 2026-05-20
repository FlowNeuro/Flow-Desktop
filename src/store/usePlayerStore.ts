import { create } from "zustand";
import type { VideoSummary } from "../types/video";
import { getMusicLyrics, getMusicRelated } from "../lib/api/youtube";

export type PlaybackRate = 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;
export type RepeatMode = "none" | "one" | "all";
export type PlayMode = "video" | "music";

interface PlayerState {
  currentVideo: VideoSummary | null;
  isPlaying: boolean;
  volume: number;
  playbackRate: PlaybackRate;
  queue: VideoSummary[];
  currentIndex: number;
  lyrics: string | null;
  lyricsLoading: boolean;
  related: VideoSummary[];
  relatedLoading: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  playMode: PlayMode;
  currentTime: number;
  duration: number;
  
  setCurrentVideo: (video: VideoSummary | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (playbackRate: PlaybackRate) => void;
  setQueue: (queue: VideoSummary[], startIndex?: number) => void;
  addToQueue: (video: VideoSummary) => void;
  removeFromQueue: (index: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  setPlayMode: (mode: PlayMode) => void;
  loadTrackMetadata: (videoId: string) => Promise<void>;
  clearQueue: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentVideo: null,
  isPlaying: false,
  volume: 1,
  playbackRate: 1,
  queue: [],
  currentIndex: -1,
  lyrics: null,
  lyricsLoading: false,
  related: [],
  relatedLoading: false,
  repeatMode: "none",
  isShuffle: false,
  playMode: "video",
  currentTime: 0,
  duration: 0,

  setCurrentVideo: (video) => {
    const isNew = get().currentVideo?.id !== video?.id;
    set({ currentVideo: video, isPlaying: !!video });
    
    if (video && isNew) {
      // Auto-detect player mode from thumbnail/genre or keep user's mode
      const isSong = video.viewCountText === "Song" || video.viewCountText === "Album Track" || video.channelName.toLowerCase().includes("topic") || video.durationSeconds && video.durationSeconds < 360;
      set({ playMode: isSong ? "music" : "video" });
      
      // Load lyrics and related tracks in the background
      get().loadTrackMetadata(video.id);
    }
  },

  setIsPlaying: (isPlaying) => set({ isPlaying }),

  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),

  setPlaybackRate: (playbackRate) => set({ playbackRate }),

  setQueue: (queue, startIndex = 0) => {
    set({
      queue,
      currentIndex: startIndex,
      currentVideo: queue[startIndex] || null,
      isPlaying: queue.length > 0,
    });
    if (queue[startIndex]) {
      get().loadTrackMetadata(queue[startIndex].id);
    }
  },

  addToQueue: (video) => {
    const { queue } = get();
    if (queue.some((item) => item.id === video.id)) return;
    set({ queue: [...queue, video] });
  },

  removeFromQueue: (index) => {
    const { queue, currentIndex } = get();
    const newQueue = queue.filter((_, i) => i !== index);
    let newIndex = currentIndex;
    if (index < currentIndex) {
      newIndex = currentIndex - 1;
    } else if (index === currentIndex) {
      newIndex = Math.min(currentIndex, newQueue.length - 1);
    }
    set({
      queue: newQueue,
      currentIndex: newIndex,
      currentVideo: newQueue[newIndex] || null,
    });
  },

  playNext: () => {
    const { queue, currentIndex, repeatMode } = get();
    if (queue.length === 0) return;

    if (repeatMode === "one") {
      // Repeat track: just replay current video
      const current = queue[currentIndex];
      if (current) {
        set({ currentVideo: null });
        setTimeout(() => set({ currentVideo: current, isPlaying: true }), 50);
      }
      return;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      const nextItem = queue[nextIndex];
      if (nextItem) {
        set({ currentIndex: nextIndex, currentVideo: nextItem, isPlaying: true });
        get().loadTrackMetadata(nextItem.id);
      }
    } else if (repeatMode === "all") {
      const firstItem = queue[0];
      if (firstItem) {
        set({ currentIndex: 0, currentVideo: firstItem, isPlaying: true });
        get().loadTrackMetadata(firstItem.id);
      }
    } else {
      set({ isPlaying: false });
    }
  },

  playPrevious: () => {
    const { queue, currentIndex } = get();
    if (queue.length === 0) return;

    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      const prevItem = queue[prevIndex];
      if (prevItem) {
        set({ currentIndex: prevIndex, currentVideo: prevItem, isPlaying: true });
        get().loadTrackMetadata(prevItem.id);
      }
    } else {
      // Wrap around to end
      const lastIndex = queue.length - 1;
      const lastItem = queue[lastIndex];
      if (lastItem) {
        set({ currentIndex: lastIndex, currentVideo: lastItem, isPlaying: true });
        get().loadTrackMetadata(lastItem.id);
      }
    }
  },

  setRepeatMode: (repeatMode) => set({ repeatMode }),

  toggleShuffle: () => {
    const { isShuffle, queue, currentVideo } = get();
    if (!isShuffle) {
      // Shuffle active: randomly rearrange queue but keep currentVideo at index 0
      const filtered = queue.filter((item) => item.id !== currentVideo?.id);
      const shuffled = [...filtered].sort(() => Math.random() - 0.5);
      const newQueue = currentVideo ? [currentVideo, ...shuffled] : shuffled;
      set({ isShuffle: true, queue: newQueue, currentIndex: currentVideo ? 0 : -1 });
    } else {
      set({ isShuffle: false });
    }
  },

  setPlayMode: (playMode) => set({ playMode }),

  loadTrackMetadata: async (videoId) => {
    set({ lyricsLoading: true, relatedLoading: true, lyrics: null, related: [] });
    try {
      const [lyricsRes, relatedRes] = await Promise.all([
        getMusicLyrics(videoId),
        getMusicRelated(videoId),
      ]);
      set({
        lyrics: lyricsRes,
        related: relatedRes,
        lyricsLoading: false,
        relatedLoading: false,
      });
    } catch (e) {
      console.error("Failed to load track metadata", e);
      set({ lyricsLoading: false, relatedLoading: false });
    }
  },

  clearQueue: () => set({ queue: [], currentIndex: -1, currentVideo: null, isPlaying: false, currentTime: 0, duration: 0 }),
  
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
}));
