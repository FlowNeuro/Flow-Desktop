import { useCallback, useEffect, useRef, useState } from 'react';
import { getMusicArtistItems, getMusicArtistPage } from './api/music';
import { getBackendErrorMessage } from './api/errors';
import type {
  AlbumItem,
  ArtistItem,
  ArtistPage,
  ArtistSection,
  PlaylistItem,
  SongItem,
  YTItem,
} from '../types/music';

export interface ArtistMoreEndpoint {
  browseId: string | null;
  params: string | null;
}

export interface ArtistHeader {
  id: string;
  title: string;
  thumbnail: string | null;
  subscriberCountText: string | null;
  monthlyListenerCount: string | null;
  isSubscribed: boolean;
}

export interface ArtistPageData {
  header: ArtistHeader;
  about: string | null;
  topSongs: SongItem[];
  topSongsMore: ArtistMoreEndpoint | null;
  albums: AlbumItem[];
  albumsMore: ArtistMoreEndpoint | null;
  singles: AlbumItem[];
  singlesMore: ArtistMoreEndpoint | null;
  videos: SongItem[];
  related: ArtistItem[];
  featuredOn: PlaylistItem[];
}

type ItemOf<T extends YTItem['type']> = Extract<YTItem, { type: T }>;

const pick = <T extends YTItem['type']>(items: YTItem[], type: T): ItemOf<T>[] =>
  items.filter((i): i is ItemOf<T> => i.type === type);

const moreOf = (s: ArtistSection): ArtistMoreEndpoint | null =>
  s.moreEndpointBrowseId || s.moreEndpointParams
    ? { browseId: s.moreEndpointBrowseId, params: s.moreEndpointParams }
    : null;

function segment(page: ArtistPage): ArtistPageData {
  const data: ArtistPageData = {
    header: {
      id: page.artist.id,
      title: page.artist.title,
      thumbnail: page.artist.thumbnail,
      subscriberCountText: page.subscriberCountText,
      monthlyListenerCount: page.monthlyListenerCount,
      isSubscribed: page.isSubscribed,
    },
    about: page.description?.trim() || null,
    topSongs: [],
    topSongsMore: null,
    albums: [],
    albumsMore: null,
    singles: [],
    singlesMore: null,
    videos: [],
    related: [],
    featuredOn: [],
  };

  for (const section of page.sections) {
    const t = (section.title || '').toLowerCase();
    const isSingles = t.includes('single') || /\beps?\b/.test(t);

    if (!data.topSongs.length && (t.includes('song') || t.includes('popular'))) {
      data.topSongs = pick(section.items, 'song');
      data.topSongsMore = moreOf(section);
    } else if (!data.albums.length && t.includes('album')) {
      data.albums = pick(section.items, 'album');
      data.albumsMore = moreOf(section);
    } else if (!data.singles.length && isSingles) {
      data.singles = pick(section.items, 'album');
      data.singlesMore = moreOf(section);
    } else if (!data.videos.length && t.includes('video')) {
      data.videos = pick(section.items, 'song');
    } else if (
      !data.related.length &&
      (t.includes('fans') || t.includes('related') || t.includes('similar'))
    ) {
      data.related = pick(section.items, 'artist');
    } else if (!data.featuredOn.length && (t.includes('featured') || t.includes('playlist'))) {
      data.featuredOn = pick(section.items, 'playlist');
    }
  }

  return data;
}

export function useArtistPage(browseId: string | undefined) {
  const [data, setData] = useState<ArtistPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!browseId) {
      setLoading(false);
      setError(getBackendErrorMessage(new Error('missing artist id')));
      return;
    }
    const req = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getMusicArtistPage(browseId);
      if (reqRef.current !== req) return;
      setData(segment(page));
    } catch (e) {
      if (reqRef.current === req) {
        setError(getBackendErrorMessage(e));
        setData(null);
      }
    } finally {
      if (reqRef.current === req) setLoading(false);
    }
  }, [browseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}

export function useArtistItems(browseId: string | undefined, params: string | undefined) {
  const [items, setItems] = useState<YTItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqRef = useRef(0);
  const contRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const req = ++reqRef.current;
    contRef.current = null;
    if (!browseId) {
      setItems([]);
      setError(getBackendErrorMessage(new Error('missing browse id')));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setItems([]);
    getMusicArtistItems(browseId, params ?? undefined)
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
      const res = await getMusicArtistItems(browseId, params ?? undefined, contRef.current);
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

  return { items, loading, loadingMore, error, loadMore, hasMore: !!contRef.current };
}
