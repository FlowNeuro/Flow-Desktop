import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { getChannelDetails, getChannelTab } from "../lib/api/youtube";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import type { ChannelDetails, ChannelItem } from "../types/video";
import { ChannelHero } from "../components/channel/ChannelHero";
import { ChannelTabs, TabId } from "../components/channel/ChannelTabs";
import { 
  ChannelShortsGrid, 
  ChannelPlaylistsGrid, 
  ChannelPostsFeed 
} from "../components/channel/ChannelGrids";
import { VideoGrid } from "../components/video/VideoGrid";
import type { VideoSummary, VideoItemSummary, ShortVideoSummary, PlaylistSummary, PostSummary } from "../types/video";

interface ChannelProps {
  onPlay: (video: VideoSummary) => void;
  onAddToQueue: (video: VideoSummary) => void;
}

const TAB_PARAMS: Record<TabId, string | undefined> = {
  home: undefined,
  videos: "EgZ2aWRlb3PyBgQKAjoA",
  shorts: "EgZzaG9ydHPyBgUKA5oBAA==",
  live: "EgdzdHJlYW1z8gYECgJ6AA==",
  podcasts: "Eghwb2RjYXN0c_IGBQoDugEA",
  playlists: "EglwbGF5bGlzdHPyBgQKAkIA",
  posts: "EgVwb3N0c_IGBAoCSgA=",
};

const SORT_PARAMS = {
  latest: "EgZ2aWRlb3PyBgQKAjoA",
  popular: "EgZ2aWRlb3MYASAAMAE=",
  oldest: "EgZ2aWRlb3MYAiAAMAE=",
};

type SortFilterId = "latest" | "popular" | "oldest";

