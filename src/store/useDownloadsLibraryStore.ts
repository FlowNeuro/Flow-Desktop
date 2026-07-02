import { create } from "zustand";

import {
  clearDownloads,
  deleteDownloads,
  getDownloadedVideoIds,
  listDownloads,
  type DownloadRecord,
} from "../lib/api/downloads";

interface DownloadsLibraryState {
  records: DownloadRecord[];
  downloadedIds: Set<string>;
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
  remove: (ids: number[]) => Promise<void>;
  clear: () => Promise<void>;
}

let loadInFlight: Promise<void> | null = null;

export const useDownloadsLibraryStore = create<DownloadsLibraryState>((set, get) => ({
  records: [],
  downloadedIds: new Set(),
  loaded: false,
  loading: false,
  load: async () => {
    if (loadInFlight) return loadInFlight;
    loadInFlight = (async () => {
      set({ loading: true });
      try {
        const [records, ids] = await Promise.all([listDownloads(), getDownloadedVideoIds()]);
        set({ records, downloadedIds: new Set(ids), loaded: true });
      } catch (error) {
        console.warn("Failed to load the downloads library", error);
      } finally {
        set({ loading: false });
        loadInFlight = null;
      }
    })();
    return loadInFlight;
  },
  ensureLoaded: async () => {
    if (get().loaded) return;
    await get().load();
  },
  remove: async (ids) => {
    if (ids.length === 0) return;
    await deleteDownloads(ids);
    await get().load();
  },
  clear: async () => {
    await clearDownloads();
    set({ records: [], downloadedIds: new Set() });
  },
}));
