import { useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '../../store/useSubscriptionStore';
import { useFeedActionsStore } from '../../store/useFeedActionsStore';
import { useLiveStore } from '../../store/useLiveStore';
import { Plus, Ban, Check, MoreVertical, Trash2, GripHorizontal, Sparkles, Eye, EyeOff, Clock, ListPlus } from 'lucide-react';
import type { VideoSummary } from '../../types/video';
import { Button } from '../ui/Button';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getDeArrowOverride } from '../../lib/api/foss';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAppSettingsStore } from '../../store/useAppSettingsStore';
import { useChannelAvatar } from '../../lib/useChannelAvatar';
import { isUnavailableYoutubeThumbnail, resolveYoutubeThumbnailCandidates, upgradeAvatarUrl } from '../../lib/thumbnails';
import { useProxiedImageUrl } from '../../lib/useProxiedImageUrl';
import { SETTINGS } from '../../lib/settings/schema';
import { AnchoredPortalMenu, type MenuAnchor } from '../ui/AnchoredPortalMenu';
import { getString } from '../../lib/i18n/index';
import {
  addVideoToWatchLater,
  isVideoInWatchLater,
  removeVideoFromWatchLater,
} from '../../lib/playlistLibrary';
import { useUiStore } from '../../store/useUiStore';
import { usePlaylistModalStore } from '../../store/usePlaylistModalStore';

