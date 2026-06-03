import { useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '../../store/useSubscriptionStore';
import { Plus, Ban, Check, MoreVertical, Trash2 } from 'lucide-react';
import type { VideoSummary } from '../../types/video';
import { Button } from '../ui/Button';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getDeArrowOverride } from '../../lib/api/foss';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useChannelAvatar } from '../../lib/useChannelAvatar';

export interface VideoCardProps {
  video: VideoSummary;
  onPlay: (video: VideoSummary) => void;
  onAddToQueue?: (video: VideoSummary) => void;
  onMarkNotInterested?: (videoId: string) => void;
  onRemoveFromHistory?: (videoId: string) => void;
  variant?: 'default' | 'history';
  hideChannelAvatar?: boolean;
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
  onMarkNotInterested,
  onRemoveFromHistory,
  variant = 'default',
  hideChannelAvatar,
}: VideoCardProps) {
  const navigate = useNavigate();
  const { isSubscribed, subscribe, unsubscribe } = useSubscriptionStore();
  const [overriddenTitle, setOverriddenTitle] = useState<string | null>(null);
  const [overriddenThumbnail, setOverriddenThumbnail] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLImageElement>(null);

  const isChannel = video.id.startsWith("channel:");
  const cleanId = isChannel ? video.id.replace("channel:", "") : video.id;
  const channelId = video.channelId || "";

  const { dearrowEnabled } = useSettingsStore();

  const hookAvatarUrl = useChannelAvatar(isChannel ? null : channelId || null);
  const resolvedAvatarUrl = video.channelAvatarUrl || hookAvatarUrl;

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

  const handleThumbnailLoad = useCallback(() => {
    if (isHovered && !dominantColor && thumbnailRef.current) {
      const color = extractDominantColor(thumbnailRef.current);
      if (color) {
        setDominantColor(color);
      }
    }
  }, [isHovered, dominantColor]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isChannel) return;
    e.preventDefault();
    e.stopPropagation();

    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setMenuPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    setShowMenu(true);
  }, [isChannel]);

  const openMenuFromDots = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuPosition(null);
    setShowMenu((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const subStatus = isSubscribed(isChannel ? cleanId : channelId);
  const isHistoryCard = variant === 'history';
  const progressPercent = Math.min(100, Math.max(0, video.watchProgressPercent ?? 0));

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

  // ── Menu dropdown ───
  const renderMenu = () => {
    if (!showMenu) return null;

    const positionStyle: React.CSSProperties = menuPosition
      ? { position: 'absolute', left: menuPosition.x, top: menuPosition.y, right: 'auto' }
      : { position: 'absolute', right: 0, top: 28 };

    return (
      <div
        ref={menuRef}
        style={positionStyle}
        className="z-50 w-52 rounded-xl border border-neutral-800 bg-surface-container-high py-1.5"
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
        {onMarkNotInterested && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkNotInterested(video.id);
              setShowMenu(false);
            }}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <Ban size={16} />
            Not interested
          </button>
        )}
      </div>
    );
  };

  if (isChannel) {
    return (
      <div 
        onClick={() => navigate(`/channel/${cleanId}`)}
        className="flex flex-col items-center justify-center p-6 bg-surface rounded-xl border border-zinc-800 hover:bg-zinc-900/50 transition-colors group cursor-pointer"
      >
        <div className="w-24 h-24 rounded-full overflow-hidden mb-4 border border-zinc-800 group-hover:scale-105 transition-transform duration-300">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
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

  // ── Video Card ─────────────
  const channelInitials = video.channelName?.substring(0, 1).toUpperCase() || '?';

  const cardStyle: React.CSSProperties = isHovered
    ? (dominantColor
      ? {
          background: `rgba(${dominantColor}, 0.2)`,
        }
      : {
          background: 'rgba(39, 39, 42, 0.5)',
        })
    : {
        background: 'transparent',
      };

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
        {(overriddenThumbnail || video.thumbnailUrl) ? (
          <img 
            ref={thumbnailRef}
            src={overriddenThumbnail || video.thumbnailUrl || ""} 
            alt={overriddenTitle || video.title} 
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            crossOrigin="anonymous"
            loading="lazy"
            onLoad={handleThumbnailLoad}
          />
        ) : (
          <div className="w-full h-full bg-zinc-800" />
        )}

        {video.durationSeconds ? (
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
            className="text-zinc-100 text-sm font-medium line-clamp-2 leading-snug cursor-pointer hover:text-white transition-colors"
          >
            {overriddenTitle || video.title}
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

          {/* Dropdown from dots (positioned relative to button) */}
          {showMenu && !menuPosition && renderMenu()}
        </div>
      </div>

      {/* Context menu (positioned at mouse coords) */}
      {showMenu && menuPosition && renderMenu()}
    </div>
  );
}
