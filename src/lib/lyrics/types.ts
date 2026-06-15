export interface WordTimestamp {
  text: string;
  startTime: number; // ms
  endTime: number; // ms
}

export interface LyricsEntry {
  time: number; // ms; 0 = unsynced, ~1_000_000+ = plain-line placeholder
  text: string;
  words?: WordTimestamp[] | null;
  agent?: string | null;
  isBackground?: boolean;
  translation?: string | null;
}

export interface LyricsProvider {
  name: string;
  getLyrics(
    id: string,
    title: string,
    artist: string,
    durationSec: number,
    album?: string | null,
  ): Promise<LyricsEntry[]>;
}

export interface LyricsResult {
  entries: LyricsEntry[];
  provider: string;
}
