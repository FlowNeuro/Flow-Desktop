import { create } from "zustand";
import type { CaptionTrack, VideoSummary } from "../types/video";
import { getMusicLyrics, getMusicRelated } from "../lib/api/youtube";

import type { SponsorBlockSegment, DeArrowOverride, RydData } from "../lib/api/foss";

export type PlaybackRate = number;
export type RepeatMode = "none" | "one" | "all";
export type PlayMode = "video" | "music";

export interface SubtitleStyle {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  isBold: boolean;
  bottomPadding: number;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 18,
  textColor: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 0.75,
  isBold: true,
  bottomPadding: 32,
};

const getSavedSubtitleStyle = (): SubtitleStyle => {
  try {
    const saved = localStorage.getItem("flow_subtitle_style");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to parse saved subtitle style", e);
  }
  return DEFAULT_SUBTITLE_STYLE;
};

const getSavedTheaterMode = (): boolean => {
  try {
    return localStorage.getItem("flow_theater_mode") === "true";
  } catch (e) {
    console.error("Failed to load saved theater mode", e);
  }
  return false;
};

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

  isTheaterMode: boolean;
  sponsorBlockSegments: SponsorBlockSegment[];
  dearrowData: DeArrowOverride | null;
  rydData: RydData | null;
  captions: CaptionTrack[];

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

  setIsTheaterMode: (isTheaterMode: boolean) => void;
  setSponsorBlockSegments: (segments: SponsorBlockSegment[]) => void;
  setDearrowData: (data: DeArrowOverride | null) => void;
  setRydData: (data: RydData | null) => void;
  setCaptions: (captions: CaptionTrack[]) => void;
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: (style: SubtitleStyle) => void;
  isChaptersPanelOpen: boolean;
  setIsChaptersPanelOpen: (open: boolean) => void;
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

  isTheaterMode: getSavedTheaterMode(),
  sponsorBlockSegments: [],
  dearrowData: null,
  rydData: null,
  captions: [],
  isChaptersPanelOpen: false,

  setCurrentVideo: (video) => {
    const isNew = get().currentVideo?.id !== video?.id;
    set({
      currentVideo: video,
      isPlaying: !!video,
      isChaptersPanelOpen: false,
      ...(isNew ? { currentTime: 0, duration: video?.durationSeconds ?? 0 } : {}),
    });
    
    if (video && isNew) {
      const isSong = video.viewCountText === "Song" || video.viewCountText === "Album Track" || video.channelName.toLowerCase().includes("topic") || video.durationSeconds && video.durationSeconds < 360;
      set({ playMode: isSong ? "music" : "video" });
      
      get().loadTrackMetadata(video.id);
    }
  },

  setIsPlaying: (isPlaying) => set({ isPlaying }),

  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),

  setPlaybackRate: (playbackRate) => set({ playbackRate: Math.min(4, Math.max(0.25, playbackRate)) }),

  setQueue: (queue, startIndex = 0) => {
    const nextVideo = queue[startIndex] || null;
    set({
      queue,
      currentIndex: startIndex,
      currentVideo: nextVideo,
      isPlaying: queue.length > 0,
      currentTime: 0,
      duration: nextVideo?.durationSeconds ?? 0,
    });
    if (nextVideo) {
      get().loadTrackMetadata(nextVideo.id);
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
        set({
          currentIndex: nextIndex,
          currentVideo: nextItem,
          isPlaying: true,
          currentTime: 0,
          duration: nextItem.durationSeconds ?? 0,
        });
        get().loadTrackMetadata(nextItem.id);
      }
    } else if (repeatMode === "all") {
      const firstItem = queue[0];
      if (firstItem) {
        set({
          currentIndex: 0,
          currentVideo: firstItem,
          isPlaying: true,
          currentTime: 0,
          duration: firstItem.durationSeconds ?? 0,
        });
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
        set({
          currentIndex: prevIndex,
          currentVideo: prevItem,
          isPlaying: true,
          currentTime: 0,
          duration: prevItem.durationSeconds ?? 0,
        });
        get().loadTrackMetadata(prevItem.id);
      }
    } else {
      const lastIndex = queue.length - 1;
      const lastItem = queue[lastIndex];
      if (lastItem) {
        set({
          currentIndex: lastIndex,
          currentVideo: lastItem,
          isPlaying: true,
          currentTime: 0,
          duration: lastItem.durationSeconds ?? 0,
        });
        get().loadTrackMetadata(lastItem.id);
      }
    }
  },

  setRepeatMode: (repeatMode) => set({ repeatMode }),

  toggleShuffle: () => {
    const { isShuffle, queue, currentVideo } = get();
    if (!isShuffle) {
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

  setIsTheaterMode: (isTheaterMode) => {
    localStorage.setItem("flow_theater_mode", String(isTheaterMode));
    set({ isTheaterMode });
  },
  setSponsorBlockSegments: (sponsorBlockSegments) => set({ sponsorBlockSegments }),
  setDearrowData: (dearrowData) => set({ dearrowData }),
  setRydData: (rydData) => set({ rydData }),
  setCaptions: (captions) => set({ captions }),
  setIsChaptersPanelOpen: (isChaptersPanelOpen) => set({ isChaptersPanelOpen }),
  subtitleStyle: getSavedSubtitleStyle(),
  setSubtitleStyle: (style) => {
    localStorage.setItem("flow_subtitle_style", JSON.stringify(style));
    set({ subtitleStyle: style });
  },
}));
