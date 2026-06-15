import type { LyricsEntry } from "./types";

// Two-tier cache: in-memory (fast) + localStorage (persists across launches).
const PREFIX = "flow_lyrics_";
const memory = new Map<string, LyricsEntry[]>();

export function getMemory(id: string): LyricsEntry[] | null {
  return memory.get(id) ?? null;
}

export function setMemory(id: string, entries: LyricsEntry[]): void {
  memory.set(id, entries);
}

export function getDisk(id: string): LyricsEntry[] | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? (JSON.parse(raw) as LyricsEntry[]) : null;
  } catch {
    return null;
  }
}

export function setDisk(id: string, entries: LyricsEntry[]): void {
  try {
    localStorage.setItem(PREFIX + id, JSON.stringify(entries));
  } catch {
    /* quota / serialization — ignore */
  }
}

export function evict(id: string): void {
  memory.delete(id);
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    /* ignore */
  }
}
