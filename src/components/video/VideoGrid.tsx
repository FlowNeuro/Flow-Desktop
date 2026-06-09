import type { VideoSummary } from '../../types/video';
import { VideoCard } from './VideoCard';
import { SkeletonLoader } from '../ui/SkeletonLoader';

interface VideoGridProps {
  videos?: VideoSummary[];
  loading?: boolean;
  skeletonCount?: number;
  onPlay: (video: VideoSummary) => void;
  onAddToQueue?: (video: VideoSummary) => void;
  onRemoveFromHistory?: (videoId: string) => void;
  getVideoKey?: (video: VideoSummary, index: number) => string;
  variant?: "default" | "history";
  hideChannelAvatar?: boolean;
}

function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <SkeletonLoader type="thumbnail" />
      <div className="flex items-start gap-3 px-1">
        <SkeletonLoader type="avatar" className="shrink-0" />
        <div className="flex flex-col gap-2 w-full pt-1">
          <SkeletonLoader type="title" />
          <SkeletonLoader type="text" className="w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function VideoGrid({
  videos = [],
  loading = false,
  skeletonCount = 12,
  onPlay,
  onAddToQueue,
  onRemoveFromHistory,
  getVideoKey,
  variant = "default",
  hideChannelAvatar,
}: VideoGridProps) {
  const gridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 pb-8";

  if (loading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <VideoCardSkeleton key={`skeleton-${i}`} />
        ))}
      </div>
    );
  }

  return (
    <div className={gridClass}>
      {videos.map((video, index) => (
        <VideoCard 
          key={getVideoKey ? getVideoKey(video, index) : `${video.id}-${index}`} 
          video={video} 
          onPlay={onPlay}
          onAddToQueue={onAddToQueue}
          onRemoveFromHistory={onRemoveFromHistory}
          variant={variant}
          hideChannelAvatar={hideChannelAvatar}
        />
      ))}
    </div>
  );
}
