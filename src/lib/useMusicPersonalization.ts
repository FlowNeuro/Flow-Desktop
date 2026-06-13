import { useEffect, useRef, useState } from 'react';
import { getMusicHistory } from './api/db';
import { getMusicRelatedTyped, searchMusicTyped } from './api/music';
import { getString } from './i18n/index';
import { isMusicVideo } from './utils';
import { usePlayerStore } from '../store/usePlayerStore';
import type { SongItem, YTItem } from '../types/music';
import type { WatchHistoryRecord } from '../types/db';

export interface PersonalSection {
  id: string;
  title: string;
  subtitle?: string;
  items: YTItem[];
}

export interface MusicPersonalization {
  quickPicks: SongItem[];
  sections: PersonalSection[];
  loading: boolean;
}

const HISTORY_SEED_LIMIT = 50;
const POPULAR_ARTISTS = ['The Weeknd', 'Taylor Swift', 'Drake', 'Billie Eilish', 'Bruno Mars', 'Dua Lipa'];

const toYTSong = (s: SongItem): YTItem => ({ type: 'song', ...s });

function isAudioSong(s: SongItem): boolean {
  const vt = s.musicVideoType;
  const isVideoSong = !!vt && vt !== 'MUSIC_VIDEO_TYPE_ATV';
  const dur = s.duration ?? 0;
  const okDuration = dur === 0 || (dur >= 30 && dur <= 1200);
  return !isVideoSong && !!(s.videoId ?? s.id) && okDuration;
}

