
import { ListVideo, Play } from 'lucide-react';
import type { PlaylistSummary } from '../../types/video';

interface PlaylistCardProps {
  playlist: PlaylistSummary;
  onClick?: (playlist: PlaylistSummary) => void;
}

export function PlaylistCard({ playlist, onClick }: PlaylistCardProps) {
  return (
    <div className="flex flex-col gap-3 group cursor-pointer" onClick={() => onClick?.(playlist)}>
      <div className="relative w-full aspect-video rounded-xl mt-3 bg-zinc-900 border border-zinc-800">
        {/* Stacked effect backgrounds */}
        <div className="absolute -top-1.5 left-2 right-2 h-2 bg-zinc-800 rounded-t-xl opacity-70 transition-all group-hover:-top-2" />
        <div className="absolute -top-3 left-4 right-4 h-2 bg-zinc-800 rounded-t-xl opacity-40 transition-all group-hover:-top-4" />
        
        <div className="relative w-full h-full rounded-xl overflow-hidden z-10">
          {playlist.thumbnailUrl && (
            <img 
              src={playlist.thumbnailUrl} 
              alt={playlist.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          )}
          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
          
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5 bg-black/85 px-1.5 py-0.5 rounded text-[11px] font-semibold text-white tracking-wide backdrop-blur-sm">
            <ListVideo size={14} />
            {playlist.videoCountText || "Playlist"}
          </div>

          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <div className="flex items-center gap-2 bg-primary px-4 py-2 rounded-full text-white font-bold text-sm shadow-md">
              <Play size={16} fill="white" /> Play All
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <h3 className="text-zinc-100 text-sm font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {playlist.title}
        </h3>
        <span className="text-zinc-400 text-xs mt-1 font-medium hover:text-primary transition-colors">
          View full playlist
        </span>
      </div>
    </div>
  );
}
