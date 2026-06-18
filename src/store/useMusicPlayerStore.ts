import { create } from "zustand";

import type { SongItem } from "../types/music";
import { getMusicStream, type MusicAudioQuality } from "../lib/api/music";
import { getBackendErrorMessage } from "../lib/api/errors";
import { musicAudioEngine } from "../lib/audio/musicAudioEngine";
import { SETTINGS } from "../lib/settings/schema";
import {
  EQ_FLAT,
  EQ_PRESETS,
  normalizeEqGains,
  type EqPresetName,
} from "../lib/audio/eqBands";
import { getSettingValue } from "./useAppSettingsStore";

export type MusicViewState = "dock" | "full" | "queue" | "lyrics";
export type MusicRepeatMode = "none" | "one" | "all";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const videoIdOf = (track: SongItem): string => track.videoId ?? track.id;

// --- persistence ---

const PERSIST_KEY = "flow_music_player";

interface PersistedMusicConfig {
  volume: number;
  isMuted: boolean;
  eqEnabled: boolean;
  eqGains: number[];
  normalizationEnabled: boolean;
  repeatMode: MusicRepeatMode;
  isShuffle: boolean;
}

const DEFAULT_CONFIG: PersistedMusicConfig = {
  volume: 1,
  isMuted: false,
  eqEnabled: false,
  eqGains: [...EQ_FLAT],
  normalizationEnabled: true,
  repeatMode: "none",
  isShuffle: false,
};

const loadConfig = (): PersistedMusicConfig => {
  try {
    const saved = localStorage.getItem(PERSIST_KEY);
    if (!saved) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(saved) as Partial<PersistedMusicConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      volume: clamp01(parsed.volume ?? DEFAULT_CONFIG.volume),
      eqGains: normalizeEqGains(parsed.eqGains),
    };
  } catch (error) {
    console.warn("Failed to load saved music player config", error);
    return { ...DEFAULT_CONFIG };
  }
};

const initialConfig = loadConfig();

