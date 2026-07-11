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
    <div className="sticky top-0 z-40 w-full border-b border-chrome-neutral-800 bg-background/95">
      <div className=" mx-auto px-4 sm:px-6 lg:px-8">
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
                    ${isActive ? "text-[var(--color-primary)]" : "text-chrome-neutral-400 hover:text-chrome-neutral-100"}
                    whitespace-nowrap
                  `}
                >
                  {tab.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)] animate-fade-in" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center flex-shrink-0">
            <div 
              className={`
                flex items-center h-9 px-3 rounded-full bg-surface-container-low border transition-all duration-300
                ${isSearchFocused ? "border-chrome-neutral-500 w-48 sm:w-64" : "border-chrome-neutral-800 w-36 sm:w-48"}
              `}
            >
              <Search className="mr-2 flex-shrink-0 text-chrome-neutral-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="Search channel..."
                className="w-full bg-transparent text-sm text-chrome-neutral-100 outline-none placeholder:text-chrome-neutral-500"
              />
              {searchQuery && (
                <button 
                  onClick={onSearchClear}
                  className="flex-shrink-0 rounded-full p-1 transition-colors hover:bg-surface-container-high"
                >
                  <X className="text-chrome-neutral-400" size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
