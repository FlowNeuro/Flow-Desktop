import type { LyricsEntry, LyricsProvider } from "../types";
import { lyricsHttpGet, enc } from "../http";
import { parseLyrics } from "../lyricsUtils";

const API = "https://lrclib.net/api";
const HEADERS = { "User-Agent": "Flow Desktop (https://github.com/aedev/flow)" };

interface LrcRecord {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  duration?: number | null;
  instrumental?: boolean;
}

function toEntries(rec: LrcRecord | null): LyricsEntry[] {
  if (!rec) return [];
  if (rec.syncedLyrics) return parseLyrics(rec.syncedLyrics);
  if (rec.plainLyrics) return [{ time: 0, text: rec.plainLyrics }];
  return [];
}

async function tryGet(artist: string, title: string, durationSec: number): Promise<LrcRecord | null> {
  let url = `${API}/get?track_name=${enc(title)}`;
  if (artist) url += `&artist_name=${enc(artist)}`;
  if (durationSec > 0) url += `&duration=${durationSec}`;
  const res = await lyricsHttpGet(url, HEADERS);
  if (res.status < 200 || res.status >= 300) return null;
  try {
    return JSON.parse(res.body) as LrcRecord;
  } catch {
    return null;
  }
}

async function trySearch(query: string, durationSec: number): Promise<LrcRecord | null> {
  const res = await lyricsHttpGet(`${API}/search?q=${enc(query)}`, HEADERS);
  if (res.status < 200 || res.status >= 300) return null;
  let list: LrcRecord[];
  try {
    list = JSON.parse(res.body) as LrcRecord[];
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  const synced = list.filter((r) => r.syncedLyrics);
  if (durationSec > 0) {
    const closest = synced
      .slice()
      .sort((a, b) => Math.abs((a.duration ?? 0) - durationSec) - Math.abs((b.duration ?? 0) - durationSec))[0];
    if (closest && Math.abs((closest.duration ?? 0) - durationSec) < 5) return closest;
  }
  return synced[0] ?? list[0] ?? null;
}

export const lrclibProvider: LyricsProvider = {
  name: "LrcLib",
  async getLyrics(_id, title, artist, durationSec): Promise<LyricsEntry[]> {
    const attempts: Array<() => Promise<LrcRecord | null>> = [
      () => tryGet(artist, title, durationSec),
      () => trySearch(`${artist} ${title}`.trim(), durationSec),
      () => tryGet("", title, durationSec),
      () => trySearch(`${artist} ${title}`.trim(), durationSec),
    ];
    for (const attempt of attempts) {
      try {
        const entries = toEntries(await attempt());
        if (entries.length > 0) return entries;
      } catch {
      }
    }
    return [];
  },
};
