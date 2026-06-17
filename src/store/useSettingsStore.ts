import { create } from "zustand";
import { getSetting, setSetting } from "../lib/api/db";
import { SETTINGS } from "../lib/settings/schema";

export type SponsorBlockCategory =
  | "sponsor"
  | "intro"
  | "outro"
  | "selfpromo"
  | "interaction"
  | "music_offtopic"
  | "filler"
  | "preview"
  | "exclusive_access";

export type SponsorBlockAction = "skip" | "mute" | "notify" | "ignore";

export const DEFAULT_SB_COLORS: Record<SponsorBlockCategory, string> = {
  sponsor: "#00d400",
  intro: "#00ffff",
  outro: "#0000ff",
  selfpromo: "#ffff00",
  interaction: "#ff0000",
  music_offtopic: "#ff0584",
  filler: "#7300ff",
  preview: "#0080c0",
  exclusive_access: "#ff7f00",
};

export const DEFAULT_SB_ACTIONS: Record<SponsorBlockCategory, SponsorBlockAction> = {
  sponsor: "skip",
  intro: "skip",
  outro: "skip",
  selfpromo: "skip",
  interaction: "ignore",
  music_offtopic: "ignore",
  filler: "ignore",
  preview: "ignore",
  exclusive_access: "ignore",
};

interface SettingsState {
  sponsorBlockEnabled: boolean;
  dearrowEnabled: boolean;
  dearrowBadgeEnabled: boolean;
  rytdEnabled: boolean;
  sbSubmitEnabled: boolean;
  sbUserId: string;
  serverUrl: string;
  sponsorBlockColors: Record<SponsorBlockCategory, string>;
  sponsorBlockActions: Record<SponsorBlockCategory, SponsorBlockAction>;
  
  // Stats
  savedMinutes: number;
  segmentsSkipped: number;

  loadSettings: () => Promise<void>;
  setSponsorBlockEnabled: (enabled: boolean) => Promise<void>;
  setDeArrowEnabled: (enabled: boolean) => Promise<void>;
  setDeArrowBadgeEnabled: (enabled: boolean) => Promise<void>;
  setRytdEnabled: (enabled: boolean) => Promise<void>;
  setSbSubmitEnabled: (enabled: boolean) => Promise<void>;
  setSbUserId: (id: string) => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
  setCategoryColor: (category: SponsorBlockCategory, color: string) => Promise<void>;
  setCategoryAction: (category: SponsorBlockCategory, action: SponsorBlockAction) => Promise<void>;
  resetCategoryColors: () => Promise<void>;
  resetStats: () => Promise<void>;
  incrementStats: (category: SponsorBlockCategory, seconds: number) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  sponsorBlockEnabled: true,
  dearrowEnabled: true,
  dearrowBadgeEnabled: true,
  rytdEnabled: true,
  sbSubmitEnabled: false,
  sbUserId: "",
  serverUrl: "https://sponsor.ajay.app",
  sponsorBlockColors: DEFAULT_SB_COLORS,
  sponsorBlockActions: DEFAULT_SB_ACTIONS,
  
  savedMinutes: 0,
  segmentsSkipped: 0,

  loadSettings: async () => {
    try {
      const sbEnabled = await getSetting(SETTINGS.SPONSORBLOCK_ENABLED);
      const daEnabled = await getSetting(SETTINGS.DEARROW_ENABLED);
      const dabEnabled = await getSetting(SETTINGS.DEARROW_BADGE_ENABLED);
      const rEnabled = await getSetting(SETTINGS.RYTD_ENABLED);
      const sSubmit = await getSetting(SETTINGS.SB_SUBMIT_ENABLED);
      const sUser = await getSetting(SETTINGS.SPONSORBLOCK_USER_ID);
      const sServer = await getSetting(SETTINGS.SPONSORBLOCK_SERVER);
      
      const sbColorsRaw = await getSetting(SETTINGS.SPONSORBLOCK_COLORS);
      const sbActionsRaw = await getSetting(SETTINGS.SPONSORBLOCK_CATEGORIES);

      const dbMinutes = await getSetting(SETTINGS.SPONSORBLOCK_SAVED_MINUTES);
      const dbSegments = await getSetting(SETTINGS.SPONSORBLOCK_SKIPPED_SEGMENTS);

      let loadedColors = { ...DEFAULT_SB_COLORS };
      if (sbColorsRaw) {
        try {
          const parsed = JSON.parse(sbColorsRaw);
          loadedColors = { ...DEFAULT_SB_COLORS, ...parsed };
        } catch (_) {}
      }

      let loadedActions = { ...DEFAULT_SB_ACTIONS };
      if (sbActionsRaw) {
        try {
          const parsed = JSON.parse(sbActionsRaw);
          loadedActions = { ...DEFAULT_SB_ACTIONS, ...parsed };
        } catch (_) {}
      }

      set({
        sponsorBlockEnabled: sbEnabled !== null ? sbEnabled === "true" : true,
        dearrowEnabled: daEnabled !== null ? daEnabled === "true" : true,
        dearrowBadgeEnabled: dabEnabled !== null ? dabEnabled === "true" : true,
        rytdEnabled: rEnabled !== null ? rEnabled === "true" : true,
        sbSubmitEnabled: sSubmit !== null ? sSubmit === "true" : false,
        sbUserId: sUser || "",
        serverUrl: sServer || "https://sponsor.ajay.app",
        sponsorBlockColors: loadedColors,
        sponsorBlockActions: loadedActions,
        savedMinutes: dbMinutes !== null ? parseInt(dbMinutes, 10) : 0,
        segmentsSkipped: dbSegments !== null ? parseInt(dbSegments, 10) : 0,
      });
    } catch (e) {
      console.warn("Failed to load settings in useSettingsStore", e);
    }
  },

