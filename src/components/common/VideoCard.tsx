import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscriptionStore } from "../../store/useSubscriptionStore";
import { Play, Plus, Ban, Check } from "lucide-react";
import type { VideoSummary } from "../../types/video";
import { getDeArrowOverride } from "../../lib/api/youtube";

interface VideoCardProps {
  video: VideoSummary;
  onPlay: (video: VideoSummary) => void;
  onAddToQueue?: (video: VideoSummary) => void;
  onMarkNotInterested?: (videoId: string) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onPlay,
  onAddToQueue,
  onMarkNotInterested,
}) => {
  const navigate = useNavigate();
  const { isSubscribed, subscribe, unsubscribe } = useSubscriptionStore();
  const [overriddenTitle, setOverriddenTitle] = useState<string | null>(null);
  const [overriddenThumbnail, setOverriddenThumbnail] = useState<string | null>(null);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isChannel = video.id.startsWith("channel:");
  const cleanId = isChannel ? video.id.replace("channel:", "") : video.id;
  const channelId = video.channelId || "";

  useEffect(() => {
    if (isChannel || !video.id) {
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
  }, [video.id, isChannel]);

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
        className="flex flex-col items-center justify-center p-6 bg-zinc-900/40 rounded-3xl border border-zinc-800/40 hover:border-zinc-700/60 transition-all duration-300 group cursor-pointer"
      >
        <div className="relative w-28 h-28 rounded-full overflow-hidden mb-4 border-2 border-zinc-800 group-hover:border-red-500/50 transition-colors">
          <img
            src={video.thumbnailUrl || "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?q=80&w=150"}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?q=80&w=150";
            }}
          />
        </div>
        <h3 className="font-bold text-center text-zinc-100 line-clamp-1 group-hover:text-red-400 transition-colors">
          {video.title}
        </h3>
        <p className="text-xs text-zinc-400 mb-4">{video.publishedText || "Channel"}</p>
        
        <button
          onClick={handleSubscribeToggle}
          className={`w-full py-2 px-4 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
            subStatus
              ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700/80"
              : "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/10"
          }`}
        >
          {subStatus ? (
            <>
              <Check size={13} />
              Subscribed
            </>
          ) : (
            <>
              <Plus size={13} />
              Subscribe
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-zinc-900/30 rounded-2xl border border-zinc-800/40 overflow-hidden hover:border-zinc-700/60 hover:bg-zinc-900/60 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 group">
      <div className="relative aspect-video w-full bg-zinc-950 overflow-hidden cursor-pointer" onClick={() => onPlay(video)}>
        <img
          src={overriddenThumbnail || video.thumbnailUrl || "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=300"}
          alt={overriddenTitle || video.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=300";
          }}
        />
        {/* Play Overlay */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
          <div className="p-3 bg-red-600 rounded-full text-white shadow-lg transform scale-90 group-hover:scale-100 transition-all duration-300 active:scale-90">
            <Play size={20} fill="white" />
          </div>
        </div>
        {/* Duration Badge */}
        {video.durationSeconds && (
          <div className="absolute bottom-2 right-2 bg-black/85 backdrop-blur-sm text-white px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">
            {formatDuration(video.durationSeconds)}
          </div>
        )}
      </div>

      {/* Details Container */}
      <div className="p-4 flex flex-col flex-grow">
        <h4
          onClick={() => onPlay(video)}
          className="font-semibold text-zinc-100 text-sm leading-snug line-clamp-2 cursor-pointer hover:text-red-400 transition-colors"
        >
          {overriddenTitle || video.title}
        </h4>
        
        <p 
          onClick={(e) => {
            if (video.channelId) {
              e.stopPropagation();
              navigate(`/channel/${video.channelId}`);
            }
          }}
          className="text-xs text-zinc-400 font-medium mt-1.5 truncate cursor-pointer hover:text-primary transition-colors"
        >
          {video.channelName}
        </p>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-zinc-800/40">
          <span className="text-[10px] text-zinc-500 font-semibold tracking-wide uppercase">
            {video.publishedText || video.viewCountText || "Flow Video"}
          </span>

          <div className="flex items-center gap-1.5">
            {onAddToQueue && (
              <button
                onClick={() => onAddToQueue(video)}
                title="Add to queue"
                className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition-all duration-200"
              >
                <Plus size={14} />
              </button>
            )}
            {onMarkNotInterested && (
              <button
                onClick={() => onMarkNotInterested(video.id)}
                title="Not interested"
                className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-amber-500 transition-all duration-200"
              >
                <Ban size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
