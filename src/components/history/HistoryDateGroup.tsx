import { useState } from "react";
import { VideoShelf } from "../shelf/VideoShelf";
import { VideoGrid } from "../video/VideoGrid";
import { Button } from "../ui/Button";
import { getString } from "../../lib/i18n/index";
import { MusicHistoryGrid } from "./MusicHistoryGrid";
import type { HistoryDateGroup as HistoryDateGroupData } from "../../lib/useHistory";
import type { VideoSummary } from "../../types/video";

interface HistoryDateGroupProps {
  group: HistoryDateGroupData;
  onPlay: (video: VideoSummary) => void;
  onRemoveFromHistory: (videoId: string) => void;
}

export function HistoryDateGroup({
  group,
  onPlay,
  onRemoveFromHistory,
}: HistoryDateGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { dateLabel, videos } = group;
  const musicVideos = videos.filter((video) => video.isMusic);
  const plainVideos = videos.filter((video) => !video.isMusic);

  const getHistoryVideoKey = (video: VideoSummary, index: number) => {
    const watchDate = "watchDate" in video ? String(video.watchDate ?? "unknown") : "unknown";
    return `${dateLabel}-${video.id}-${watchDate}-${index}`;
  };

  const countLabel = [
    plainVideos.length > 0
      ? `${plainVideos.length} ${plainVideos.length === 1 ? "video" : "videos"}`
      : null,
    musicVideos.length > 0
      ? `${musicVideos.length} ${musicVideos.length === 1 ? "song" : "songs"}`
      : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <section className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-neutral-100">
            {dateLabel}
          </h2>
          <p className="mt-1 text-sm text-neutral-400">{countLabel}</p>
        </div>

        {plainVideos.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((current) => !current)}
            className="shrink-0 text-[var(--color-primary)] hover:text-[var(--color-primary)]"
            aria-expanded={isExpanded}
          >
            {isExpanded ? getString("history_collapse") : getString("history_see_all")}
          </Button>
        )}
      </div>

      {plainVideos.length > 0 && (
        <div className="transition-colors duration-200 ease-out">
          {isExpanded ? (
            <VideoGrid
              videos={plainVideos}
              onPlay={onPlay}
              onRemoveFromHistory={onRemoveFromHistory}
              getVideoKey={getHistoryVideoKey}
              variant="history"
              hideChannelAvatar={true}
            />
          ) : (
            <VideoShelf
              videos={plainVideos}
              onPlay={onPlay}
              onRemoveFromHistory={onRemoveFromHistory}
              getVideoKey={getHistoryVideoKey}
              variant="history"
              hideChannelAvatar={true}
            />
          )}
        </div>
      )}

      {musicVideos.length > 0 && (
        <div className={plainVideos.length > 0 ? "mt-6" : ""}>
          <MusicHistoryGrid videos={musicVideos} onRemoveFromHistory={onRemoveFromHistory} />
        </div>
      )}
    </section>
  );
}
