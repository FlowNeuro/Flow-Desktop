import React from "react";
import { PlaylistCard } from "../video/PlaylistCard";
import { PostCard } from "../video/PostCard";
import { ShortCard } from "../shorts/ShortCard";
import type { 
  ShortVideoSummary, 
  PlaylistSummary, 
  PostSummary 
} from "../../types/video";

// --- Shorts Grid ---

interface ChannelShortsGridProps {
  shorts: ShortVideoSummary[];
}

export const ChannelShortsGrid: React.FC<ChannelShortsGridProps> = ({ shorts }) => {
  if (!shorts.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {shorts.map((short) => (
        <ShortCard
          key={short.id}
          short={short}
          queue={shorts}
        />
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
