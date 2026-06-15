import type { LyricsEntry, LyricsProvider, WordTimestamp } from "../types";
import { lyricsGetText, lyricsGetJson, enc } from "../http";
import { parseTTMLToLyricsEntries } from "../ttmlParser";
import { hasWordSync } from "../sync";
import { UA_CHROME } from "./common";

const SERVERS = [
  "https://lyricsplus.binimum.org",
  "https://lyricsplus.atomix.one",
  "https://lyricsplus.prjktla.my.id",
  "https://lyricsplus-seven.vercel.app",
];
const BINIMUM = "https://lyrics-api.binimum.org/";

interface LpSyllable {
  time: number;
  duration: number;
  text: string;
  isBackground?: boolean;
}
interface LpLine {
  time: number;
  duration: number;
  text: string;
  syllabus?: LpSyllable[];
  element?: { singer?: string };
}
interface LpResponse {
  type?: string;
  lyrics?: LpLine[];
}

function toEntries(res: LpResponse): LyricsEntry[] {
  const lines = res.lyrics ?? [];
  return lines.map((line) => {
    let words: WordTimestamp[] | null = null;
    if (line.syllabus && line.syllabus.length > 0) {
      words = line.syllabus
        .filter((s) => s.text.trim().length > 0)
        .map((s) => ({
          text: s.text,
          startTime: s.time,
          endTime: s.time + Math.max(1, s.duration),
        }));
    }
    const bg = !!line.syllabus?.length && line.syllabus.every((s) => s.isBackground);
    return {
      time: line.time,
      text: line.text,
      words,
      agent: line.element?.singer ?? null,
      isBackground: bg,
    };
  });
}

export const lyricsPlusProvider: LyricsProvider = {
  name: "LyricsPlus",
  async getLyrics(_id, title, artist, durationSec, album): Promise<LyricsEntry[]> {
    let query = `/v2/lyrics/get?title=${enc(title)}&artist=${enc(artist)}`;
    if (durationSec > 0) query += `&duration=${durationSec}`;
    if (album) query += `&album=${enc(album)}`;

    for (const server of SERVERS) {
      try {
        const res = await lyricsGetJson<LpResponse>(server + query, {
          "User-Agent": UA_CHROME,
          Accept: "application/json,text/plain,*/*",
        });
        const entries = toEntries(res);
        if (entries.length > 0 && hasWordSync(entries)) return entries;
        if (entries.length > 0 && res.type !== "Word") {
        }
      } catch {
      }
    }

    // Binimum search → TTML (word-sync).
    try {
      let bq = `${BINIMUM}?track=${enc(title)}&artist=${enc(artist)}`;
      if (durationSec > 0) bq += `&duration=${durationSec}`;
      if (album) bq += `&album=${enc(album)}`;
      const search = await lyricsGetJson<{ results?: { lyricsUrl?: string }[] }>(bq, {
        "User-Agent": UA_CHROME,
        Accept: "application/json",
      });
      const url = search.results?.find((r) => r.lyricsUrl)?.lyricsUrl;
      if (url) {
        const ttml = await lyricsGetText(url, { "User-Agent": UA_CHROME });
        return parseTTMLToLyricsEntries(ttml);
      }
    } catch {
    }

    // Last resort: first server's line-level result.
    for (const server of SERVERS) {
      try {
        const res = await lyricsGetJson<LpResponse>(server + query, { "User-Agent": UA_CHROME });
        const entries = toEntries(res);
        if (entries.length > 0) return entries;
      } catch {
      }
    }
    return [];
  },
};
