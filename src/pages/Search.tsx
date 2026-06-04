import React, { useState, useEffect } from "react";
import { Search as SearchIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { searchVideos, searchMusic } from "../lib/api/youtube";
import type { PlaylistSummary, VideoSummary } from "../types/video";
import { VideoGrid } from "../components/video/VideoGrid";
import TrackCard from "../components/common/TrackCard";
import { PlaylistCard } from "../components/video/PlaylistCard";

interface SearchProps {
  onPlay: (video: VideoSummary) => void;
  onAddToQueue: (video: VideoSummary) => void;
}

export const Search: React.FC<SearchProps> = ({ onPlay, onAddToQueue }) => {
  const [searchParams] = useSearchParams();
  const queryParam = searchParams.get("q") || "";
  const [query, setQuery] = useState(queryParam);
  const [filter, setFilter] = useState<"all" | "songs" | "videos" | "albums" | "playlists" | "artists" | "all">("all");
  const [results, setResults] = useState<Array<VideoSummary | PlaylistSummary>>([]);
  const [loading, setLoading] = useState(false);

  const executeSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      if (filter === "all" || filter === "videos") {
        const res = await searchVideos({ query: searchQuery });
        setResults(res.items);
      } else {
        const res = await searchMusic(searchQuery, filter);
        setResults(res);
      }
    } catch (e) {
      console.error("Search failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setQuery(queryParam);
    if (queryParam) {
      executeSearch(queryParam);
    } else {
      setResults([]);
    }
  }, [queryParam, filter]);

  return (
    <div className="flex-grow overflow-y-auto pb-20">
      <div className="px-8 py-6 space-y-6">
        {/* Filter Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {(["all", "songs", "videos", "albums", "playlists", "artists"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`py-2 px-4 rounded-full text-xs font-bold capitalize transition-all active:scale-95 shrink-0 ${
                filter === tab
                  ? "bg-primary text-white shadow-lg shadow-primary/10"
                  : "bg-zinc-900/40 border border-zinc-800/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700/60"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Results Header */}
        {results.length > 0 && (
          <h2 className="text-sm font-bold text-zinc-400 tracking-wider uppercase">
            Search Results for "{query}"
          </h2>
        )}

        {/* Main Results renderer */}
        {loading ? (
          <VideoGrid loading={true} onPlay={onPlay} />
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-800 rounded-3xl p-8 bg-zinc-900/10">
            <SearchIcon className="text-zinc-700 mb-4" size={48} />
            <h3 className="font-bold text-zinc-300">Start exploring</h3>
            <p className="text-zinc-500 text-xs mt-1 max-w-sm">
              Search in the header for videos, channels, songs or albums to stream natively in pristine high quality
            </p>
          </div>
        ) : filter === "playlists" ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {(results as PlaylistSummary[]).map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        ) : filter === "songs" || filter === "albums" || filter === "artists" ? (
          <div className="flex flex-col gap-3 max-w-4xl">
            {(results as VideoSummary[]).map((item) => (
              <TrackCard
                key={item.id}
                track={item}
                onPlay={onPlay}
                onAddToQueue={onAddToQueue}
              />
            ))}
          </div>
        ) : (
          <VideoGrid
            videos={results as VideoSummary[]}
            onPlay={onPlay}
            onAddToQueue={onAddToQueue}
          />
        )}
      </div>
    </div>
  );
};

export default Search;

