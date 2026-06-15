import type { LyricsProvider } from "./types";
import { betterLyricsProvider } from "./providers/betterLyrics";
import { lyricsPlusProvider } from "./providers/lyricsPlus";
import { simpMusicProvider } from "./providers/simpMusic";
import { kugouProvider } from "./providers/kugou";
import { paxsenixProvider } from "./providers/paxsenix";
import { lrclibProvider } from "./providers/lrclib";
import { youtubeSubtitleProvider, youtubeProvider } from "./providers/youtube";

// Word/character-sync providers first, plain text last (mobile's default order).
export const PROVIDERS: LyricsProvider[] = [
  betterLyricsProvider,
  lyricsPlusProvider,
  simpMusicProvider,
  kugouProvider,
  paxsenixProvider,
  lrclibProvider,
  youtubeSubtitleProvider,
  youtubeProvider,
];
