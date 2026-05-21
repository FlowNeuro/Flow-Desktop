import React, { useState, useEffect } from "react";
import { FolderHeart, Plus, ArrowLeft, Play, Shuffle, Trash, Loader2, Music } from "lucide-react";
import { getSetting, setSetting } from "../lib/api/db";
import type { VideoSummary } from "../types/video";
import TrackCard from "../components/common/TrackCard";
import { getString } from "../lib/i18n/index";
import { usePlayerStore } from "../store/usePlayerStore";

interface PlaylistsProps {
  onPlay: (track: VideoSummary) => void;
}

interface LocalPlaylist {
  id: string;
  name: string;
  description?: string;
  tracks: VideoSummary[];
}

export const Playlists: React.FC<PlaylistsProps> = ({ onPlay }) => {
  const [playlists, setPlaylists] = useState<LocalPlaylist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<LocalPlaylist | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [loading, setLoading] = useState(true);
  
  const setQueue = usePlayerStore((state) => state.setQueue);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);

  const loadPlaylists = async () => {
    setLoading(true);
    try {
      const playlistsJson = await getSetting("user_playlists");
      if (playlistsJson) {
        setPlaylists(JSON.parse(playlistsJson));
      } else {
        const defaults: LocalPlaylist[] = [
          {
            id: "liked-songs",
            name: "Liked Songs",
            description: "Your favorite tracks, automatically gathered",
            tracks: [
              {
                id: "dQw4w9WgXcQ",
                title: "Mock Favorite Track 1",
                channelName: "Mock Artist",
                thumbnailUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=150",
                durationSeconds: 210,
                publishedText: "1 year ago",
                viewCountText: "Song",
              }
            ],
          },
        ];
        await setSetting("user_playlists", JSON.stringify(defaults));
        setPlaylists(defaults);
      }
    } catch (e) {
      console.error("Failed to load playlists", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlaylists();
  }, []);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const newPlaylist: LocalPlaylist = {
      id: `playlist-${Date.now()}`,
      name: newPlaylistName,
      description: newPlaylistDesc,
      tracks: [],
    };

    const updated = [...playlists, newPlaylist];
    setPlaylists(updated);
    await setSetting("user_playlists", JSON.stringify(updated));

    setNewPlaylistName("");
    setNewPlaylistDesc("");
    setShowCreateModal(false);
  };

  const handleDeletePlaylist = async (playlistId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this playlist?")) return;

    const updated = playlists.filter((p) => p.id !== playlistId);
    setPlaylists(updated);
    await setSetting("user_playlists", JSON.stringify(updated));
    if (activePlaylist?.id === playlistId) {
      setActivePlaylist(null);
    }
  };

  const handlePlayPlaylist = (playlist: LocalPlaylist, shuffle = false) => {
    if (playlist.tracks.length === 0) return;
    setQueue(playlist.tracks, 0);
    if (shuffle) {
      toggleShuffle();
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!activePlaylist) return;
    const updatedTracks = activePlaylist.tracks.filter((t) => t.id !== trackId);
    const updatedPlaylist = { ...activePlaylist, tracks: updatedTracks };
    
    const updatedPlaylists = playlists.map((p) =>
      p.id === activePlaylist.id ? updatedPlaylist : p
    );
    
    setPlaylists(updatedPlaylists);
    setActivePlaylist(updatedPlaylist);
    await setSetting("user_playlists", JSON.stringify(updatedPlaylists));
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
      {activePlaylist ? (
        <div className="space-y-6 pb-20">
          <button
            onClick={() => setActivePlaylist(null)}
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-xs font-semibold py-2 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to playlists
          </button>

          <div className="flex flex-col md:flex-row items-start md:items-end gap-6 p-6 bg-zinc-900/30 rounded-3xl border border-zinc-800/40">
            <div className="w-28 h-28 md:w-36 md:h-36 bg-zinc-800 rounded-2xl flex items-center justify-center text-primary/80 shrink-0 border border-zinc-700/60 shadow-lg">
              <FolderHeart size={48} />
            </div>

            <div className="space-y-3 flex-grow">
              <h2 className="text-2xl font-extrabold text-zinc-100">{activePlaylist.name}</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">{activePlaylist.description || "No description provided."}</p>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                <Music size={12} />
                {activePlaylist.tracks.length} Tracks
              </div>
            </div>

            {activePlaylist.tracks.length > 0 && (
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handlePlayPlaylist(activePlaylist, false)}
                  className="flex items-center gap-2 bg-primary hover:bg-primary text-white font-bold text-xs py-3 px-5 rounded-2xl transition-all shadow-lg shadow-primary/10 active:scale-95"
                >
                  <Play size={14} fill="white" />
                  Play All
                </button>
                <button
                  onClick={() => handlePlayPlaylist(activePlaylist, true)}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs py-3 px-5 rounded-2xl transition-all active:scale-95"
                >
                  <Shuffle size={14} />
                  Shuffle
                </button>
              </div>
            )}
          </div>

          <h3 className="text-sm font-bold text-zinc-400 tracking-wider uppercase">Playlist Tracks</h3>

          {activePlaylist.tracks.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-3xl">
              <Music className="text-zinc-700 mx-auto mb-3 animate-[pulse_2s_infinite]" size={36} />
              <p className="text-zinc-500 text-xs font-semibold">No tracks in this playlist yet.</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Search for songs and add them to get started!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-4xl">
              {activePlaylist.tracks.map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  onPlay={onPlay}
                  onRemoveFromQueue={() => handleRemoveTrack(track.id)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 pb-20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
                {getString("library_playlists_label")}
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Organize custom collections of videos and tracks in your personal vault
              </p>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-primary hover:bg-primary text-white py-2.5 px-4 rounded-xl text-xs font-semibold shadow-lg shadow-primary/10 transition-all active:scale-95 shrink-0"
            >
              <Plus size={14} />
              Create Playlist
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <Loader2 className="animate-spin text-primary" size={36} />
              <p className="text-zinc-500 text-sm font-medium">Assembling library index...</p>
            </div>
          ) : playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-800 rounded-3xl p-8 bg-zinc-900/10">
              <FolderHeart className="text-zinc-700 mb-4" size={48} />
              <h3 className="font-bold text-zinc-300">Vault is empty</h3>
              <p className="text-zinc-500 text-xs mt-1 max-w-sm">
                No playlists created yet. Set up standard collection folders to group items!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  onClick={() => setActivePlaylist(playlist)}
                  className="flex flex-col bg-zinc-900/30 hover:bg-zinc-900/60 border border-zinc-800/40 hover:border-zinc-700/60 p-5 rounded-2xl cursor-pointer transition-all duration-300 group relative"
                >
                  <div className="w-full aspect-video bg-zinc-950/60 rounded-xl mb-4 flex items-center justify-center text-primary/70 border border-zinc-800/80 group-hover:border-primary/30 transition-colors shadow-inner">
                    <FolderHeart size={32} />
                  </div>
                  <h4 className="font-bold text-zinc-200 text-sm group-hover:text-red-400 transition-colors truncate">
                    {playlist.name}
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                    {playlist.description || "Custom collection"}
                  </p>
                  
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800/40">
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                      {playlist.tracks.length} tracks
                    </span>

                    <button
                      onClick={(e) => handleDeletePlaylist(playlist.id, e)}
                      title="Delete playlist"
                      className="p-1.5 rounded-xl hover:bg-zinc-800/80 text-zinc-500 hover:text-primary transition-colors"
                    >
                      <Trash size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Playlist Overlay dialog modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <form onSubmit={handleCreatePlaylist} className="bg-zinc-900 border border-zinc-800 max-w-sm w-full rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100">Create new playlist</h3>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Playlist name</label>
              <input
                type="text"
                required
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="e.g. My Lofi Beats"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-primary/50 px-4 py-2.5 rounded-xl text-xs font-semibold outline-none transition-all text-zinc-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Description (optional)</label>
              <textarea
                value={newPlaylistDesc}
                onChange={(e) => setNewPlaylistDesc(e.target.value)}
                placeholder="Short outline..."
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-primary/50 px-4 py-2.5 rounded-xl text-xs font-semibold outline-none resize-none transition-all text-zinc-300"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-zinc-800 hover:bg-zinc-800 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-primary hover:bg-primary text-white rounded-xl text-xs font-semibold shadow-lg shadow-primary/10 active:scale-95 transition-all"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Playlists;
