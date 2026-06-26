import { useEffect } from "react";

import { useCollectionDownloadStore } from "../store/useCollectionDownloadStore";
import { useDownloadCollectionsLibraryStore } from "../store/useDownloadCollectionsLibraryStore";
import { getMusicAlbumContinuation, getMusicAlbumPage } from "./api/music";
import type { DownloadCollectionKind, DownloadCollectionRecord } from "./api/downloads";
import type { AlbumItem, SongItem } from "../types/music";

const ALBUM_PAGE_GUARD = 30;

export interface CollectionDownloadState {
  /** Total items in the playlist/album. */
  total: number;
  /** Items already saved. */
  completed: number;
  /** A download run is in flight. */
  active: boolean;
  isComplete: boolean;
  /** A run or saved record exists for this collection. */
  exists: boolean;
}

function useEnsureCollectionsLoaded() {
  const loaded = useDownloadCollectionsLibraryStore((state) => state.loaded);
  const load = useDownloadCollectionsLibraryStore((state) => state.load);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
}

/** The persisted collections plus mutators; loads itself on first use. */
export function useDownloadCollectionsLibrary() {
  useEnsureCollectionsLoaded();
  const records = useDownloadCollectionsLibraryStore((state) => state.records);
  const loading = useDownloadCollectionsLibraryStore((state) => state.loading);
  const remove = useDownloadCollectionsLibraryStore((state) => state.remove);
  const reload = useDownloadCollectionsLibraryStore((state) => state.load);
  return { records, loading, remove, reload };
}

/** Live + persisted download progress for one playlist/album. */
export function useCollectionDownloadState(
  collectionId: string | null | undefined,
  kind: DownloadCollectionKind,
): CollectionDownloadState {
  useEnsureCollectionsLoaded();
  const run = useCollectionDownloadStore((state) =>
    collectionId
      ? Object.values(state.runs).find((r) => r.collectionId === collectionId && r.kind === kind)
      : undefined,
  );
  const record = useDownloadCollectionsLibraryStore((state) =>
    collectionId
      ? state.records.find((r) => r.collectionId === collectionId && r.kind === kind)
      : undefined,
  );

  const total = run?.total ?? record?.totalCount ?? 0;
  const completed = Math.max(run?.completed ?? 0, record?.downloadedCount ?? 0);
  const active = run?.active ?? false;
  return {
    total,
    completed,
    active,
    isComplete: total > 0 && completed >= total && !active,
    exists: Boolean(run || record),
  };
}

/** Fetches an album's full track list (following continuations) and downloads it. */
export async function downloadAlbum(album: AlbumItem): Promise<void> {
  const page = await getMusicAlbumPage(album.browseId);
  const songs: SongItem[] = [...page.songs];
  let continuation = page.continuation;
  let guard = 0;
  while (continuation && guard < ALBUM_PAGE_GUARD) {
    const [moreSongs, nextContinuation] = await getMusicAlbumContinuation(continuation);
    songs.push(...moreSongs);
    continuation = nextContinuation;
    guard += 1;
  }
  await useCollectionDownloadStore.getState().startAlbum(
    {
      collectionId: album.browseId,
      title: album.title,
      author: album.artists?.[0]?.name ?? undefined,
      thumbnailUrl: album.thumbnail || undefined,
    },
    songs,
  );
}

/** Progress for a persisted collection record, merged with any live run. */
export function collectionProgress(
  record: DownloadCollectionRecord,
  run: { total: number; completed: number; active: boolean } | undefined,
): CollectionDownloadState {
  const total = run?.total ?? record.totalCount;
  const completed = Math.max(run?.completed ?? 0, record.downloadedCount);
  const active = run?.active ?? false;
  return {
    total,
    completed,
    active,
    isComplete: total > 0 && completed >= total && !active,
    exists: true,
  };
}
