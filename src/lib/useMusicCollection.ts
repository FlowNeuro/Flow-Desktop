import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getMusicAlbumContinuation,
  getMusicAlbumPage,
  getMusicPlaylistContinuation,
  getMusicPlaylistPage,
} from './api/music';
import { getBackendErrorMessage } from './api/errors';
import { getString } from './i18n/index';
import { artistsText } from './musicFormat';
import type { AlbumPage, MusicPlaylistPage, SongItem } from '../types/music';

export type CollectionKind = 'album' | 'playlist';

/** Display-normalized header shared by the album & playlist detail pages. */
export interface CollectionMeta {
  kind: CollectionKind;
  title: string;
  thumbnail: string | null;
  typeLabel: string;
  artistName: string | null;
  artistId: string | null;
  stats: string | null;
  description: string | null;
}

interface InitialLoad {
  meta: CollectionMeta;
  songs: SongItem[];
  continuation: string | null;
}

function albumMeta(page: AlbumPage): CollectionMeta {
  const stats = [
    page.album.year ? String(page.album.year) : null,
    page.songCount != null ? getString('music_songs_count', page.songCount) : null,
    page.durationText,
  ]
    .filter((p): p is string => Boolean(p))
    .join('  •  ');
  return {
    kind: 'album',
    title: page.album.title,
    thumbnail: page.album.thumbnail || null,
    typeLabel: getString('music_album_label'),
    artistName: artistsText(page.album.artists) || null,
    artistId: page.album.artists?.[0]?.id ?? null,
    stats: stats || null,
    description: page.description?.trim() || null,
  };
}

function playlistMeta(page: MusicPlaylistPage): CollectionMeta {
  return {
    kind: 'playlist',
    title: page.title,
    thumbnail: page.thumbnail || null,
    typeLabel: getString('music_playlist_label'),
    artistName: page.author?.name ?? null,
    artistId: page.author?.id ?? null,
    stats: page.songCountText?.trim() || null,
    description: page.description?.trim() || null,
  };
}

async function loadAlbum(id: string): Promise<InitialLoad> {
  const page = await getMusicAlbumPage(id);
  return { meta: albumMeta(page), songs: page.songs, continuation: page.continuation };
}

async function loadPlaylist(id: string): Promise<InitialLoad> {
  const page = await getMusicPlaylistPage(id);
  return { meta: playlistMeta(page), songs: page.songs, continuation: page.continuation };
}

/**
 * Shared loader for the music album & playlist detail pages: an initial fetch
 * (header + first song page) plus continuation paging over the track list. The
 * `fetchInitial`/`fetchMore` pair are module-level constants, so they're stable.
 */
export function useMusicCollection(kind: CollectionKind, id: string | undefined) {
  const fetchInitial = kind === 'album' ? loadAlbum : loadPlaylist;
  const fetchMore = kind === 'album' ? getMusicAlbumContinuation : getMusicPlaylistContinuation;

  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqRef = useRef(0);
  const contRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError(getBackendErrorMessage(new Error('missing id')));
      return;
    }
    const req = ++reqRef.current;
    setLoading(true);
    setError(null);
    contRef.current = null;
    setSongs([]);
    setMeta(null);
    try {
      const res = await fetchInitial(id);
      if (reqRef.current !== req) return;
      setMeta(res.meta);
      setSongs(res.songs);
      contRef.current = res.continuation;
    } catch (e) {
      if (reqRef.current === req) setError(getBackendErrorMessage(e));
    } finally {
      if (reqRef.current === req) setLoading(false);
    }
  }, [id, fetchInitial]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !contRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const req = reqRef.current;
    try {
      const [more, next] = await fetchMore(contRef.current);
      if (reqRef.current !== req) return;
      contRef.current = next;
      setSongs((prev) => [...prev, ...more]);
    } catch {
      contRef.current = null;
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchMore]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    meta,
    songs,
    loading,
    loadingMore,
    error,
    hasMore: !!contRef.current,
    loadMore,
    reload: load,
  };
}
