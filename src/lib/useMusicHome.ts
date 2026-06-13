import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getMusicChartsPage,
  getMusicHomePage,
  getMusicMoodGenre,
  getMusicNewReleases,
} from './api/music';
import { getBackendErrorMessage } from './api/errors';
import { getString } from './i18n/index';
import type { AlbumItem, MusicHomeChip, MusicShelf, SongItem, YTItem } from '../types/music';

export interface MusicHomeData {
  chips: MusicHomeChip[];
  quickPicks: SongItem[];
  sections: MusicShelf[];
}

const EAGER_PAGES = 3;
const QUICK_PICKS_MAX = 24;

const songsOf = (items: YTItem[]): SongItem[] =>
  items.filter((i): i is Extract<YTItem, { type: 'song' }> => i.type === 'song');

const isQuickPicks = (items: YTItem[]) => {
  const songs = songsOf(items).length;
  return songs >= 4 && songs >= items.length / 2;
};

function pickQuickPicks(sections: MusicShelf[]): { quickPicks: SongItem[]; rest: MusicShelf[] } {
  const rest: MusicShelf[] = [];
  let quickPicks: SongItem[] = [];
  for (const section of sections) {
    if (quickPicks.length === 0 && isQuickPicks(section.items)) {
      quickPicks = songsOf(section.items).slice(0, QUICK_PICKS_MAX);
      continue;
    }
    rest.push(section);
  }
  if (quickPicks.length === 0) {
    quickPicks = rest.flatMap((s) => songsOf(s.items)).slice(0, QUICK_PICKS_MAX);
  }
  return { quickPicks, rest };
}

export function useMusicHome() {
  const [data, setData] = useState<MusicHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqRef = useRef(0);
  const contRef = useRef<string | null>(null);
  const sectionsRef = useRef<MusicShelf[]>([]);
  const seenTitlesRef = useRef<Set<string>>(new Set());
  const chipsRef = useRef<MusicHomeChip[]>([]);
  const quickPicksRef = useRef<SongItem[]>([]);
  const loadingMoreRef = useRef(false);
  const busyRef = useRef(false);

  const publish = () =>
    setData({
      chips: chipsRef.current,
      quickPicks: quickPicksRef.current,
      sections: [...sectionsRef.current],
    });

  const addSections = (incoming: MusicShelf[]) => {
    for (const section of incoming) {
      const key = (section.title || '').trim().toLowerCase();
      if (key && seenTitlesRef.current.has(key)) continue;
      if (key) seenTitlesRef.current.add(key);
      sectionsRef.current.push(section);
    }
  };

  const load = useCallback(async () => {
    const req = ++reqRef.current;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    setLoadingMore(false);
    contRef.current = null;
    sectionsRef.current = [];
    seenTitlesRef.current = new Set();
    chipsRef.current = [];
    quickPicksRef.current = [];

    try {
      const home = await getMusicHomePage();
      if (reqRef.current !== req) return;

      chipsRef.current = home.chips ?? [];
      const { quickPicks, rest } = pickQuickPicks(home.sections ?? []);
      quickPicksRef.current = quickPicks;
      addSections(rest);
      contRef.current = home.continuation ?? null;
      publish();
      setLoading(false);

      for (let i = 0; i < EAGER_PAGES && contRef.current; i += 1) {
        const more = await getMusicHomePage(contRef.current);
        if (reqRef.current !== req) return;
        contRef.current = more.continuation ?? null;
        addSections(more.sections ?? []);
        publish();
      }

      const [charts, newReleases] = await Promise.all([
        getMusicChartsPage().catch(() => null),
        getMusicNewReleases().catch(() => [] as AlbumItem[]),
      ]);
      if (reqRef.current !== req) return;

      const extra: MusicShelf[] = [];
      if (newReleases.length) {
        extra.push({
          title: getString('music_new_releases'),
          subtitle: null,
          browseId: null,
          params: null,
          items: newReleases.map((a) => ({ type: 'album' as const, ...a })),
        });
      }
      for (const cs of charts?.sections ?? []) {
        extra.push({ title: cs.title, subtitle: null, browseId: null, params: null, items: cs.items });
      }
      addSections(extra);
      publish();
    } catch (e) {
      if (reqRef.current === req) setError(getBackendErrorMessage(e));
    } finally {
      busyRef.current = false;
      if (reqRef.current === req) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (busyRef.current || loadingMoreRef.current || !contRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const req = reqRef.current;
    try {
      const more = await getMusicHomePage(contRef.current);
      if (reqRef.current !== req) return;
      contRef.current = more.continuation ?? null;
      addSections(more.sections ?? []);
      publish();
    } catch {
      contRef.current = null;
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load, loadMore, hasMore: !!contRef.current, loadingMore };
}

export function useMusicChipFilter(chip: MusicHomeChip | null) {
  const [items, setItems] = useState<YTItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqRef = useRef(0);
  const contRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const browseId = chip?.browseId ?? null;
  const params = chip?.params ?? null;

  useEffect(() => {
    const req = ++reqRef.current;
    contRef.current = null;
    if (!browseId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setItems([]);
    getMusicMoodGenre(browseId, params ?? undefined)
      .then((res) => {
        if (reqRef.current !== req) return;
        setItems(res.items);
        contRef.current = res.continuation ?? null;
      })
      .catch((e) => {
        if (reqRef.current === req) setError(getBackendErrorMessage(e));
      })
      .finally(() => {
        if (reqRef.current === req) setLoading(false);
      });
  }, [browseId, params]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !contRef.current || !browseId) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const req = reqRef.current;
    try {
      const res = await getMusicMoodGenre(browseId, params ?? undefined, contRef.current);
      if (reqRef.current !== req) return;
      contRef.current = res.continuation ?? null;
      setItems((prev) => [...prev, ...res.items]);
    } catch {
      contRef.current = null;
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [browseId, params]);

  return { items, loading, error, loadMore, hasMore: !!contRef.current, loadingMore };
}
