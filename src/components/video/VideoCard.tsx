import { useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '../../store/useSubscriptionStore';
import { Play, Plus, Ban, Check, MoreVertical } from 'lucide-react';
import type { VideoSummary } from '../../types/video';
import { Button } from '../ui/Button';
import { useState, useEffect } from 'react';
import { getDeArrowOverride } from '../../lib/api/foss';
import { useSettingsStore } from '../../store/useSettingsStore';

export interface VideoCardProps {
  video: VideoSummary;
  onPlay: (video: VideoSummary) => void;
  onAddToQueue?: (video: VideoSummary) => void;
  onMarkNotInterested?: (videoId: string) => void;
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

export function VideoCard({
  video,
  onPlay,
  onAddToQueue,
  onMarkNotInterested,
  hideChannelAvatar,
}: VideoCardProps) {
  const navigate = useNavigate();
  const { isSubscribed, subscribe, unsubscribe } = useSubscriptionStore();
  const [overriddenTitle, setOverriddenTitle] = useState<string | null>(null);
  const [overriddenThumbnail, setOverriddenThumbnail] = useState<string | null>(null);

  const isChannel = video.id.startsWith("channel:");
  const cleanId = isChannel ? video.id.replace("channel:", "") : video.id;
  const channelId = video.channelId || "";

  const { dearrowEnabled } = useSettingsStore();

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
        if (override.title) {
          setOverriddenTitle(override.title);
        } else {
          setOverriddenTitle(null);
        }
        if (override.thumbnailUrl) {
          setOverriddenThumbnail(override.thumbnailUrl);
        } else {
          setOverriddenThumbnail(null);
        }
      } else {
        setOverriddenTitle(null);
        setOverriddenThumbnail(null);
      }
    }).catch((err) => {
      console.error("Failed to load DeArrow override for", video.id, err);
    });

    return () => {
      active = false;
    };
  }, [video.id, isChannel, dearrowEnabled]);

  const subStatus = isSubscribed(isChannel ? cleanId : channelId);

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

  const channelInitials = video.channelName?.substring(0, 2).toUpperCase() || '?';

  return (
    <div className="flex flex-col gap-3 cursor-pointer group relative" onClick={() => onPlay(video)}>
      {/* Thumbnail Wrapper */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-surface border border-zinc-800">
        {(overriddenThumbnail || video.thumbnailUrl) ? (
          <img 
            src={overriddenThumbnail || video.thumbnailUrl || ""} 
            alt={overriddenTitle || video.title} 
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-zinc-900" />
        )}
        
        {/* Play Overlay Icon (flat, no gradient) */}
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
          <div className="p-3 bg-primary rounded-full text-white shadow-none">
            <Play size={18} fill="white" />
          </div>
        </div>

        {video.durationSeconds ? (
          <div className="absolute bottom-1.5 right-1.5 bg-black/85 px-1.5 py-0.5 rounded text-[11px] font-semibold text-white tracking-wide">
            {formatDuration(video.durationSeconds)}
          </div>
        ) : null}
      </div>

      {/* Metadata */}
      <div className="flex items-start gap-3 px-1 relative">
        {!hideChannelAvatar && (
          <div 
            onClick={(e) => {
              if (video.channelId) {
                e.stopPropagation();
                navigate(`/channel/${video.channelId}`);
              }
            }}
            className="w-9 h-9 rounded-full bg-zinc-900 shrink-0 overflow-hidden border border-zinc-800 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
          >
            <span className="text-xs font-bold text-zinc-400">{channelInitials}</span>
          </div>
        )}

        <div className="flex flex-col flex-1 overflow-hidden pr-6">
          <div className="flex items-start justify-between">
            <h3 className="text-zinc-100 font-semibold text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors pr-2">
              {overriddenTitle || video.title}
            </h3>
            {hideChannelAvatar && (
              <button className="text-zinc-400 hover:text-zinc-200 p-1 shrink-0 -mt-1 -mr-2">
                <MoreVertical size={16} />
              </button>
            )}
          </div>
          {!hideChannelAvatar && (
            <div 
              onClick={(e) => {
                if (video.channelId) {
                  e.stopPropagation();
                  navigate(`/channel/${video.channelId}`);
                }
              }}
              className="text-zinc-400 text-xs mt-1 font-medium hover:text-primary transition-colors truncate cursor-pointer"
            >
              {video.channelName}
            </div>
          )}
          <div className={`text-zinc-400 text-xs flex items-center gap-1 font-normal ${hideChannelAvatar ? "mt-1" : "mt-0.5"}`}>
            {video.viewCountText ? <span>{video.viewCountText}</span> : null}
            {(video.viewCountText && video.publishedText) && <span className="mx-0.5">•</span>}
            {video.publishedText ? <span>{video.publishedText}</span> : null}
          </div>
        </div>

        {/* Hover Action Buttons */}
        <div className="absolute right-0 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-surface/90 p-1 rounded-md border border-zinc-800 shadow-sm backdrop-blur-sm">
          {onAddToQueue && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToQueue(video);
              }}
              title="Add to queue"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-primary transition-colors"
            >
              <Plus size={14} />
            </button>
          )}
          {onMarkNotInterested && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkNotInterested(video.id);
              }}
              title="Not interested"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-primary transition-colors"
            >
              <Ban size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
