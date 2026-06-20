import { useCallback, useEffect, useState } from "react";
import { getWatchHistory } from "./api/db";
import { mapHistoryRecordToVideo, type HistoryVideo } from "./useHistory";
import { loadStoredPlaylists, storedPlaylistToCardSummary } from "./playlistLibrary";
import { useAlbumLibraryStore } from "../store/useAlbumLibraryStore";
import type { VideoSummary } from "../types/video";

const SHELF_PREVIEW_LIMIT = 15;

export type LibraryPlaylist = ReturnType<typeof storedPlaylistToCardSummary>;

interface AsyncLibraryData {
  history: HistoryVideo[];
  playlists: LibraryPlaylist[];
  watchLater: VideoSummary[];
  liked: VideoSummary[];
  downloads: VideoSummary[];
}

const EMPTY_LIBRARY: AsyncLibraryData = {
  history: [],
  playlists: [],
  watchLater: [],
  liked: [],
  downloads: [],
};

export function useLibrary() {
  const [data, setData] = useState<AsyncLibraryData>(EMPTY_LIBRARY);
  const [loading, setLoading] = useState(true);

  const savedAlbums = useAlbumLibraryStore((s) => s.albums);
  const albumsLoaded = useAlbumLibraryStore((s) => s.loaded);
  const loadAlbums = useAlbumLibraryStore((s) => s.load);

  useEffect(() => {
    if (!albumsLoaded) void loadAlbums();
  }, [albumsLoaded, loadAlbums]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [historyRecords, storedPlaylists] = await Promise.all([
        getWatchHistory(SHELF_PREVIEW_LIMIT, 0).catch((error) => {
          console.warn("Library: failed to load history", error);
          return [];
        }),
        loadStoredPlaylists().catch((error) => {
          console.warn("Library: failed to load playlists", error);
          return [];
        }),
      ]);

      setData({
        history: historyRecords.map(mapHistoryRecordToVideo),
        playlists: storedPlaylists.map(storedPlaylistToCardSummary),
        watchLater: [],
        liked: [],
        downloads: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...data, savedAlbums, loading, refresh };
}