export interface VideoCardProps {
  video: VideoSummary;
  onPlay: (video: VideoSummary) => void;
  onAddToQueue?: (video: VideoSummary) => void;
  onRemoveFromHistory?: (videoId: string) => void;
  variant?: 'default' | 'grid' | 'history' | 'list' | 'compact';
  hideChannelAvatar?: boolean;
  showDragHandle?: boolean;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: React.Ref<HTMLButtonElement>;
  };
  isDragActive?: boolean;
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function LiveBadge({ className }: { className?: string }) {
  return (
    <div
      className={`z-10 flex items-center gap-1 rounded bg-primary px-1 py-px text-[11px] font-bold uppercase leading-tight tracking-wide text-on-primary ${className || ''}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      Live
    </div>
  );
}

function getTitleClampStyle(maxLines: string | undefined): React.CSSProperties | undefined {
  const lines = Number(maxLines ?? '1');
  if (!Number.isFinite(lines) || lines <= 0) return undefined;
  return {
    display: '-webkit-box',
    WebkitLineClamp: Math.max(1, Math.min(3, Math.trunc(lines))),
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

// ─── Thumbnail Color Extraction ────────────────────────────────

function extractDominantColor(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const sampleSize = 16;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

    let totalR = 0, totalG = 0, totalB = 0, count = 0;
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i] ?? 0;
      const g = imageData[i + 1] ?? 0;
      const b = imageData[i + 2] ?? 0;

      const brightness = (r + g + b) / 3;
      if (brightness < 30 || brightness > 230) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 20) continue;

      totalR += r;
      totalG += g;
      totalB += b;
      count++;
    }

    if (count === 0) return null;

    const avgR = Math.round(totalR / count);
    const avgG = Math.round(totalG / count);
    const avgB = Math.round(totalB / count);

    return `${avgR}, ${avgG}, ${avgB}`;
  } catch {
    return null;
  }
}

export function VideoCard({
  video,
  onPlay,
  onAddToQueue,
  onRemoveFromHistory,
  variant = 'default',
  hideChannelAvatar,
  showDragHandle = true,
  dragHandleProps,
  isDragActive = false,
}: VideoCardProps) {
  const navigate = useNavigate();
  const { isSubscribed, subscribe, unsubscribe } = useSubscriptionStore();
  const notInterested = useFeedActionsStore((s) => s.notInterested);
  const blockChannelAction = useFeedActionsStore((s) => s.blockChannel);
  const markWatched = useFeedActionsStore((s) => s.markWatched);
  const moreLikeThis = useFeedActionsStore((s) => s.moreLikeThis);
  const showToast = useUiStore((s) => s.showToast);
  const openAddToPlaylist = usePlaylistModalStore((s) => s.openAddToPlaylist);
  const [overriddenTitle, setOverriddenTitle] = useState<string | null>(null);
  const [overriddenThumbnail, setOverriddenThumbnail] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isSavedToWatchLater, setIsSavedToWatchLater] = useState(false);
  const [thumbnailCandidateIndex, setThumbnailCandidateIndex] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLImageElement>(null);

  const isChannel = video.id.startsWith("channel:");
  const cleanId = isChannel ? video.id.replace("channel:", "") : video.id;
  const channelId = video.channelId || "";

  const markLive = useLiveStore((s) => s.markLive);
  const liveFromStore = useLiveStore((s) => s.liveIds.has(video.id));
  const isLiveVideo = !!video.isLive || liveFromStore;

  useEffect(() => {
    if (video.isLive) markLive(video.id);
  }, [video.id, video.isLive, markLive]);

  useEffect(() => {
    if (isChannel) return;

    let active = true;
    isVideoInWatchLater(video.id)
      .then((saved) => {
        if (active) setIsSavedToWatchLater(saved);
      })
      .catch((error) => {
        console.warn("Failed to read Watch Later state", error);
      });

    return () => {
      active = false;
    };
  }, [isChannel, video.id]);

  const { dearrowEnabled } = useSettingsStore();
  const titleClampStyle = getTitleClampStyle(
    useAppSettingsStore((state) => state.values[SETTINGS.VIDEO_TITLE_MAX_LINES])
  );

  const hookAvatarUrl = useChannelAvatar(isChannel ? null : channelId || null);
  const resolvedAvatarUrl = useProxiedImageUrl(upgradeAvatarUrl(video.channelAvatarUrl || hookAvatarUrl));
  const channelCardAvatarUrl = useProxiedImageUrl(upgradeAvatarUrl(video.thumbnailUrl));
  const displayTitle = overriddenTitle || video.title;
  const thumbnailCandidates = resolveYoutubeThumbnailCandidates(video.id, overriddenThumbnail || video.thumbnailUrl);
  const displayThumbnail = thumbnailCandidates[thumbnailCandidateIndex] || overriddenThumbnail || video.thumbnailUrl;

  useEffect(() => {
    const isValidVideoId = video.id && video.id.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(video.id);
    if (isChannel || !isValidVideoId || !video.id) {
      setOverriddenTitle(null);
      setOverriddenThumbnail(null);
      return;
    }
    
    if (!dearrowEnabled) {
      setOverriddenTitle(null);
      setOverriddenThumbnail(null);
      return;
    }

    let active = true;
    getDeArrowOverride(video.id).then((override) => {
      if (!active) return;
      if (override) {
        setOverriddenTitle(override.title || null);
        setOverriddenThumbnail(override.thumbnailUrl || null);
      } else {
        setOverriddenTitle(null);
        setOverriddenThumbnail(null);
      }
    }).catch((err) => {
      console.error("Failed to load DeArrow override for", video.id, err);
    });

    return () => { active = false; };
  }, [video.id, isChannel, dearrowEnabled]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (!dominantColor && thumbnailRef.current) {
      if (thumbnailRef.current.complete) {
        const color = extractDominantColor(thumbnailRef.current);
        if (color) {
          setDominantColor(color);
        }
      }
    }
  }, [dominantColor]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleThumbnailLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (
      isUnavailableYoutubeThumbnail(img) &&
      thumbnailCandidateIndex < thumbnailCandidates.length - 1
    ) {
      setThumbnailCandidateIndex((idx) => idx + 1);
      return;
    }

    if (isHovered && !dominantColor) {
      const color = extractDominantColor(img);
      if (color) {
        setDominantColor(color);
      }
    }
  }, [dominantColor, isHovered, thumbnailCandidateIndex, thumbnailCandidates.length]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isChannel) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuAnchor({ top: e.clientY, left: e.clientX });
    setShowMenu(true);
  }, [isChannel]);

  const openMenuFromDots = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuAnchor({ top: rect.bottom + 4, right: rect.right });
    setShowMenu((prev) => !prev);
  }, []);

  const subStatus = isSubscribed(isChannel ? cleanId : channelId);
  const isHistoryCard = variant === 'history';
  const isListVariant = variant === 'list';
  const progressPercent = Math.min(100, Math.max(0, video.watchProgressPercent ?? 0));

  useEffect(() => {
    setThumbnailCandidateIndex(0);
    setDominantColor(null);
  }, [overriddenThumbnail, video.id, video.thumbnailUrl]);

  const handleThumbnailError = useCallback(() => {
    setThumbnailCandidateIndex((idx) => Math.min(idx + 1, Math.max(0, thumbnailCandidates.length - 1)));
  }, [thumbnailCandidates.length]);

  const cardStyle: React.CSSProperties = isHovered
    ? (dominantColor
      ? { background: `rgba(${dominantColor}, 0.2)` }
      : { background: 'rgba(39, 39, 42, 0.5)' })
    : { background: 'transparent' };

  const handleSubscribeToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idToToggle = isChannel ? cleanId : channelId;
    if (!idToToggle) return;
    if (subStatus) {
      unsubscribe(idToToggle);
    } else {
      subscribe(idToToggle, isChannel ? video.title : video.channelName, video.thumbnailUrl || undefined);
    }
  };

  const handleRemoveFromHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemoveFromHistory?.(video.id);
  };

  const handleToggleWatchLater = async () => {
    try {
      if (isSavedToWatchLater) {
        await removeVideoFromWatchLater(video.id);
        setIsSavedToWatchLater(false);
        showToast({
          variant: "success",
          message: getString("video_removed_from_watch_later"),
        });
        return;
      }

      await addVideoToWatchLater(video);
      setIsSavedToWatchLater(true);
      showToast({
        variant: "success",
        message: getString("video_saved_to_watch_later"),
      });
    } catch (error) {
      console.error("Failed to update Watch Later", error);
      showToast({
        variant: "error",
        message: getString("video_watch_later_failed"),
      });
    }
  };

  // ── Menu dropdown ───
  const renderMenu = () => {
    if (!showMenu || !menuAnchor) return null;

    return (
      <AnchoredPortalMenu
        anchor={menuAnchor}
        onClose={() => setShowMenu(false)}
        className="z-50 w-60 rounded-xl border border-neutral-800 bg-surface-container-high py-1.5"
      >
        {onAddToQueue && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToQueue(video);
              setShowMenu(false);
            }}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <Plus size={16} />
            Add to queue
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openAddToPlaylist(video);
            setShowMenu(false);
          }}
          className="w-full flex items-center gap-3 whitespace-nowrap px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        >
          <ListPlus size={16} />
          {getString("video_add_to_playlist")}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleToggleWatchLater();
            setShowMenu(false);
          }}
          className="w-full flex items-center gap-3 whitespace-nowrap px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        >
          <Clock size={16} />
          {getString(isSavedToWatchLater ? "video_remove_from_watch_later" : "video_save_to_watch_later")}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void moreLikeThis(video);
            setShowMenu(false);
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        >
          <Sparkles size={16} />
          More like this
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void markWatched(video);
            setShowMenu(false);
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        >
          <Eye size={16} />
          Mark as watched
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void notInterested(video);
            setShowMenu(false);
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        >
          <Ban size={16} />
          Not interested
        </button>
        {video.channelId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              void blockChannelAction(video);
              setShowMenu(false);
            }}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <EyeOff size={16} />
            Don't show this channel
          </button>
        )}
      </AnchoredPortalMenu>
    );
  };

  if (isChannel) {
    return (
      <div 
        onClick={() => navigate(`/channel/${cleanId}`)}
        className="flex flex-col items-center justify-center p-6 bg-surface rounded-xl border border-zinc-800 hover:bg-zinc-900/50 transition-colors group cursor-pointer"
      >
        <div className="w-24 h-24 rounded-full overflow-hidden mb-4 border border-zinc-800 group-hover:scale-105 transition-transform duration-300">
          {channelCardAvatarUrl ? (
            <img
              src={channelCardAvatarUrl}
              alt={video.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xl font-bold text-zinc-400">
              {video.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <h3 className="font-bold text-center text-zinc-100 line-clamp-1 group-hover:text-primary transition-colors">
          {video.title}
        </h3>
        <p className="text-xs text-zinc-400 mb-4">{video.publishedText || "Channel"}</p>
        
        <Button
          variant={subStatus ? "secondary" : "primary"}
          size="sm"
          className="w-full"
          onClick={handleSubscribeToggle}
        >
          {subStatus ? (
            <span className="flex items-center gap-1.5"><Check size={14} /> Subscribed</span>
          ) : (
            <span className="flex items-center gap-1.5"><Plus size={14} /> Subscribe</span>
          )}
        </Button>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        ref={cardRef}
        className="group relative flex w-full gap-2 rounded-xl p-1.5 -m-1.5 transition-all duration-300"
        style={cardStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      >
        <div
          className="relative aspect-video w-40 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-surface-container"
          onClick={() => onPlay(video)}
        >
          {displayThumbnail ? (
            <img
              ref={thumbnailRef}
              src={displayThumbnail}
              alt={displayTitle}
              className="h-full w-full object-cover"
              crossOrigin="anonymous"
              loading="lazy"
              decoding="async"
              onLoad={handleThumbnailLoad}
              onError={handleThumbnailError}
            />
          ) : (
            <div className="h-full w-full bg-zinc-800" />
          )}
          {isLiveVideo ? (
            <LiveBadge className="absolute bottom-1 right-1" />
          ) : video.durationSeconds ? (
            <div className="absolute bottom-1 right-1 z-10 rounded bg-neutral-950/90 px-1 py-px text-[11px] font-medium leading-tight text-white">
              {formatDuration(video.durationSeconds)}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <h3
            onClick={() => onPlay(video)}
            style={titleClampStyle}
            className="cursor-pointer text-sm font-medium leading-snug text-neutral-100 transition-colors group-hover:text-primary"
          >
            {displayTitle}
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (channelId) navigate(`/channel/${channelId}`);
            }}
            className="mt-1 truncate text-left text-[13px] text-neutral-400 transition-colors hover:text-neutral-300"
          >
            {video.channelName}
          </button>
          <div className="text-[13px] text-neutral-500">
            {video.viewCountText && <span>{video.viewCountText}</span>}
            {video.viewCountText && video.publishedText && <span className="mx-1">•</span>}
            {video.publishedText && <span>{video.publishedText}</span>}
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            onClick={openMenuFromDots}
            className="rounded-full p-1 text-neutral-500 opacity-0 transition-all duration-150 hover:bg-neutral-800 hover:text-neutral-200 group-hover:opacity-100"
          >
            <MoreVertical size={18} />
          </button>
        </div>

        {renderMenu()}
      </div>
    );
  }

  if (isListVariant) {
    const {
      className: dragHandleClassName,
      style: dragHandleStyle,
      ...dragHandleRest
    } = dragHandleProps ?? {};

    return (
      <div
        ref={cardRef}
        className="group relative flex w-full flex-row items-center gap-4 rounded-xl px-1 py-2 transition-colors duration-200 ease-out hover:bg-neutral-800/40"
        onContextMenu={handleContextMenu}
      >
        {showDragHandle ? (
          <button
            type="button"
            aria-label="Reorder video"
            className={[
              'shrink-0 rounded-md p-1 text-neutral-500 transition-colors duration-200 ease-out',
              'hover:text-neutral-300',
              isDragActive ? 'cursor-grabbing' : 'cursor-grab',
              dragHandleClassName,
            ].filter(Boolean).join(' ')}
            style={dragHandleStyle}
            onClick={(e) => e.stopPropagation()}
            {...dragHandleRest}
          >
            <GripHorizontal size={20} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="w-7 shrink-0" aria-hidden="true" />
        )}

        <div
          className="relative aspect-video w-40 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-zinc-900 sm:w-48"
          onClick={() => onPlay(video)}
        >
          {displayThumbnail ? (
            <img
              src={displayThumbnail}
              alt={displayTitle}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onLoad={handleThumbnailLoad}
              onError={handleThumbnailError}
            />
          ) : (
            <div className="h-full w-full bg-zinc-800" />
          )}

          {isLiveVideo ? (
            <LiveBadge className="absolute bottom-1 right-1" />
          ) : video.durationSeconds ? (
            <div className="absolute bottom-1 right-1 z-10 rounded bg-neutral-950/90 px-1 py-px text-[12px] font-medium leading-tight tracking-wide text-white">
              {formatDuration(video.durationSeconds)}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <h3
            onClick={() => onPlay(video)}
            style={titleClampStyle}
            className="cursor-pointer text-sm font-medium leading-snug text-neutral-100 transition-colors hover:text-white"
          >
            {displayTitle}
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (channelId) navigate(`/channel/${channelId}`);
            }}
            className="mt-0.5 truncate text-left text-[13px] text-neutral-400 transition-colors hover:text-neutral-300"
          >
            {video.channelName}
          </button>
          <div className="mt-0.5 text-[13px] text-neutral-500">
            {video.viewCountText && <span>{video.viewCountText}</span>}
            {video.viewCountText && video.publishedText && <span className="mx-1">•</span>}
            {video.publishedText && <span>{video.publishedText}</span>}
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={openMenuFromDots}
            className="mt-0.5 rounded-full p-1 text-neutral-500 opacity-0 transition-all duration-150 hover:bg-neutral-800 hover:text-neutral-200 group-hover:opacity-100"
          >
            <MoreVertical size={18} />
          </button>
        </div>

        {renderMenu()}
      </div>
    );
  }

  const channelInitials = video.channelName?.substring(0, 1).toUpperCase() || '?';

  return (
    <div
      ref={cardRef}
      className="video-card flex flex-col gap-3 group relative rounded-xl p-1.5 -m-1.5 transition-all duration-300"
      style={cardStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >

      <div
        className="relative w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 cursor-pointer"
        onClick={() => onPlay(video)}
      >
        {displayThumbnail ? (
          <img 
            ref={thumbnailRef}
            src={displayThumbnail} 
            alt={displayTitle} 
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            crossOrigin="anonymous"
            loading="lazy"
            onLoad={handleThumbnailLoad}
            onError={handleThumbnailError}
          />
        ) : (
          <div className="w-full h-full bg-zinc-800" />
        )}

        {isLiveVideo ? (
          <LiveBadge className={`absolute right-1 ${isHistoryCard ? 'bottom-2' : 'bottom-1'}`} />
        ) : video.durationSeconds ? (
          <div className={`absolute right-1 z-10 bg-black/80 px-1 py-px rounded text-[12px] font-medium text-white leading-tight tracking-wide ${isHistoryCard ? 'bottom-2' : 'bottom-1'}`}>
            {formatDuration(video.durationSeconds)}
          </div>
        ) : null}

        {isHistoryCard ? (
          <>
            <div className="absolute bottom-0 left-0 z-10 h-[3px] w-full bg-neutral-600">
              <div
                className="h-full bg-primary"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {onRemoveFromHistory ? (
              <button
                type="button"
                onClick={handleRemoveFromHistory}
                title="Remove from history"
                aria-label="Remove from history"
                className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950/90 text-neutral-300 opacity-0 transition-colors duration-200 ease-out hover:bg-red-950/50 backdrop-blur-md hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 size={15} />
              </button>
            ) : null}
          </>
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
      </div>

      <div className="flex gap-3 pr-1 relative z-10">
        {!hideChannelAvatar && (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              if (channelId) navigate(`/channel/${channelId}`);
            }}
            className="w-9 h-9 rounded-full bg-zinc-800 shrink-0 overflow-hidden flex items-center justify-center cursor-pointer mt-0.5 hover:opacity-80 transition-opacity"
          >
            {resolvedAvatarUrl ? (
              <img
                src={resolvedAvatarUrl}
                alt={video.channelName}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-xs font-semibold text-zinc-400">{channelInitials}</span>
            )}
          </div>
        )}

        <div className="flex flex-col flex-1 min-w-0">
          <h3
            onClick={() => onPlay(video)}
            style={titleClampStyle}
            className="text-zinc-100 text-sm font-medium leading-snug cursor-pointer hover:text-white transition-colors"
          >
            {displayTitle}
          </h3>
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (channelId) navigate(`/channel/${channelId}`);
            }}
            className="text-zinc-400 text-[13px] mt-0.5 truncate cursor-pointer hover:text-zinc-300 transition-colors"
          >
            {video.channelName}
          </div>

          {/* View Count + Published */}
          <div className="text-zinc-500 text-[13px] flex items-center gap-0 mt-0">
            {video.viewCountText && <span>{video.viewCountText}</span>}
            {video.viewCountText && video.publishedText && <span className="mx-1">•</span>}
            {video.publishedText && <span>{video.publishedText}</span>}
          </div>
        </div>

        {/* Three-dot menu button */}
        <div className="relative shrink-0">
          <button
            onClick={openMenuFromDots}
            className="p-1 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-all duration-150 mt-0.5"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {renderMenu()}
    </div>
  );
}
