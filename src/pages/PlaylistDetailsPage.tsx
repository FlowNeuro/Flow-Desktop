import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { PlaylistAmbientHeader } from "../components/playlist/PlaylistAmbientHeader";
import { PlaylistSortableList } from "../components/playlist/PlaylistSortableList";
import {
  sortPlaylistVideos,
  type PlaylistSortType,
} from "../lib/playlistSort";
import { updateStoredPlaylistTracks } from "../lib/playlistLibrary";
import { usePlaylistDetails } from "../lib/usePlaylistDetails";
import { usePlayerStore } from "../store/usePlayerStore";
import type { VideoSummary } from "../types/video";

interface PlaylistDetailsPageProps {
  playlistIdOverride?: string;
  onAddToQueue?: (video: VideoSummary) => void;
}

export function PlaylistDetailsPage({
  playlistIdOverride,
  onAddToQueue,
}: PlaylistDetailsPageProps) {
  const params = useParams<{ playlistId: string }>();
  const playlistId = playlistIdOverride ?? params.playlistId;
  const navigate = useNavigate();
  const setQueue = usePlayerStore((state) => state.setQueue);

  const {
    loading,
    error,
    storedPlaylist,
    meta,
    videos,
  } = usePlaylistDetails(playlistId);

  const [sortType, setSortType] = useState<PlaylistSortType>("Manual");
  const [manualVideos, setManualVideos] = useState<VideoSummary[]>([]);

  useEffect(() => {
    setManualVideos(videos);
    setSortType("Manual");
  }, [videos]);

  const displayVideos = useMemo(
    () => sortPlaylistVideos(manualVideos, sortType),
    [manualVideos, sortType],
  );

  const leadVideo = manualVideos[0];
  const heroThumbnailUrl = leadVideo?.thumbnailUrl ?? meta?.thumbnailUrl ?? null;

  const handleReorder = async (nextVideos: VideoSummary[]) => {
    setManualVideos(nextVideos);
    if (storedPlaylist) {
      await updateStoredPlaylistTracks(storedPlaylist.id, nextVideos);
    }
  };

  const playQueue = (shuffle: boolean) => {
    if (displayVideos.length === 0) return;
    const queue = shuffle
      ? [...displayVideos].sort(() => Math.random() - 0.5)
      : displayVideos;
    const first = queue[0];
    if (!first) return;
    setQueue(queue, 0);
    navigate(`/watch/${first.id}`);
  };

  const playFromPlaylist = (video: VideoSummary) => {
    const startIndex = displayVideos.findIndex((item) => item.id === video.id);
    const safeIndex = startIndex >= 0 ? startIndex : 0;
    setQueue(displayVideos, safeIndex);
    navigate(`/watch/${video.id}`);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-[var(--color-primary)]" size={36} />
        <p className="text-sm font-medium text-neutral-500">Loading playlist...</p>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-neutral-400">{error ?? "Playlist not found."}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-4 text-sm font-medium text-[var(--color-primary)] transition-colors hover:opacity-90"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto grid h-full min-h-0 w-full max-w-[1600px] grid-cols-1 gap-8 p-6 lg:grid-cols-[360px_1fr]">
          <PlaylistAmbientHeader
            meta={meta}
            heroVideoId={leadVideo?.id}
            heroThumbnailUrl={heroThumbnailUrl}
          canPlay={displayVideos.length > 0}
          onPlayAll={() => playQueue(false)}
          onShuffle={() => playQueue(true)}
        />

        <PlaylistSortableList
          videos={manualVideos}
          displayVideos={displayVideos}
          sortType={sortType}
          onSortChange={setSortType}
          onReorder={handleReorder}
          onPlay={playFromPlaylist}
          onAddToQueue={onAddToQueue}
        />
      </div>
    </div>
  );
}

export default PlaylistDetailsPage;
