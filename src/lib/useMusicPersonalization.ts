import { useEffect, useRef, useState } from 'react';
import { getMusicHistory } from './api/db';
import {
  getMusicChartsPage,
  getMusicQueueContinuation,
  getMusicRelatedTyped,
  getMusicWatchQueue,
  searchMusicTyped,
} from './api/music';
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
const MIN_SHELF_ITEMS = 4;
const QUICK_PICKS_TARGET = 24;
const RADIO_MAX_PAGES = 6;

const toYTSong = (s: SongItem): YTItem => ({ type: 'song', ...s });
const songIdOf = (s: SongItem): string => s.videoId ?? s.id;

function ytItemId(it: YTItem): string {
  if ('videoId' in it && it.videoId) return it.videoId;
  if ('id' in it && it.id) return it.id;
  if ('browseId' in it && it.browseId) return it.browseId;
  return '';
}

function isAudioSong(s: SongItem): boolean {
  const vt = s.musicVideoType;
  const isVideoSong = !!vt && vt !== 'MUSIC_VIDEO_TYPE_ATV';
  const dur = s.duration ?? 0;
  const okDuration = dur === 0 || (dur >= 30 && dur <= 1200);
  return !isVideoSong && !!songIdOf(s) && okDuration;
}

function audioMusicOnly(songs: SongItem[]): SongItem[] {
  const seen = new Set<string>();
  const out: SongItem[] = [];
  for (const s of songs) {
    if (!isAudioSong(s)) continue;
    const id = songIdOf(s);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(s);
  }
  return out;
}