const saveConfig = (get: () => MusicPlayerState) => {
  try {
    const s = get();
    const config: PersistedMusicConfig = {
      volume: s.volume,
      isMuted: s.isMuted,
      eqEnabled: s.eqEnabled,
      eqGains: s.eqGains,
      normalizationEnabled: s.normalizationEnabled,
      repeatMode: s.repeatMode,
      isShuffle: s.isShuffle,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn("Failed to save music player config", error);
  }
};

const pickRandomIndex = (length: number, exclude: number): number => {
  if (length <= 1) return 0;
  let next = exclude;
  while (next === exclude) next = Math.floor(Math.random() * length);
  return next;
};

const PLAYBACK_ERROR_FALLBACK = "Playback failed";
const MUSIC_AUDIO_QUALITY_VALUES = new Set(["Auto", "High", "Medium", "Low"]);

const getMusicAudioQualitySetting = (): MusicAudioQuality => {
  const value = getSettingValue(SETTINGS.MUSIC_AUDIO_QUALITY);
  return MUSIC_AUDIO_QUALITY_VALUES.has(value) ? (value as MusicAudioQuality) : "Auto";
};

interface MusicPlayerState {
  // --- now playing ---
  currentTrack: SongItem | null;
  queue: SongItem[];
  currentIndex: number;
  isPlaying: boolean;
  progress: number; // seconds
  duration: number; // seconds
  isBuffering: boolean;

  // --- audio config (persisted) ---
  volume: number; // 0..1
  isMuted: boolean;
  loudnessDb: number | null;
  normalizationEnabled: boolean;
  eqEnabled: boolean;
  eqGains: number[]; // 10 bands, dB

  // --- modes (persisted) ---
  repeatMode: MusicRepeatMode;
  isShuffle: boolean;

  // --- overlay / surface ---
  viewState: MusicViewState;

  // --- stream resolution ---
  loadingStreamId: string | null;
  streamError: string | null;

  // --- intents (called by UI) ---
  playTrack: (track: SongItem) => Promise<void>;
  playQueue: (tracks: SongItem[], startIndex?: number) => Promise<void>;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  dismiss: () => void;

  setVolume: (volume: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;

  addToQueue: (track: SongItem) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;

  setViewState: (view: MusicViewState) => void;
  openOverlay: (view?: Exclude<MusicViewState, "dock">) => void;
  closeOverlay: () => void;

  setEqEnabled: (enabled: boolean) => void;
  setEqBand: (index: number, gainDb: number) => void;
  setEqGains: (gains: number[]) => void;
  applyEqPreset: (name: EqPresetName) => void;
  setNormalizationEnabled: (enabled: boolean) => void;

  // --- internal: driven by the root <audio> controller (element → store) ---
  _loadIndex: (index: number) => Promise<void>;
  _syncTime: (progress: number, duration: number) => void;
  _reflectPlaying: (isPlaying: boolean) => void;
  _setBuffering: (isBuffering: boolean) => void;
  handleEnded: () => void;
  _onPlaybackError: () => void;
}

export const useMusicPlayerStore = create<MusicPlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  progress: 0,
  duration: 0,
  isBuffering: false,

  volume: initialConfig.volume,
  isMuted: initialConfig.isMuted,
  loudnessDb: null,
  normalizationEnabled: initialConfig.normalizationEnabled,
  eqEnabled: initialConfig.eqEnabled,
  eqGains: initialConfig.eqGains,

  repeatMode: initialConfig.repeatMode,
  isShuffle: initialConfig.isShuffle,

  viewState: "dock",

  loadingStreamId: null,
  streamError: null,

  // --- intents ----------------------------------------------------------

  playTrack: async (track) => {
    set({ queue: [track] });
    await get()._loadIndex(0);
  },

  playQueue: async (tracks, startIndex = 0) => {
    if (tracks.length === 0) return;
    set({ queue: tracks });
    await get()._loadIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));
  },

  _loadIndex: async (index) => {
    const track = get().queue[index];
    if (!track) return;
    const videoId = videoIdOf(track);

    set({
      currentTrack: track,
      currentIndex: index,
      progress: 0,
      duration: track.duration ?? 0,
      isPlaying: true,
      isBuffering: true,
      streamError: null,
      loadingStreamId: videoId,
    });

    try {
      const info = await getMusicStream(videoId, getMusicAudioQualitySetting());
      if (get().loadingStreamId !== videoId) return;

      set({ loudnessDb: info.loudnessDb, loadingStreamId: null });
      musicAudioEngine.setLoudness(info.loudnessDb, get().normalizationEnabled);
      await musicAudioEngine.load(info.audioUrl);
      await musicAudioEngine.play();
    } catch (e) {
      if (get().loadingStreamId !== videoId) return;
      set({
        streamError: getBackendErrorMessage(e),
        loadingStreamId: null,
        isPlaying: false,
        isBuffering: false,
      });
    }
  },

  togglePlay: () => {
    if (get().isPlaying) get().pause();
    else get().play();
  },

  play: () => {
    if (!get().currentTrack) return;
    void musicAudioEngine.play();
    set({ isPlaying: true });
  },

  pause: () => {
    musicAudioEngine.pause();
    set({ isPlaying: false });
  },

  // Tear down the player entirely — stops audio, clears the queue, hides the
  // dock/overlay. (The controller flushes a final history record on track clear.)
  dismiss: () => {
    musicAudioEngine.stop();
    set({
      currentTrack: null,
      queue: [],
      currentIndex: -1,
      isPlaying: false,
      isBuffering: false,
      progress: 0,
      duration: 0,
      loudnessDb: null,
      loadingStreamId: null,
      streamError: null,
      viewState: "dock",
    });
  },

  next: () => {
    const { queue, currentIndex, isShuffle, repeatMode } = get();
    if (queue.length === 0) return;

    let nextIndex: number;
    if (isShuffle && queue.length > 1) {
      nextIndex = pickRandomIndex(queue.length, currentIndex);
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeatMode === "all") {
          nextIndex = 0;
        } else {
          musicAudioEngine.pause();
          set({ isPlaying: false });
          return;
        }
      }
    }
    void get()._loadIndex(nextIndex);
  },

  previous: () => {
    const { queue, currentIndex, progress, repeatMode } = get();
    if (queue.length === 0) return;
    if (progress > 3) {
      get().seek(0);
      return;
    }
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = repeatMode === "all" ? queue.length - 1 : 0;
    void get()._loadIndex(prevIndex);
  },

  seek: (seconds) => {
    musicAudioEngine.seek(seconds);
    set({ progress: Math.max(0, seconds) });
  },

  setVolume: (volume) => {
    const vol = clamp01(volume);
    musicAudioEngine.setVolume(vol);
    set({ volume: vol, isMuted: vol === 0 ? get().isMuted : false });
    saveConfig(get);
  },

  toggleMute: () => {
    const isMuted = !get().isMuted;
    musicAudioEngine.setMuted(isMuted);
    set({ isMuted });
    saveConfig(get);
  },

  cycleRepeat: () => {
    const order: MusicRepeatMode[] = ["none", "all", "one"];
    const repeatMode = order[(order.indexOf(get().repeatMode) + 1) % order.length];
    set({ repeatMode });
    saveConfig(get);
  },

  toggleShuffle: () => {
    set({ isShuffle: !get().isShuffle });
    saveConfig(get);
  },

  addToQueue: (track) => {
    const { queue } = get();
    if (queue.some((t) => videoIdOf(t) === videoIdOf(track))) return;
    set({ queue: [...queue, track] });
  },

  removeFromQueue: (index) => {
    const { queue, currentIndex } = get();
    if (index < 0 || index >= queue.length) return;
    const next = queue.filter((_, i) => i !== index);
    let nextCurrent = currentIndex;
    if (index < currentIndex) nextCurrent = currentIndex - 1;
    set({ queue: next, currentIndex: nextCurrent });
  },

  clearQueue: () => {
    const { currentTrack, currentIndex } = get();
    if (currentTrack) set({ queue: [currentTrack], currentIndex: 0 });
    else set({ queue: [], currentIndex: -1 });
    void currentIndex;
  },

  setViewState: (viewState) => set({ viewState }),
  openOverlay: (view = "full") => set({ viewState: view }),
  closeOverlay: () => set({ viewState: "dock" }),

  setEqEnabled: (enabled) => {
    musicAudioEngine.setEqEnabled(enabled);
    set({ eqEnabled: enabled });
    saveConfig(get);
  },

  setEqBand: (index, gainDb) => {
    const next = [...get().eqGains];
    next[index] = gainDb;
    const gains = normalizeEqGains(next);
    musicAudioEngine.setEqGains(gains);
    set({ eqGains: gains });
    saveConfig(get);
  },

  setEqGains: (gains) => {
    const normalized = normalizeEqGains(gains);
    musicAudioEngine.setEqGains(normalized);
    set({ eqGains: normalized });
    saveConfig(get);
  },

  applyEqPreset: (name) => {
    get().setEqGains([...(EQ_PRESETS[name] ?? EQ_FLAT)]);
  },

  setNormalizationEnabled: (enabled) => {
    musicAudioEngine.setLoudness(get().loudnessDb, enabled);
    set({ normalizationEnabled: enabled });
    saveConfig(get);
  },

  // --- internal (element → store) --------------------------------------

  _syncTime: (progress, duration) => {
    const next: Partial<MusicPlayerState> = {
      progress: Number.isFinite(progress) ? progress : 0,
    };
    if (Number.isFinite(duration) && duration > 0) next.duration = duration;
    set(next);
  },

  _reflectPlaying: (isPlaying) => set({ isPlaying }),

  _setBuffering: (isBuffering) => set({ isBuffering }),

  handleEnded: () => {
    if (get().repeatMode === "one") {
      musicAudioEngine.seek(0);
      void musicAudioEngine.play();
      set({ progress: 0, isPlaying: true });
      return;
    }
    get().next();
  },

  _onPlaybackError: () => {
    if (get().loadingStreamId !== null) return;
    set({ isPlaying: false, streamError: PLAYBACK_ERROR_FALLBACK });
  },
}));
