import { create } from "zustand";

export type ActiveTab = "home" | "search" | "subscriptions" | "history" | "playlists" | "settings";

const getSavedSidebarExpanded = () => {
  try {
    const saved = localStorage.getItem("flow_sidebar_expanded");
    return saved === null ? true : saved === "true";
  } catch (error) {
    console.warn("Failed to load saved sidebar state", error);
    return true;
  }
};

const saveSidebarExpanded = (expanded: boolean) => {
  try {
    localStorage.setItem("flow_sidebar_expanded", String(expanded));
  } catch (error) {
    console.warn("Failed to save sidebar state", error);
  }
};

interface UiState {
  activeTab: ActiveTab;
  searchQuery: string;
  isSearching: boolean;
  isSidebarExpanded: boolean;
  isWatchSidebarOpen: boolean;
  setActiveTab: (tab: ActiveTab) => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (isSearching: boolean) => void;
  setWatchSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleWatchSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "home",
  searchQuery: "",
  isSearching: false,
  isSidebarExpanded: getSavedSidebarExpanded(),
  isWatchSidebarOpen: false,

  setActiveTab: (activeTab) => set({ activeTab }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setWatchSidebarOpen: (isWatchSidebarOpen) => set({ isWatchSidebarOpen }),
  toggleSidebar: () => set((state) => {
    const isSidebarExpanded = !state.isSidebarExpanded;
    saveSidebarExpanded(isSidebarExpanded);
    return { isSidebarExpanded };
  }),
  toggleWatchSidebar: () => set((state) => ({ isWatchSidebarOpen: !state.isWatchSidebarOpen })),
}));
