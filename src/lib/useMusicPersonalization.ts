import { useEffect, useRef, useState } from 'react';
import { getMusicHistory } from './api/db';
import {
  getDailyMixes,
  getHeavyRotation,
  getMusicArtistPage,
  getMusicChartsPage,
  getMusicQueueContinuation,
  getMusicRelatedTyped,
  getMusicTasteProfile,
  getMusicWatchQueue,
  rankMusicCandidates,
  searchMusicTyped,
  type MusicRankSurface,
} from './api/music';
import { segmentArtistPage } from './useArtistPage';
import { getString } from './i18n/index';
import { interleaveQuickPickLanes, selectQuickPickSeeds } from './musicQuickPicks';
import { useMusicPlayerStore } from '../store/useMusicPlayerStore';
import type { MusicTasteProfile, SongItem, YTItem } from '../types/music';
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
const MIN_SHELF_ITEMS = 4;
const QUICK_PICKS_TARGET = 24;
const QUICK_PICKS_SEED_LIMIT = 5;
const QUICK_PICKS_RADIO_SEEDS = 2;
const QUICK_PICKS_LANE_SIZE = 20;
const RADIO_MAX_PAGES = 2;

// --- Artist-graph discovery ("Fans of {Artist} also like") ----------------
const SIMILAR_MAX_ANCHORS = 2;
const ARTIST_GRAPH_BASE_ANCHORS = 2;
const ARTIST_GRAPH_HIGH_APPETITE = 0.45; // ≥ this → one extra anchor + discovery surfaced earlier
const ARTIST_GRAPH_MAX_ANCHORS = 3;
const ARTIST_GRAPH_RELATED_CONSIDERED = 4; // top related artists eyed per anchor…
const ARTIST_GRAPH_RELATED_FETCHED = 3; // …of which we fetch this many (budget permitting)
const ARTIST_GRAPH_TRACKS_PER_RELATED = 3;
const ARTIST_GRAPH_SHELF_SIZE = 14;
const ARTIST_GRAPH_MAX_FETCHES = 8; // hard cap on artist-page fetches per home build

// Cross-reload repetition guard: a session-scoped FIFO ring of recently-surfaced track ids.
// Discovery/recall shelves avoid these so reloading the home yields fresh content; On Repeat
// and Daily Mixes deliberately ignore it (they are meant to be stable).
const RECENTLY_SHOWN_MAX = 200;
const MAX_PERSONAL_SHELVES = 8;

let recentlyShown: string[] = [];

function snapshotRecentlyShown(): Set<string> {
  return new Set(recentlyShown);
}

function rememberShown(ids: Iterable<string>): void {
  for (const id of ids) {
    if (!id || recentlyShown.includes(id)) continue;
    recentlyShown.push(id);
  }
  if (recentlyShown.length > RECENTLY_SHOWN_MAX) {
    recentlyShown = recentlyShown.slice(recentlyShown.length - RECENTLY_SHOWN_MAX);
  }
}

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