function takeUnused(songs: SongItem[], n: number, used: Set<string>): SongItem[] {
  const out: SongItem[] = [];
  for (const s of songs) {
    const id = songIdOf(s);
    if (!id || used.has(id)) continue;
    used.add(id);
    out.push(s);
    if (out.length >= n) break;
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

async function chartsSongs(): Promise<SongItem[]> {
  try {
    const charts = await getMusicChartsPage();
    const songs = charts.sections
      .flatMap((s) => s.items)
      .filter((i): i is Extract<YTItem, { type: 'song' }> => i.type === 'song');
    return audioMusicOnly(songs);
  } catch {
    return [];
  }
}

async function fillFromRadio(seedId: string, picks: SongItem[], used: Set<string>): Promise<void> {
  try {
    const first = await getMusicWatchQueue(seedId);
    picks.push(...takeUnused(audioMusicOnly(first.items), QUICK_PICKS_TARGET - picks.length, used));
    let continuation = first.continuation;
    let page = 0;
    while (picks.length < QUICK_PICKS_TARGET && continuation && page < RADIO_MAX_PAGES) {
      page += 1;
      const next = await getMusicQueueContinuation(continuation);
      picks.push(...takeUnused(audioMusicOnly(next.items), QUICK_PICKS_TARGET - picks.length, used));
      continuation = next.continuation;
    }
  } catch {
  }
}

async function buildQuickPicks(
  history: WatchHistoryRecord[],
  nowPlayingId: string | null,
  used: Set<string>,
): Promise<SongItem[]> {
  const picks: SongItem[] = [];
  if (nowPlayingId) used.add(nowPlayingId);

  const seedId = nowPlayingId ?? history.find((h) => h.videoId)?.videoId ?? null;
  if (seedId) await fillFromRadio(seedId, picks, used);

  if (picks.length < QUICK_PICKS_TARGET) {
    const seeds = history.slice(0, 5).map((h) => h.videoId).filter(Boolean);
    const results = await Promise.all(seeds.map(relatedSongs));
    for (const r of results) {
      if (picks.length >= QUICK_PICKS_TARGET) break;
      picks.push(...takeUnused(r, QUICK_PICKS_TARGET - picks.length, used));
    }
  }

  if (picks.length < QUICK_PICKS_TARGET) {
    picks.push(...takeUnused(await chartsSongs(), QUICK_PICKS_TARGET - picks.length, used));
  }

  return picks;
}

async function buildSimilarTo(
  history: WatchHistoryRecord[],
  used: Set<string>,
): Promise<PersonalSection[]> {
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
    const items = takeUnused(await relatedSongs(seed.videoId), 12, used);
    if (items.length >= MIN_SHELF_ITEMS) {
      seenSeeds.add(seed.videoId);
      sections.push({
        id: `similar-${seed.videoId}`,
        title: artist,
        subtitle: getString('music_similar_to'),
        items: items.map(toYTSong),
      });
    }
  }

  const recent = history[0];
  if (recent && !seenSeeds.has(recent.videoId)) {
    const items = takeUnused(await relatedSongs(recent.videoId), 12, used);
    if (items.length >= MIN_SHELF_ITEMS) {
      sections.push({
        id: `similar-${recent.videoId}`,
        title: recent.title,
        subtitle: getString('music_similar_to'),
        items: items.map(toYTSong),
      });
    }
  }
  return sections;
}

async function buildDailyDiscover(
  history: WatchHistoryRecord[],
  used: Set<string>,
): Promise<PersonalSection | null> {
  if (history.length === 0) return null;
  const seeds = shuffle(history).slice(0, 8);
  const results = await Promise.all(seeds.map((seed) => relatedSongs(seed.videoId)));
  const items = takeUnused(audioMusicOnly(results.flat()), 12, used).map(toYTSong);
  if (items.length < MIN_SHELF_ITEMS) return null;
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

async function buildPopularArtists(used: Set<string>): Promise<PersonalSection | null> {
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
  const items = takeUnused(songs, 16, used).map(toYTSong);
  if (items.length < MIN_SHELF_ITEMS) return null;
  return { id: 'popular-artists', title: getString('music_popular_artists'), items };
}

export function useMusicPersonalization(): MusicPersonalization {
  const nowPlaying = usePlayerStore((s) => s.currentVideo);
  const nowPlayingId = nowPlaying && isMusicVideo(nowPlaying) ? nowPlaying.id : null;

  const [quickPicks, setQuickPicks] = useState<SongItem[]>([]);
  const [sections, setSections] = useState<PersonalSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);

  const historyRef = useRef<WatchHistoryRecord[]>([]);
  const sectionIdsRef = useRef<Set<string>>(new Set());
  const sectionsReqRef = useRef(0);
  const quickReqRef = useRef(0);

  useEffect(() => {
    const req = ++sectionsReqRef.current;
    setLoading(true);
    (async () => {
      const history = await getMusicHistory(HISTORY_SEED_LIMIT, 0).catch(() => [] as WatchHistoryRecord[]);
      if (sectionsReqRef.current !== req) return;
      historyRef.current = history;

      const communityP = buildFromCommunity(history);
      const used = new Set<string>();
      const similar = await buildSimilarTo(history, used);
      const daily = await buildDailyDiscover(history, used);
      const popular = await buildPopularArtists(used);
      const community = await communityP;
      if (sectionsReqRef.current !== req) return;

      const next: PersonalSection[] = [...similar];
      if (daily) next.push(daily);
      if (community) next.push(community);
      if (popular) next.push(popular);

      const ids = new Set<string>();
      for (const s of next) for (const it of s.items) {
        const id = ytItemId(it);
        if (id) ids.add(id);
      }
      sectionIdsRef.current = ids;
      setSections(next);
      setLoading(false);
      setDataVersion((v) => v + 1);
    })();
  }, []);

  useEffect(() => {
    const req = ++quickReqRef.current;
    (async () => {
      const used = new Set(sectionIdsRef.current);
      const picks = await buildQuickPicks(historyRef.current, nowPlayingId, used);
      if (quickReqRef.current !== req) return;
      setQuickPicks(picks);
    })();
  }, [nowPlayingId, dataVersion]);

  return { quickPicks, sections, loading };
}