function audioMusicOnly(songs: SongItem[]): SongItem[] {
  const seen = new Set<string>();
  const out: SongItem[] = [];
  for (const s of songs) {
    if (!isAudioSong(s)) continue;
    const id = s.videoId ?? s.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(s);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

async function relatedSongs(videoId: string): Promise<SongItem[]> {
  try {
    const page = await getMusicRelatedTyped(videoId);
    return audioMusicOnly(page.songs);
  } catch {
    return [];
  }
}

async function buildQuickPicks(
  history: WatchHistoryRecord[],
  nowPlayingId: string | null,
): Promise<SongItem[]> {
  if (nowPlayingId) {
    const related = await relatedSongs(nowPlayingId);
    if (related.length) return related.slice(0, 24);
  }
  const seeds = history.slice(0, 2).map((h) => h.videoId).filter(Boolean);
  const results = await Promise.all(seeds.map(relatedSongs));
  return audioMusicOnly(results.flat()).slice(0, 24);
}

async function buildSimilarTo(history: WatchHistoryRecord[]): Promise<PersonalSection[]> {
  if (history.length === 0) return [];
  const byArtist = new Map<string, WatchHistoryRecord[]>();
  for (const h of history) {
    const artist = (h.channelName ?? '').trim();
    if (!artist) continue;
    const list = byArtist.get(artist) ?? [];
    list.push(h);
    byArtist.set(artist, list);
  }
  const topArtists = shuffle(
    [...byArtist.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6),
  ).slice(0, 2);

  const sections: PersonalSection[] = [];
  const seenSeeds = new Set<string>();
  for (const [artist, recs] of topArtists) {
    const seed = recs[0];
    if (!seed) continue;
    const songs = await relatedSongs(seed.videoId);
    if (songs.length) {
      seenSeeds.add(seed.videoId);
      sections.push({
        id: `similar-${seed.videoId}`,
        title: artist,
        subtitle: getString('music_similar_to'),
        items: songs.slice(0, 12).map(toYTSong),
      });
    }
  }

  const recent = history[0];
  if (recent && !seenSeeds.has(recent.videoId)) {
    const songs = await relatedSongs(recent.videoId);
    if (songs.length) {
      sections.push({
        id: `similar-${recent.videoId}`,
        title: recent.title,
        subtitle: getString('music_similar_to'),
        items: songs.slice(0, 12).map(toYTSong),
      });
    }
  }
  return sections;
}

async function buildDailyDiscover(history: WatchHistoryRecord[]): Promise<PersonalSection | null> {
  if (history.length === 0) return null;
  const seeds = shuffle(history).slice(0, 4);
  const picks = await Promise.all(
    seeds.map(async (seed) => {
      const songs = await relatedSongs(seed.videoId);
      return songs.find((s) => (s.videoId ?? s.id) !== seed.videoId) ?? null;
    }),
  );
  const items = audioMusicOnly(picks.filter((s): s is SongItem => s !== null)).map(toYTSong);
  if (items.length === 0) return null;
  return { id: 'daily-discover', title: getString('music_daily_discover'), items };
}

async function buildFromCommunity(history: WatchHistoryRecord[]): Promise<PersonalSection | null> {
  if (history.length === 0) return null;
  const artists = [...new Set(history.map((h) => (h.channelName ?? '').trim()).filter(Boolean))].slice(0, 3);
  if (artists.length === 0) return null;

  const results = await Promise.all(
    artists.map(async (artist) => {
      try {
        const res = await searchMusicTyped(`${artist} playlist`, 'community_playlists');
        return res.sections.flatMap((s) => s.items);
      } catch {
        return [] as YTItem[];
      }
    }),
  );

  const seen = new Set<string>();
  const playlists = results
    .flat()
    .filter((it): it is Extract<YTItem, { type: 'playlist' }> => it.type === 'playlist')
    .filter((p) => !p.id.startsWith('RD') && !p.id.startsWith('OLAK'))
    .filter((p) => (p.author?.name ?? '').trim().toLowerCase() !== 'youtube')
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, 12);

  if (playlists.length === 0) return null;
  return { id: 'from-community', title: getString('music_from_community'), items: playlists };
}

async function buildPopularArtists(): Promise<PersonalSection | null> {
  const picks = shuffle(POPULAR_ARTISTS).slice(0, 3);
  const results = await Promise.all(
    picks.map(async (artist) => {
      try {
        const res = await searchMusicTyped(`${artist} hits`, 'songs');
        return res.sections.flatMap((s) => s.items);
      } catch {
        return [] as YTItem[];
      }
    }),
  );
  const songs = audioMusicOnly(
    results.flat().filter((it): it is Extract<YTItem, { type: 'song' }> => it.type === 'song'),
  );
  const items = songs.slice(0, 16).map(toYTSong);
  if (items.length === 0) return null;
  return { id: 'popular-artists', title: getString('music_popular_artists'), items };
}

export function useMusicPersonalization(): MusicPersonalization {
  const nowPlaying = usePlayerStore((s) => s.currentVideo);
  const nowPlayingId = nowPlaying && isMusicVideo(nowPlaying) ? nowPlaying.id : null;

  const [quickPicks, setQuickPicks] = useState<SongItem[]>([]);
  const [sections, setSections] = useState<PersonalSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyVersion, setHistoryVersion] = useState(0);

  const historyRef = useRef<WatchHistoryRecord[]>([]);
  const sectionsReqRef = useRef(0);
  const quickReqRef = useRef(0);

  useEffect(() => {
    const req = ++sectionsReqRef.current;
    setLoading(true);
    (async () => {
      const history = await getMusicHistory(HISTORY_SEED_LIMIT, 0).catch(() => [] as WatchHistoryRecord[]);
      if (sectionsReqRef.current !== req) return;
      historyRef.current = history;
      setHistoryVersion((v) => v + 1);

      const [similar, daily, community, popular] = await Promise.all([
        buildSimilarTo(history),
        buildDailyDiscover(history),
        buildFromCommunity(history),
        buildPopularArtists(),
      ]);
      if (sectionsReqRef.current !== req) return;

      const next: PersonalSection[] = [...similar];
      if (daily) next.push(daily);
      if (community) next.push(community);
      if (popular) next.push(popular);
      setSections(next);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const req = ++quickReqRef.current;
    (async () => {
      const picks = await buildQuickPicks(historyRef.current, nowPlayingId);
      if (quickReqRef.current !== req) return;
      setQuickPicks(picks);
    })();
  }, [nowPlayingId, historyVersion]);

  return { quickPicks, sections, loading };
}
