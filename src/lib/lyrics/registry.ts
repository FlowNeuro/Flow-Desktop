import type { LyricsProvider } from "./types";
import { betterLyricsProvider } from "./providers/betterLyrics";
import { lyricsPlusProvider } from "./providers/lyricsPlus";
import { simpMusicProvider } from "./providers/simpMusic";
import { kugouProvider } from "./providers/kugou";
import { paxsenixProvider } from "./providers/paxsenix";
import { lrclibProvider } from "./providers/lrclib";
import { youtubeSubtitleProvider, youtubeProvider } from "./providers/youtube";

// Word/character-sync providers first, plain text last (mobile's default order).
export const DEFAULT_PROVIDER_ORDER = [
  "BetterLyrics",
  "LyricsPlus",
  "SimpMusic",
  "KuGou",
  "Paxsenix",
  "LrcLib",
  "YouTubeSubtitle",
  "YouTube",
] as const;

const PROVIDER_MAP = new Map<string, LyricsProvider>(
  [
    betterLyricsProvider,
    lyricsPlusProvider,
    simpMusicProvider,
    kugouProvider,
    paxsenixProvider,
    lrclibProvider,
    youtubeSubtitleProvider,
    youtubeProvider,
  ].map((provider) => [provider.name, provider]),
);

export const PROVIDERS: LyricsProvider[] = DEFAULT_PROVIDER_ORDER
  .map((name) => PROVIDER_MAP.get(name))
  .filter((provider): provider is LyricsProvider => !!provider);

export const PROVIDER_NAMES = PROVIDERS.map((provider) => provider.name);

export type LyricsProviderEnabledStates = Record<string, boolean>;

export function parseProviderOrder(orderString: string | null | undefined): string[] {
  if (!orderString?.trim()) return PROVIDER_NAMES;
  const ordered = orderString
    .split(",")
    .map((name) => name.trim())
    .filter((name) => PROVIDER_MAP.has(name));
  const missing = PROVIDER_NAMES.filter((name) => !ordered.includes(name));
  return [...ordered, ...missing];
}

export function getOrderedProviders(orderString = ""): LyricsProvider[] {
  return parseProviderOrder(orderString)
    .map((name) => PROVIDER_MAP.get(name))
    .filter((provider): provider is LyricsProvider => !!provider);
}

export function parseProviderEnabledStates(raw: string | null | undefined): LyricsProviderEnabledStates {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([name, value]) => PROVIDER_MAP.has(name) && typeof value === "boolean")
        .map(([name, value]) => [name, value]),
    );
  } catch {
    return {};
  }
}

export function serializeProviderEnabledStates(states: LyricsProviderEnabledStates): string {
  return JSON.stringify(
    Object.fromEntries(
      PROVIDER_NAMES.map((name) => [name, states[name] ?? true]),
    ),
  );
}

export function getEnabledProviders(orderString = "", enabledStates: LyricsProviderEnabledStates = {}): LyricsProvider[] {
  return getOrderedProviders(orderString).filter((provider) => enabledStates[provider.name] !== false);
}

export const DEFAULT_PROVIDER_ENABLED_STATES = serializeProviderEnabledStates({});
