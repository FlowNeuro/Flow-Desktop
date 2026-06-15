import type { LyricsEntry, LyricsProvider } from "../types";
import { getMusicLyricsTyped } from "../../api/music";

export const youtubeSubtitleProvider: LyricsProvider = {
  name: "YouTubeSubtitle",
  async getLyrics(): Promise<LyricsEntry[]> {
    return [];
  },
};

export const youtubeProvider: LyricsProvider = {
  name: "YouTube",
  async getLyrics(id): Promise<LyricsEntry[]> {
    if (!id) return [];
    const text = await getMusicLyricsTyped(id);
    return text && text.trim() ? [{ time: 0, text }] : [];
  },
};
