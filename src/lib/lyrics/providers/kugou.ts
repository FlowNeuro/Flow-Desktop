import type { LyricsEntry, LyricsProvider } from "../types";
import { lyricsGetJson, enc } from "../http";
import { parseLyrics } from "../lyricsUtils";

const SONG_SEARCH = "https://mobileservice.kugou.com/api/v3/search/song";
const LYRIC_SEARCH = "https://lyrics.kugou.com/search";
const LYRIC_DOWNLOAD = "https://lyrics.kugou.com/download";
const DURATION_TOLERANCE_SEC = 8;

interface SongSearch {
  data?: { info?: { duration?: number; hash?: string }[] };
}
interface LyricCandidate {
  id?: number;
  accesskey?: string;
  duration?: number;
}
interface LyricSearch {
  candidates?: LyricCandidate[];
}

const ACCEPTED = /^\[(\d\d):(\d\d)\.(\d{2,3})\]/;
const BANNED = /.+].+[:：].+/;

// KuGou ships base64'd LRC with credit lines padded at the head/foot.
function normalize(lrc: string): string {
  const lines = lrc.split("\n");
  const scrub = (i: number) => {
    const ln = lines[i];
    if (ln && !ACCEPTED.test(ln) && BANNED.test(ln)) lines[i] = "";
  };
  for (let i = 0; i < Math.min(30, lines.length); i++) scrub(i);
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 30); i--) scrub(i);
  return lines.filter((l) => l.length > 0).join("\n");
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

async function download(id: number, accesskey: string): Promise<string | null> {
  const url = `${LYRIC_DOWNLOAD}?fmt=lrc&charset=utf8&client=pc&ver=1&id=${id}&accesskey=${enc(accesskey)}`;
  const res = await lyricsGetJson<{ content?: string }>(url);
  if (!res.content) return null;
  try {
    return normalize(decodeBase64Utf8(res.content));
  } catch {
    return null;
  }
}

async function firstCandidate(url: string): Promise<LyricCandidate | null> {
  const res = await lyricsGetJson<LyricSearch>(url);
  return res.candidates?.[0] ?? null;
}

export const kugouProvider: LyricsProvider = {
  name: "KuGou",
  async getLyrics(_id, title, artist, durationSec): Promise<LyricsEntry[]> {
    const keyword = `${title} - ${artist}`.trim();

    // Prefer hash match from the song search (most accurate).
    try {
      const songs = await lyricsGetJson<SongSearch>(
        `${SONG_SEARCH}?version=9108&plat=0&pagesize=8&showtype=0&keyword=${enc(keyword)}`,
      );
      for (const song of songs.data?.info ?? []) {
        if (!song.hash) continue;
        if (durationSec > 0 && Math.abs((song.duration ?? 0) - durationSec) > DURATION_TOLERANCE_SEC) {
          continue;
        }
        const cand = await firstCandidate(
          `${LYRIC_SEARCH}?ver=1&man=yes&client=pc&hash=${enc(song.hash)}`,
        );
        if (cand?.id && cand.accesskey) {
          const lrc = await download(cand.id, cand.accesskey);
          if (lrc) return parseLyrics(lrc);
        }
      }
    } catch {
    }

    // Fallback: lyric search by keyword + duration.
    try {
      let url = `${LYRIC_SEARCH}?ver=1&man=yes&client=pc`;
      if (durationSec > 0) url += `&duration=${durationSec * 1000}`;
      url += `&keyword=${enc(keyword)}`;
      const cand = await firstCandidate(url);
      if (cand?.id && cand.accesskey) {
        const lrc = await download(cand.id, cand.accesskey);
        if (lrc) return parseLyrics(lrc);
      }
    } catch {
      // no result
    }
    return [];
  },
};
