import { create } from "zustand";

export type ActiveTab = "home" | "search" | "subscriptions" | "history" | "playlists" | "settings";

interface UiState {
  activeTab: ActiveTab;
  searchQuery: string;
  isSearching: boolean;
  isSidebarExpanded: boolean;
  setActiveTab: (tab: ActiveTab) => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (isSearching: boolean) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "home",
  searchQuery: "",
  isSearching: false,
  isSidebarExpanded: true,

  setActiveTab: (activeTab) => set({ activeTab }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsSearching: (isSearching) => set({ isSearching }),
  toggleSidebar: () => set((state) => ({ isSidebarExpanded: !state.isSidebarExpanded })),
}));