  setSponsorBlockEnabled: async (enabled) => {
    set({ sponsorBlockEnabled: enabled });
    await setSetting(SETTINGS.SPONSORBLOCK_ENABLED, String(enabled));
  },

  setDeArrowEnabled: async (enabled) => {
    set({ dearrowEnabled: enabled });
    await setSetting(SETTINGS.DEARROW_ENABLED, String(enabled));
  },

  setDeArrowBadgeEnabled: async (enabled) => {
    set({ dearrowBadgeEnabled: enabled });
    await setSetting(SETTINGS.DEARROW_BADGE_ENABLED, String(enabled));
  },

  setRytdEnabled: async (enabled) => {
    set({ rytdEnabled: enabled });
    await setSetting(SETTINGS.RYTD_ENABLED, String(enabled));
  },

  setSbSubmitEnabled: async (enabled) => {
    set({ sbSubmitEnabled: enabled });
    await setSetting(SETTINGS.SB_SUBMIT_ENABLED, String(enabled));
  },

  setSbUserId: async (id) => {
    set({ sbUserId: id });
    await setSetting(SETTINGS.SPONSORBLOCK_USER_ID, id);
  },

  setServerUrl: async (url) => {
    set({ serverUrl: url });
    await setSetting(SETTINGS.SPONSORBLOCK_SERVER, url);
  },

  setCategoryColor: async (category, color) => {
    const updatedColors = { ...get().sponsorBlockColors, [category]: color };
    set({ sponsorBlockColors: updatedColors });
    await setSetting(SETTINGS.SPONSORBLOCK_COLORS, JSON.stringify(updatedColors));
  },

  setCategoryAction: async (category, action) => {
    const updatedActions = { ...get().sponsorBlockActions, [category]: action };
    set({ sponsorBlockActions: updatedActions });
    await setSetting(SETTINGS.SPONSORBLOCK_CATEGORIES, JSON.stringify(updatedActions));
  },

  resetCategoryColors: async () => {
    set({ sponsorBlockColors: DEFAULT_SB_COLORS });
    await setSetting(SETTINGS.SPONSORBLOCK_COLORS, JSON.stringify(DEFAULT_SB_COLORS));
  },

  resetStats: async () => {
    set({ savedMinutes: 0, segmentsSkipped: 0 });
    await setSetting(SETTINGS.SPONSORBLOCK_SAVED_MINUTES, "0");
    await setSetting(SETTINGS.SPONSORBLOCK_SKIPPED_SEGMENTS, "0");
    await setSetting(SETTINGS.SPONSORBLOCK_SAVED_SECONDS, "0");
    
    const categories: SponsorBlockCategory[] = [
      "sponsor", "intro", "outro", "selfpromo", "interaction", 
      "music_offtopic", "filler", "preview", "exclusive_access"
    ];
    for (const cat of categories) {
      await setSetting(`sb_stats_clips_${cat}`, "0");
      await setSetting(`sb_stats_seconds_${cat}`, "0");
    }
  },

  incrementStats: async (category, seconds) => {
    try {
      const currentSegments = get().segmentsSkipped;
      const nextSegments = currentSegments + 1;
      
      const currentSecondsRaw = await getSetting(SETTINGS.SPONSORBLOCK_SAVED_SECONDS);
      const currentSeconds = currentSecondsRaw ? parseInt(currentSecondsRaw, 10) : 0;
      const nextSeconds = currentSeconds + seconds;
      const nextMinutes = Math.round(nextSeconds / 60);

      const catClipsRaw = await getSetting(`sb_stats_clips_${category}`);
      const catClips = catClipsRaw ? parseInt(catClipsRaw, 10) : 0;
      const nextCatClips = catClips + 1;

      const catSecsRaw = await getSetting(`sb_stats_seconds_${category}`);
      const catSecs = catSecsRaw ? parseInt(catSecsRaw, 10) : 0;
      const nextCatSecs = catSecs + seconds;

      await setSetting(SETTINGS.SPONSORBLOCK_SKIPPED_SEGMENTS, String(nextSegments));
      await setSetting(SETTINGS.SPONSORBLOCK_SAVED_SECONDS, String(nextSeconds));
      await setSetting(SETTINGS.SPONSORBLOCK_SAVED_MINUTES, String(nextMinutes));
      await setSetting(`sb_stats_clips_${category}`, String(nextCatClips));
      await setSetting(`sb_stats_seconds_${category}`, String(nextCatSecs));

      set({
        segmentsSkipped: nextSegments,
        savedMinutes: nextMinutes
      });
    } catch (e) {
      console.warn("Failed to increment SponsorBlock stats", e);
    }
  },
}));
