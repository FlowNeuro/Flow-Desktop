import React from "react";
import { useNavigate } from "react-router-dom";
import { Play, Trash, ListPlus } from "lucide-react";
import type { VideoSummary } from "../../types/video";

interface TrackCardProps {
  track: VideoSummary;
  isActive?: boolean;
  isPlaying?: boolean;
  onPlay: (track: VideoSummary) => void;
  onAddToQueue?: (track: VideoSummary) => void;
  onRemoveFromQueue?: () => void;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  track,
  isActive = false,
  isPlaying = false,
  onPlay,
  onAddToQueue,
  onRemoveFromQueue,
}) => {
  const navigate = useNavigate();

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`flex items-center gap-4 p-2.5 rounded-2xl border transition-all duration-300 group ${
        isActive
          ? "bg-red-950/20 border-red-500/30 shadow-md shadow-red-500/5"
          : "bg-zinc-900/20 border-zinc-800/30 hover:border-zinc-700/50 hover:bg-zinc-900/50"
      }`}
    >
      {/* Cover Art container */}
      <div
        className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-zinc-950 cursor-pointer"
        onClick={() => onPlay(track)}
      >
        <img
          src={track.thumbnailUrl || "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=150"}
          alt={track.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=150";
          }}
        />
        {/* Play Overlay */}
        <div
          className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-200 ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {isActive && isPlaying ? (
            <div className="flex gap-0.5 items-end justify-center w-5 h-5">
              <span className="w-1 bg-red-500 rounded-full animate-[bounce_0.8s_infinite_100ms] h-3"></span>
              <span className="w-1 bg-red-500 rounded-full animate-[bounce_0.8s_infinite_200ms] h-4"></span>
              <span className="w-1 bg-red-500 rounded-full animate-[bounce_0.8s_infinite_300ms] h-2.5"></span>
            </div>
          ) : (
            <Play size={14} fill="white" className="text-white" />
          )}
        </div>
      </div>

      {/* Title & Artist info */}
      <div className="flex-grow min-w-0">
        <h4
          onClick={() => onPlay(track)}
          className={`text-sm font-semibold truncate cursor-pointer hover:text-red-400 transition-colors ${
            isActive ? "text-red-400" : "text-zinc-100"
          }`}
        >
          {track.title}
        </h4>
        <p 
          onClick={(e) => {
            if (track.channelId) {
              e.stopPropagation();
              navigate(`/channel/${track.channelId}`);
            }
          }}
          className="text-xs text-zinc-400 truncate mt-0.5 cursor-pointer hover:text-primary transition-colors"
        >
          {track.channelName}
        </p>
      </div>

      {/* Duration & Actions */}
      <div className="flex items-center gap-3 shrink-0">
        {track.durationSeconds && (
          <span className="text-xs text-zinc-500 font-semibold tracking-wider">
            {formatDuration(track.durationSeconds)}
          </span>
        )}

        <div className="flex items-center gap-1">
          {onAddToQueue && (
            <button
              onClick={() => onAddToQueue(track)}
              title="Add to queue"
              className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
            >
              <ListPlus size={14} />
            </button>
          )}
          
          {onRemoveFromQueue && (
            <button
              onClick={onRemoveFromQueue}
              title="Remove from queue"
              className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
            >
              <Trash size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrackCard;
