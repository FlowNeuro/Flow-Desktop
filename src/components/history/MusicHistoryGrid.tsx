import { useMemo } from "react";
import { MusicItemCard } from "../music/MusicItemCard";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { historyVideoToSong, type HistoryVideo } from "../../lib/useHistory";

interface MusicHistoryGridProps {
  videos: HistoryVideo[];
  onRemoveFromHistory: (videoId: string) => void;
}

export function MusicHistoryGrid({ videos, onRemoveFromHistory }: MusicHistoryGridProps) {
  const playQueue = useMusicPlayerStore((s) => s.playQueue);
  const songs = useMemo(() => videos.map(historyVideoToSong), [videos]);

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
      {videos.map((video, index) => (
        <MusicItemCard
          key={`${video.id}-${index}`}
          variant="track-list"
          item={historyVideoToSong(video)}
          className="bg-surface-container-low pr-3"
          onPlay={() => void playQueue(songs, index)}
          onMenu={() => onRemoveFromHistory(video.id)}
        />
      ))}
    </div>
  );
}

export default MusicHistoryGrid;
