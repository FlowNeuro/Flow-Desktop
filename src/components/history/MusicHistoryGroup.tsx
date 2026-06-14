import { MusicItemCard } from "../music/MusicItemCard";
import type { HistoryVideo, HistoryDateGroup as HistoryDateGroupData } from "../../lib/useHistory";
import type { SongItem } from "../../types/music";
import type { VideoSummary } from "../../types/video";

interface MusicHistoryGroupProps {
  group: HistoryDateGroupData;
  onPlay: (video: VideoSummary) => void;
  onRemoveFromHistory: (videoId: string) => void;
}

function videoToSong(video: HistoryVideo): SongItem {
  const artist = (video.channelName ?? "").replace(/\s*-\s*topic\s*$/i, "").trim();
  return {
    id: video.id,
    title: video.title,
    artists: artist ? [{ name: artist, id: null }] : [],
    album: null,
    duration: video.durationSeconds || null,
    musicVideoType: null,
    thumbnail: video.thumbnailUrl || "",
    explicit: false,
    videoId: video.id,
    playlistId: null,
    params: null,
  };
}

export function MusicHistoryGroup({
  group,
  onPlay,
  onRemoveFromHistory,
}: MusicHistoryGroupProps) {
  const { dateLabel, videos } = group;

  return (
    <section className="min-w-0">
      <div className="mb-3 px-1">
        <h2 className="text-2xl font-bold tracking-tight text-neutral-100">{dateLabel}</h2>
        <p className="mt-1 text-sm text-neutral-400">
          {videos.length} {videos.length === 1 ? "song" : "songs"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
        {videos.map((video, index) => (
          <MusicItemCard
            key={`${dateLabel}-${video.id}-${index}`}
            variant="track-list"
            item={videoToSong(video)}
            className="bg-surface-container-low pr-3"
            onPlay={() => onPlay(video)}
            onMenu={() => onRemoveFromHistory(video.id)}
          />
        ))}
      </div>
    </section>
  );
}

export default MusicHistoryGroup;
