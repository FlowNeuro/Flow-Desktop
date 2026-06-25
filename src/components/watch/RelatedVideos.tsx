import { Loader2 } from "lucide-react";
import { VideoCard } from "../video/VideoCard";
import { getString } from "../../lib/i18n/index";
import type { VideoSummary } from "../../types/video";
import type { RelatedVideosProps } from "./types";

export function RelatedVideos({ items, loading, onSelect, onAddToQueue }: RelatedVideosProps) {
  if (loading) {
    return <Loader2 className="mx-auto mt-10 animate-spin text-neutral-500" size={24} />;
  }

  if (items.length === 0) {
    return <p className="mt-6 text-center text-sm text-neutral-500">{getString("watch_no_related")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const video: VideoSummary = {
          id: item.videoId || item.id,
          title: item.title,
          channelName: item.channelName,
          channelId: item.channelId,
          thumbnailUrl: item.thumbnailUrl,
          durationSeconds: item.durationSeconds,
          publishedText: item.publishedText,
          viewCountText: item.viewCountText,
          isLive: item.isLive,
        };
        return (
          <VideoCard
            key={`${item.itemType}-${item.id}`}
            video={video}
            variant="compact"
            onPlay={() => onSelect(item)}
            onAddToQueue={onAddToQueue}
          />
        );
      })}
    </div>
  );
}
