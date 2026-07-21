import { Fragment, type ReactNode } from 'react';
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
  insertAfterIndex?: number;
  insertNode?: ReactNode;
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
  insertAfterIndex,
  insertNode,
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
        <Fragment key={getVideoKey ? getVideoKey(video, index) : `${video.id}-${index}`}>
          {/*
            content-visibility lets the browser skip layout/paint for offscreen
            cards — feeds can hold hundreds, and Linux composites on the CPU.
            The p-1.5/-m-1.5 mirrors the card's hover bleed so the containment
            paint clip lands exactly on the card's expanded edge.
          */}
          <div className="[content-visibility:auto] [contain-intrinsic-size:auto_19rem] p-1.5 -m-1.5">
            <VideoCard
              video={video}
              onPlay={onPlay}
              onAddToQueue={onAddToQueue}
              onRemoveFromHistory={onRemoveFromHistory}
              variant={variant}
              hideChannelAvatar={hideChannelAvatar}
            />
          </div>
          {insertNode && insertAfterIndex === index ? (
            <div className="col-span-full">
              {insertNode}
            </div>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