export const Channel: React.FC<ChannelProps> = ({ onPlay, onAddToQueue }) => {
  const { channelId } = useParams<{ channelId: string }>();
  
  const { isSubscribed, subscribe, unsubscribe, loadSubscriptions } = useSubscriptionStore();
  const [channelInfo, setChannelInfo] = useState<ChannelDetails | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  
  const [items, setItems] = useState<ChannelItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTab, setLoadingTab] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [sortFilter, setSortFilter] = useState<SortFilterId>("latest");

  const stashedTokensRef = useRef<{
    latest: string | null;
    popular: string | null;
    oldest: string | null;
  }>({ latest: null, popular: null, oldest: null });

  useEffect(() => {
    stashedTokensRef.current = { latest: null, popular: null, oldest: null };
  }, [channelId]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  useEffect(() => {
    if (!channelId) return;

    const loadHero = async () => {
      setLoading(true);
      try {
        const details = await getChannelDetails(channelId);
        setChannelInfo(details);
      } catch (err) {
        console.error("Failed to load channel details", err);
      } finally {
        setLoading(false);
      }
    };

    loadHero();
  }, [channelId]);

  useEffect(() => {
    if (!channelId) return;
    
    const loadTab = async () => {
      setLoadingTab(true);
      setItems([]);
      setNextPageToken(null);
      try {
        let resolvedParams: string | undefined = undefined;
        let resolvedPageToken: string | undefined = undefined;

        if (activeSearchQuery) {
          resolvedParams = undefined;
          resolvedPageToken = undefined;
        } else if (activeTab === "videos") {
          const stashedToken = 
            sortFilter === "latest" ? stashedTokensRef.current.latest :
            sortFilter === "popular" ? stashedTokensRef.current.popular :
            sortFilter === "oldest" ? stashedTokensRef.current.oldest : null;
          
          if (stashedToken) {
            resolvedPageToken = stashedToken;
            resolvedParams = undefined;
          } else {
            resolvedParams = SORT_PARAMS[sortFilter];
            resolvedPageToken = undefined;
          }
        } else {
          resolvedParams = TAB_PARAMS[activeTab];
          resolvedPageToken = undefined;
        }

        const res = await getChannelTab(
          channelId, 
          resolvedParams, 
          resolvedPageToken || undefined, 
          activeSearchQuery || undefined
        );
        setItems(res.items);
        setNextPageToken(res.nextPageToken || null);

        // Stash tokens if they are returned and we are on videos tab without a search query
        if (activeTab === "videos" && !activeSearchQuery) {
          if (res.sortLatestToken) stashedTokensRef.current.latest = res.sortLatestToken;
          if (res.sortPopularToken) stashedTokensRef.current.popular = res.sortPopularToken;
          if (res.sortOldestToken) stashedTokensRef.current.oldest = res.sortOldestToken;
        }
      } catch (err) {
        console.error("Failed to load tab data", err);
      } finally {
        setLoadingTab(false);
      }
    };
    
    loadTab();
  }, [channelId, activeTab, activeSearchQuery, sortFilter]);

  const loadMoreData = async () => {
    if (!channelId || loadingMore || !nextPageToken) return;

    setLoadingMore(true);
    try {
      const resolvedParams = 
        activeSearchQuery 
          ? undefined 
          : (activeTab === "videos" ? SORT_PARAMS[sortFilter] : TAB_PARAMS[activeTab]);

      const res = await getChannelTab(
        channelId, 
        resolvedParams, 
        nextPageToken, 
        activeSearchQuery || undefined
      );
      
      setItems((prevItems) => {
        const existingIds = new Set(prevItems.map((item) => item.id));
        const newItems = res.items.filter((item) => !existingIds.has(item.id));
        return [...prevItems, ...newItems];
      });

      setNextPageToken(res.nextPageToken || null);
    } catch (err) {
      console.error("Failed to load more channel items", err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const scrollContainer = document.querySelector("main") || containerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      if (scrollHeight - scrollTop - clientHeight < 600) {
        loadMoreData();
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, [channelId, activeTab, nextPageToken, loadingMore, activeSearchQuery, sortFilter]);

  if (loading && !channelInfo) {
    return (
      <div className="flex-grow flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const cid = channelId || "";
  const subStatus = isSubscribed(cid);

  const handleSubscribeToggle = () => {
    if (subStatus) {
      unsubscribe(cid);
    } else {
      subscribe(cid, channelInfo?.name || "Unknown Creator", channelInfo?.avatarUrl || undefined);
    }
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      setActiveSearchQuery(searchQuery.trim());
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearchQuery("");
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchQuery("");
    setActiveSearchQuery("");
    setSortFilter("latest");
  };

  return (
    <div 
      ref={containerRef}
      className="flex-grow pb-24 bg-background relative"
    >

      <ChannelHero 
        channelInfo={channelInfo} 
        isSubscribed={subStatus} 
        onSubscribeToggle={handleSubscribeToggle} 
      />

      <ChannelTabs 
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
        availableTabs={channelInfo?.availableTabs}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={handleClearSearch}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "videos" && !activeSearchQuery && (
          <div className="flex items-center gap-2.5 mb-6">
            <button
              onClick={() => setSortFilter("latest")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                sortFilter === "latest"
                  ? "bg-zinc-100 text-zinc-900 border border-zinc-100 shadow-md font-bold"
                  : "bg-zinc-900/60 hover:bg-zinc-800/50 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Latest
            </button>
            <button
              onClick={() => setSortFilter("popular")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                sortFilter === "popular"
                  ? "bg-zinc-100 text-zinc-900 border border-zinc-100 shadow-md font-bold"
                  : "bg-zinc-900/60 hover:bg-zinc-800/50 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Popular
            </button>
            <button
              onClick={() => setSortFilter("oldest")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                sortFilter === "oldest"
                  ? "bg-zinc-100 text-zinc-900 border border-zinc-100 shadow-md font-bold"
                  : "bg-zinc-900/60 hover:bg-zinc-800/50 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Oldest
            </button>
          </div>
        )}

        {loadingTab ? (
           <div className="flex justify-center py-20">
             <Loader2 className="animate-spin text-primary" size={32} />
           </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/40 p-6">
             <p className="text-zinc-500 text-sm font-medium">
               {activeSearchQuery ? `No videos found matching "${activeSearchQuery}".` : "No content found for this tab."}
             </p>
          </div>
        ) : (
          <div className="w-full">
            {activeSearchQuery ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <h2 className="text-base font-semibold text-neutral-200">
                    Search results for: <span className="text-primary">"{activeSearchQuery}"</span>
                  </h2>
                  <button
                    onClick={handleClearSearch}
                    className="text-xs font-medium text-neutral-400 hover:text-neutral-200 flex items-center gap-1 transition-colors bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full"
                  >
                    <X size={12} /> Clear search
                  </button>
                </div>
                <VideoGrid 
                  videos={items as VideoItemSummary[]} 
                  onPlay={onPlay} 
                  onAddToQueue={onAddToQueue} 
                  hideChannelAvatar={true}
                />
              </div>
            ) : activeTab === "home" || activeTab === "videos" || activeTab === "live" ? (
              <VideoGrid 
                videos={items as VideoItemSummary[]} 
                onPlay={onPlay} 
                onAddToQueue={onAddToQueue} 
                hideChannelAvatar={true}
              />
            ) : activeTab === "shorts" ? (
              <ChannelShortsGrid shorts={items as ShortVideoSummary[]} />
            ) : activeTab === "playlists" || activeTab === "podcasts" ? (
              <ChannelPlaylistsGrid playlists={items as PlaylistSummary[]} />
            ) : activeTab === "posts" ? (
              <ChannelPostsFeed posts={items as PostSummary[]} />
            ) : null}

            {loadingMore && (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Channel;