// Picks up to `n` songs not already claimed (`used`) or recently surfaced (`avoid`). Only
// `used` is mutated — `avoid` is a read-only suppression set (the recently-shown ring).
function takeUnused(
  songs: SongItem[],
  n: number,
  used: Set<string>,
  avoid?: Set<string>,
): SongItem[] {
  const out: SongItem[] = [];
  for (const s of songs) {
    const id = songIdOf(s);
    if (!id || used.has(id) || (avoid && avoid.has(id))) continue;
    used.add(id);
    out.push(s);
    if (out.length >= n) break;
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Local taste ranking over YT Music recall. A cold/empty brain is a stable pass-through,
// and any failure falls back to the original order — so this never breaks a shelf.
async function ranked(songs: SongItem[], surface: MusicRankSurface): Promise<SongItem[]> {
  if (songs.length <= 1) return songs;
  try {
    return await rankMusicCandidates(songs, surface);
  } catch {
    return songs;
  }
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

async function gatherRadio(seedId: string, cap: number): Promise<SongItem[]> {
  const pool: SongItem[] = [];
  try {
    const first = await getMusicWatchQueue(seedId, `RDAMVM${seedId}`);
    pool.push(...first.items);
    let continuation = first.continuation;
    let page = 0;
    while (pool.length < cap && continuation && page < RADIO_MAX_PAGES) {
      page += 1;
      const next = await getMusicQueueContinuation(continuation);
      pool.push(...next.items);
      continuation = next.continuation;
    }
  } catch {
  }
  return pool;
}

async function buildQuickPicks(
  history: WatchHistoryRecord[],
  currentTrack: SongItem | null,
  used: Set<string>,
): Promise<SongItem[]> {
  const seeds = selectQuickPickSeeds(history, currentTrack, QUICK_PICKS_SEED_LIMIT);
  const seedIds = new Set(seeds.map((seed) => seed.videoId));
  for (const id of seedIds) used.add(id);

  // Recall independent radio/related lanes plus charts on every build. Ranking within each
  // lane preserves taste relevance; round-robin mixing keeps one station from owning the shelf.
  const [radioResults, relatedResults, charts] = await Promise.all([
    Promise.all(
      seeds
        .slice(0, QUICK_PICKS_RADIO_SEEDS)
        .map((seed) => gatherRadio(seed.videoId, QUICK_PICKS_LANE_SIZE)),
    ),
    Promise.all(seeds.map((seed) => relatedSongs(seed.videoId))),
    chartsSongs(),
  ]);

  const personalizedLanes = await Promise.all(
    [...radioResults, ...relatedResults].map((lane) => ranked(audioMusicOnly(lane), 'quick_picks')),
  );
  const discoveryLane = await ranked(charts, 'discover');
  return interleaveQuickPickLanes(
    [...personalizedLanes, discoveryLane],
    QUICK_PICKS_TARGET,
    used,
  );
}

/** artist_key → a representative seed videoId, mirroring the backend's `artist_key()`
 *  (channelId when present, else lowercased channelName). First (most recent) wins. */
function historyArtistSeeds(history: WatchHistoryRecord[]): Map<string, string> {
  const seeds = new Map<string, string>();
  for (const h of history) {
    if (!h.videoId) continue;
    const id = (h.channelId ?? '').trim();
    const key = id !== '' ? id : (h.channelName ?? '').trim().toLowerCase();
    if (key && !seeds.has(key)) seeds.set(key, h.videoId);
  }
  return seeds;
}

interface SimilarAnchor {
  key: string;
  name: string;
  seed: string;
}

// "Similar to {Artist}" — song-radio around the user's favorite artists. Anchors are taken
// from the brain's affinity ranking (the real taste model) and grounded to a seed track via
// history; only when the profile is cold/unavailable does it fall back to raw history counts.
async function buildSimilarTo(
  profile: MusicTasteProfile | null,
  history: WatchHistoryRecord[],
  used: Set<string>,
  usedAnchors: Set<string>,
  avoid: Set<string>,
): Promise<PersonalSection[]> {
  if (history.length === 0) return [];
  const seeds = historyArtistSeeds(history);

  const anchors: SimilarAnchor[] = [];
  for (const a of profile?.topArtists ?? []) {
    if (usedAnchors.has(a.key)) continue;
    const seed = seeds.get(a.key);
    if (!seed) continue;
    anchors.push({ key: a.key, name: a.name, seed });
    if (anchors.length >= SIMILAR_MAX_ANCHORS) break;
  }
  if (anchors.length === 0) {
    // Fallback: top artists by raw history counts (cold brain or profile fetch failed).
    const byArtist = new Map<string, WatchHistoryRecord[]>();
    for (const h of history) {
      const artist = (h.channelName ?? '').trim();
      if (!artist) continue;
      const list = byArtist.get(artist) ?? [];
      list.push(h);
      byArtist.set(artist, list);
    }
    const top = shuffle(
      [...byArtist.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6),
    ).slice(0, SIMILAR_MAX_ANCHORS);
    for (const [artist, recs] of top) {
      const seed = recs.find((r) => r.videoId)?.videoId;
      if (!seed) continue;
      const key = (recs[0]?.channelId ?? '').trim() || artist.toLowerCase();
      if (usedAnchors.has(key)) continue;
      anchors.push({ key, name: artist, seed });
    }
  }

  const sections: PersonalSection[] = [];
  const seenSeeds = new Set<string>();
  for (const anchor of anchors) {
    usedAnchors.add(anchor.key);
    const items = takeUnused(await ranked(await relatedSongs(anchor.seed), 'similar'), 12, used, avoid);
    if (items.length >= MIN_SHELF_ITEMS) {
      seenSeeds.add(anchor.seed);
      sections.push({
        id: `similar-${anchor.key}`,
        title: anchor.name,
        subtitle: getString('music_similar_to'),
        items: items.map(toYTSong),
      });
    }
  }

  const recent = history[0];
  if (recent?.videoId && !seenSeeds.has(recent.videoId)) {
    const items = takeUnused(await ranked(await relatedSongs(recent.videoId), 'similar'), 12, used, avoid);
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

// "Fans of {Artist} also like" — the artist-similarity graph. For the user's top id-keyed
// artists, follow the artist page's "Fans might also like" edge into adjacent artists and
// surface their top tracks. This widens discovery beyond same-song radio. Bounded to
// ARTIST_GRAPH_MAX_FETCHES artist-page calls per build; skipped on cold-start (no anchors).
async function buildArtistGraph(
  profile: MusicTasteProfile | null,
  used: Set<string>,
  usedAnchors: Set<string>,
  avoid: Set<string>,
): Promise<PersonalSection[]> {
  if (!profile || profile.maturity === 'cold_start') return [];
  const candidates = profile.topArtists.filter((a) => a.idKeyed && !usedAnchors.has(a.key));
  if (candidates.length === 0) return [];

  const anchorCount =
    profile.discoveryAppetite >= ARTIST_GRAPH_HIGH_APPETITE
      ? ARTIST_GRAPH_MAX_ANCHORS
      : ARTIST_GRAPH_BASE_ANCHORS;
  const anchors = candidates.slice(0, anchorCount);

  const sections: PersonalSection[] = [];
  const seenRelated = new Set<string>(); // dedupe related artists across anchors
  let fetches = 0;

  for (const anchor of anchors) {
    if (fetches >= ARTIST_GRAPH_MAX_FETCHES) break;
    usedAnchors.add(anchor.key);

    let related;
    try {
      fetches += 1;
      related = segmentArtistPage(await getMusicArtistPage(anchor.key)).related;
    } catch {
      continue;
    }

    const budget = Math.max(0, ARTIST_GRAPH_MAX_FETCHES - fetches);
    const fetchable = related
      .filter((r) => r.id && !seenRelated.has(r.id))
      .slice(0, ARTIST_GRAPH_RELATED_CONSIDERED)
      .slice(0, Math.min(ARTIST_GRAPH_RELATED_FETCHED, budget));
    if (fetchable.length === 0) continue;
    fetchable.forEach((r) => seenRelated.add(r.id));
    fetches += fetchable.length;

    const pages = await Promise.allSettled(fetchable.map((r) => getMusicArtistPage(r.id)));
    const pool: SongItem[] = [];
    for (const res of pages) {
      if (res.status !== 'fulfilled') continue;
      const songs = audioMusicOnly(segmentArtistPage(res.value).topSongs);
      pool.push(...songs.slice(0, ARTIST_GRAPH_TRACKS_PER_RELATED));
    }

    const rankedPool = await ranked(audioMusicOnly(pool), 'similar');
    const items = takeUnused(rankedPool, ARTIST_GRAPH_SHELF_SIZE, used, avoid).map(toYTSong);
    if (items.length >= MIN_SHELF_ITEMS) {
      sections.push({
        id: `fans-${anchor.key}`,
        title: getString('music_fans_also_like', anchor.name),
        items,
      });
    }
  }
  return sections;
}

async function buildDailyDiscover(
  history: WatchHistoryRecord[],
  used: Set<string>,
  avoid: Set<string>,
): Promise<PersonalSection | null> {
  if (history.length === 0) return null;
  const seeds = shuffle(history).slice(0, 8);
  const results = await Promise.all(seeds.map((seed) => relatedSongs(seed.videoId)));
  const pool = await ranked(audioMusicOnly(results.flat()), 'discover');
  const items = takeUnused(pool, 12, used, avoid).map(toYTSong);
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

// "On Repeat": the user's heavy-rotation tracks (ACT-R activation), resolved locally
// by the music brain — no network. Empty until there's enough listening history.
async function buildHeavyRotation(used: Set<string>): Promise<PersonalSection | null> {
  try {
    const songs = audioMusicOnly(await getHeavyRotation(16));
    const items = takeUnused(songs, 16, used).map(toYTSong);
    if (items.length < MIN_SHELF_ITEMS) return null;
    return { id: 'on-repeat', title: getString('music_on_repeat'), items };
  } catch {
    return null;
  }
}

// Daily Mixes: clusters of the user's favorite artists (grouped by co-listening in the
// music brain), each expanded into a playlist via YT Music related songs and ranked.
async function buildDailyMixes(used: Set<string>): Promise<PersonalSection[]> {
  let mixes;
  try {
    mixes = await getDailyMixes(3);
  } catch {
    return [];
  }
  const sections: PersonalSection[] = [];
  for (const mix of mixes) {
    const seeds = mix.seedTrackIds.slice(0, 3);
    const related = (await Promise.all(seeds.map(relatedSongs))).flat();
    const pool = await ranked(audioMusicOnly(related), 'discover');
    const items = takeUnused(pool, 14, used).map(toYTSong);
    if (items.length >= MIN_SHELF_ITEMS) {
      sections.push({
        id: `mix-${mix.label}`,
        title: `${mix.label} ${getString('music_mix')}`,
        items,
      });
    }
  }
  return sections;
}

// Cold-start surface: real charts (what's genuinely popular now), discovery-ranked —
// replaces the old hardcoded artist list.
async function buildPopularArtists(
  used: Set<string>,
  avoid: Set<string>,
): Promise<PersonalSection | null> {
  const pool = await ranked(await chartsSongs(), 'discover');
  const items = takeUnused(pool, 16, used, avoid).map(toYTSong);
  if (items.length < MIN_SHELF_ITEMS) return null;
  return { id: 'popular-artists', title: getString('music_popular_artists'), items };
}

interface BuiltSections {
  heavy: PersonalSection | null;
  mixes: PersonalSection[];
  fans: PersonalSection[];
  similar: PersonalSection[];
  daily: PersonalSection | null;
  community: PersonalSection | null;
  popular: PersonalSection | null;
}

// Dynamically orders the home shelves from the user's state instead of a fixed list:
//  • cold_start → comfort/charts-led (no artist-graph yet); never an empty home.
//  • high discovery appetite → graph-driven discovery surfaced early (after On Repeat).
//  • otherwise → comfort-first, discovery after.
// Capped at MAX_PERSONAL_SHELVES so the home never becomes an endless wall.
function planSections(profile: MusicTasteProfile | null, b: BuiltSections): PersonalSection[] {
  const maturity = profile?.maturity ?? 'cold_start';
  const highAppetite = (profile?.discoveryAppetite ?? 0) >= ARTIST_GRAPH_HIGH_APPETITE;
  const out: PersonalSection[] = [];
  const push = (s: PersonalSection | null | undefined) => {
    if (s) out.push(s);
  };
  const pushAll = (arr: PersonalSection[]) => out.push(...arr);

  if (maturity === 'cold_start') {
    push(b.heavy);
    push(b.popular);
    push(b.daily);
    push(b.community);
    pushAll(b.similar);
  } else if (highAppetite) {
    push(b.heavy);
    pushAll(b.fans);
    push(b.daily);
    pushAll(b.mixes);
    pushAll(b.similar);
    push(b.community);
    push(b.popular);
  } else {
    push(b.heavy);
    pushAll(b.mixes);
    pushAll(b.similar);
    pushAll(b.fans);
    push(b.daily);
    push(b.community);
    push(b.popular);
  }
  return out.slice(0, MAX_PERSONAL_SHELVES);
}

export function useMusicPersonalization(): MusicPersonalization {
  const currentTrack = useMusicPlayerStore((s) => s.currentTrack);
  const currentTrackId = currentTrack ? songIdOf(currentTrack) : null;

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
      const [history, profile] = await Promise.all([
        getMusicHistory(HISTORY_SEED_LIMIT, 0).catch(() => [] as WatchHistoryRecord[]),
        getMusicTasteProfile().catch(() => null),
      ]);
      if (sectionsReqRef.current !== req) return;
      historyRef.current = history;

      const communityP = buildFromCommunity(history);
      const used = new Set<string>();
      const usedAnchors = new Set<string>();
      // Avoid re-surfacing tracks shown on a recent reload — discovery/recall shelves only.
      const avoid = snapshotRecentlyShown();

      // On Repeat + Daily Mixes run first (claim the strongest tracks) and intentionally
      // ignore the recently-shown ring — they are meant to be stable. The artist-graph then
      // claims the best id-keyed anchors before Similar-To takes the remainder.
      const heavy = await buildHeavyRotation(used);
      const mixes = await buildDailyMixes(used);
      const fans = await buildArtistGraph(profile, used, usedAnchors, avoid);
      const similar = await buildSimilarTo(profile, history, used, usedAnchors, avoid);
      const daily = await buildDailyDiscover(history, used, avoid);
      const popular = await buildPopularArtists(used, avoid);
      const community = await communityP;
      if (sectionsReqRef.current !== req) return;

      const next = planSections(profile, {
        heavy,
        mixes,
        fans,
        similar,
        daily,
        community,
        popular,
      });

      const ids = new Set<string>();
      for (const s of next) for (const it of s.items) {
        const id = ytItemId(it);
        if (id) ids.add(id);
      }
      sectionIdsRef.current = ids;
      rememberShown(ids); // refresh the cross-reload repetition guard
      setSections(next);
      setLoading(false);
      setDataVersion((v) => v + 1);
    })();
  }, []);

  useEffect(() => {
    const req = ++quickReqRef.current;
    (async () => {
      const used = new Set(sectionIdsRef.current);
      const picks = await buildQuickPicks(historyRef.current, currentTrack, used);
      if (quickReqRef.current !== req) return;
      setQuickPicks(picks);
    })();
  }, [currentTrackId, dataVersion]);

  return { quickPicks, sections, loading };
}
