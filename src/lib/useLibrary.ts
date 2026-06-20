import { useCallback, useEffect, useState } from "react";
import { getWatchHistory } from "./api/db";
import { mapHistoryRecordToVideo } from "./useHistory";
import { loadStoredPlaylists, storedPlaylistToCardSummary } from "./playlistLibrary";
import type { VideoSummary } from "../types/video";
import type { AlbumItem } from "../types/music";

const SHELF_PREVIEW_LIMIT = 15;

export type LibraryPlaylist = ReturnType<typeof storedPlaylistToCardSummary>;

export interface LibraryData {
  history: VideoSummary[];
  playlists: LibraryPlaylist[];
  savedAlbums: AlbumItem[];
  watchLater: VideoSummary[];
  liked: VideoSummary[];
  downloads: VideoSummary[];
}

const EMPTY_LIBRARY: LibraryData = {
  history: [],
  playlists: [],
  savedAlbums: [],
  watchLater: [],
  liked: [],
  downloads: [],
};

export function useLibrary() {
  const [data, setData] = useState<LibraryData>(EMPTY_LIBRARY);
  const [loading, setLoading] = useState(true);

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
        savedAlbums: [],
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

  return { ...data, loading, refresh };
}
