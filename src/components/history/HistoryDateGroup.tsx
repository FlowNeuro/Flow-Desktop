import { useState } from "react";
import { VideoShelf } from "../shelf/VideoShelf";
import { VideoGrid } from "../video/VideoGrid";
import { Button } from "../ui/Button";
import { getString } from "../../lib/i18n/index";
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
  const getHistoryVideoKey = (video: VideoSummary, index: number) => {
    const watchDate = "watchDate" in video ? String(video.watchDate ?? "unknown") : "unknown";
    return `${dateLabel}-${video.id}-${watchDate}-${index}`;
  };

  return (
    <section className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-neutral-100">
            {dateLabel}
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            {videos.length} {videos.length === 1 ? "video" : "videos"}
          </p>
        </div>

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
      </div>

      <div className="transition-colors duration-200 ease-out">
        {isExpanded ? (
          <VideoGrid
            videos={videos}
            onPlay={onPlay}
            onRemoveFromHistory={onRemoveFromHistory}
            getVideoKey={getHistoryVideoKey}
            variant="history"
            hideChannelAvatar={true}
          />
        ) : (
          <VideoShelf
            videos={videos}
            onPlay={onPlay}
            onRemoveFromHistory={onRemoveFromHistory}
            getVideoKey={getHistoryVideoKey}
            variant="history"
            hideChannelAvatar={true}
          />
        )}
      </div>
    </section>
  );
}
