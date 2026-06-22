import React from "react";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import { PlaylistCard } from "../video/PlaylistCard";
import { PostCard } from "../video/PostCard";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { SETTINGS } from "../../lib/settings/schema";
import type { 
  ShortVideoSummary, 
  PlaylistSummary, 
  PostSummary 
} from "../../types/video";
import { buildShortQueue, shortSummaryToItem } from "../../lib/shortsQueue";

// --- Shorts Grid ---

interface ChannelShortsGridProps {
  shorts: ShortVideoSummary[];
}

export const ChannelShortsGrid: React.FC<ChannelShortsGridProps> = ({ shorts }) => {
  const navigate = useNavigate();
  const disableShortsPlayer = useAppSettingsStore((state) => state.values[SETTINGS.DISABLE_SHORTS_PLAYER] === "true");

  if (!shorts.length) return null;

  const playShort = (short: ShortVideoSummary) => {
    if (disableShortsPlayer) {
      navigate(`/watch/${short.id}`);
      return;
    }

    navigate(`/shorts/${short.id}`, {
      state: {
        initialShort: shortSummaryToItem(short),
        initialQueue: buildShortQueue(shorts),
        queueOnly: true,
      },
    });
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {shorts.map((short) => (
        <div
          key={short.id}
          className="flex flex-col gap-2 group cursor-pointer"
          onClick={() => playShort(short)}
        >
          <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
            {short.thumbnailUrl && (
              <img 
                src={short.thumbnailUrl} 
                alt={short.title} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            )}
            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <div className="p-3 bg-primary rounded-full text-white shadow-none">
                <Play size={18} fill="white" />
              </div>
            </div>
            {short.viewCountText && (
              <div className="absolute bottom-2 left-2 text-[11px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded tracking-wide backdrop-blur-sm">
                {short.viewCountText}
              </div>
            )}
          </div>
          <h3 className="text-zinc-100 text-sm font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors">
            {short.title}
          </h3>
        </div>
      ))}
    </div>
  );
};

// --- Playlists Grid ---

interface ChannelPlaylistsGridProps {
  playlists: PlaylistSummary[];
}

export const ChannelPlaylistsGrid: React.FC<ChannelPlaylistsGridProps> = ({ playlists }) => {
  if (!playlists.length) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {playlists.map((playlist) => (
        <PlaylistCard key={playlist.id} playlist={playlist} />
      ))}
    </div>
  );
};

// --- Posts Feed ---

interface ChannelPostsFeedProps {
  posts: PostSummary[];
}

export const ChannelPostsFeed: React.FC<ChannelPostsFeedProps> = ({ posts }) => {
  if (!posts.length) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
};
