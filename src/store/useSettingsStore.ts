import { create } from "zustand";
import { getSetting, setSetting } from "../lib/api/db";

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
      const sbEnabled = await getSetting("sponsorblock_enabled");
      const daEnabled = await getSetting("dearrow_enabled");
      const dabEnabled = await getSetting("dearrow_badge_enabled");
      const rEnabled = await getSetting("rytd_enabled");
      const sSubmit = await getSetting("sb_submit_enabled");
      const sUser = await getSetting("sponsorblock_user_id");
      const sServer = await getSetting("sponsorblock_server");
      
      const sbColorsRaw = await getSetting("sponsorblock_colors");
      const sbActionsRaw = await getSetting("sponsorblock_categories");

      const dbMinutes = await getSetting("sponsorblock_saved_minutes");
      const dbSegments = await getSetting("sponsorblock_skipped_segments");

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
    await setSetting("sponsorblock_enabled", String(enabled));
  },

  setDeArrowEnabled: async (enabled) => {
    set({ dearrowEnabled: enabled });
    await setSetting("dearrow_enabled", String(enabled));
  },

  setDeArrowBadgeEnabled: async (enabled) => {
    set({ dearrowBadgeEnabled: enabled });
    await setSetting("dearrow_badge_enabled", String(enabled));
  },

  setRytdEnabled: async (enabled) => {
    set({ rytdEnabled: enabled });
    await setSetting("rytd_enabled", String(enabled));
  },

  setSbSubmitEnabled: async (enabled) => {
    set({ sbSubmitEnabled: enabled });
    await setSetting("sb_submit_enabled", String(enabled));
  },

  setSbUserId: async (id) => {
    set({ sbUserId: id });
    await setSetting("sponsorblock_user_id", id);
  },

  setServerUrl: async (url) => {
    set({ serverUrl: url });
    await setSetting("sponsorblock_server", url);
  },

  setCategoryColor: async (category, color) => {
    const updatedColors = { ...get().sponsorBlockColors, [category]: color };
    set({ sponsorBlockColors: updatedColors });
    await setSetting("sponsorblock_colors", JSON.stringify(updatedColors));
  },

  setCategoryAction: async (category, action) => {
    const updatedActions = { ...get().sponsorBlockActions, [category]: action };
    set({ sponsorBlockActions: updatedActions });
    await setSetting("sponsorblock_categories", JSON.stringify(updatedActions));
  },

  resetCategoryColors: async () => {
    set({ sponsorBlockColors: DEFAULT_SB_COLORS });
    await setSetting("sponsorblock_colors", JSON.stringify(DEFAULT_SB_COLORS));
  },

  resetStats: async () => {
    set({ savedMinutes: 0, segmentsSkipped: 0 });
    await setSetting("sponsorblock_saved_minutes", "0");
    await setSetting("sponsorblock_skipped_segments", "0");
    await setSetting("sponsorblock_saved_seconds", "0");
    
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
      
      const currentSecondsRaw = await getSetting("sponsorblock_saved_seconds");
      const currentSeconds = currentSecondsRaw ? parseInt(currentSecondsRaw, 10) : 0;
      const nextSeconds = currentSeconds + seconds;
      const nextMinutes = Math.round(nextSeconds / 60);

      const catClipsRaw = await getSetting(`sb_stats_clips_${category}`);
      const catClips = catClipsRaw ? parseInt(catClipsRaw, 10) : 0;
      const nextCatClips = catClips + 1;

      const catSecsRaw = await getSetting(`sb_stats_seconds_${category}`);
      const catSecs = catSecsRaw ? parseInt(catSecsRaw, 10) : 0;
      const nextCatSecs = catSecs + seconds;

      await setSetting("sponsorblock_skipped_segments", String(nextSegments));
      await setSetting("sponsorblock_saved_seconds", String(nextSeconds));
      await setSetting("sponsorblock_saved_minutes", String(nextMinutes));
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
