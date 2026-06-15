import type { LyricsEntry, LyricsProvider } from "../types";
import { lyricsGetText, enc } from "../http";
import { parseTTMLToLyricsEntries } from "../ttmlParser";
import { UA_CHROME } from "./common";

const BASE = "https://lyrics-api.boidu.dev";

export const betterLyricsProvider: LyricsProvider = {
  name: "BetterLyrics",
  async getLyrics(_id, title, artist, durationSec, album): Promise<LyricsEntry[]> {
    let url = `${BASE}/getLyrics?s=${enc(title)}&a=${enc(artist)}`;
    if (album) url += `&al=${enc(album)}`;
    if (durationSec > 0) url += `&d=${durationSec}`;

    const body = await lyricsGetText(url, { "User-Agent": UA_CHROME, Accept: "application/json" });
    let ttml = "";
    try {
      ttml = (JSON.parse(body) as { ttml?: string }).ttml ?? "";
    } catch {
      if (body.includes("<tt") || body.includes("<p ")) ttml = body;
    }
    return ttml ? parseTTMLToLyricsEntries(ttml) : [];
  },
};
