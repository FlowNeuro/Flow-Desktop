import { create } from "zustand";

interface PageTitleState {
  path: string | null;
  title: string | null;
  setPageTitle: (path: string, title: string | null | undefined) => void;
}

export const usePageTitleStore = create<PageTitleState>((set) => ({
  path: null,
  title: null,
  setPageTitle: (path, title) => set({ path, title: title ?? null }),
}));
