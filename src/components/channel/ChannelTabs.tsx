import React, { useState } from "react";
import { Search, X } from "lucide-react";

export type TabId = "home" | "videos" | "shorts" | "live" | "podcasts" | "playlists" | "posts";

interface ChannelTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  availableTabs?: string[];
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onSearchSubmit: () => void;
  onSearchClear: () => void;
}

export const ChannelTabs: React.FC<ChannelTabsProps> = ({
  activeTab,
  onTabChange,
  availableTabs,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  onSearchClear,
}) => {
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  let tabs: { id: TabId; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "videos", label: "Videos" },
    { id: "shorts", label: "Shorts" },
    { id: "live", label: "Live" },
    { id: "podcasts", label: "Podcasts" },
    { id: "playlists", label: "Playlists" },
    { id: "posts", label: "Posts" },
  ];

  if (availableTabs && availableTabs.length > 0) {
    const tabLabels = availableTabs.map(t => t.toLowerCase());
    tabs = tabs.filter(tab => {
      if (tab.id === "home") return tabLabels.includes("home");
      if (tab.id === "videos") return tabLabels.includes("videos");
      if (tab.id === "shorts") return tabLabels.includes("shorts");
      if (tab.id === "live") return tabLabels.includes("live") || tabLabels.includes("streams");
      if (tab.id === "podcasts") return tabLabels.includes("podcasts");
      if (tab.id === "playlists") return tabLabels.includes("playlists");
      if (tab.id === "posts") return tabLabels.includes("community") || tabLabels.includes("posts");
      return true;
    });
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSearchSubmit();
    }
  };

  return (
    <div className="w-full bg-background/95 backdrop-blur-md sticky top-0 z-40 border-b border-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 gap-4 overflow-x-auto scrollbar-none hide-scrollbar">
          <div className="flex space-x-8 h-full items-center">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`
                    relative h-full py-6 text-sm font-semibold transition-colors
                    ${isActive ? "text-white" : "text-white/50 hover:text-white/70"}
                    whitespace-nowrap
                  `}
                >
                  {tab.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white animate-fade-in" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center flex-shrink-0">
            <div 
              className={`
                flex items-center h-9 px-3 rounded-full bg-surface border transition-all duration-300
                ${isSearchFocused ? "border-white/50 w-48 sm:w-64" : "border-white/30 w-36 sm:w-48"}
              `}
            >
              <Search className="text-white/40 mr-2 flex-shrink-0" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="Search channel..."
                className="bg-transparent text-sm text-white placeholder-white/40 w-full outline-none"
              />
              {searchQuery && (
                <button 
                  onClick={onSearchClear}
                  className="p-1 hover:bg-surface rounded-full transition-colors flex-shrink-0"
                >
                  <X className="text-white/60" size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
