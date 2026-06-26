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
  remove: (ids: number[]) => Promise<void>;
  clear: () => Promise<void>;
}

export const useDownloadsLibraryStore = create<DownloadsLibraryState>((set, get) => ({
  records: [],
  downloadedIds: new Set(),
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [records, ids] = await Promise.all([listDownloads(), getDownloadedVideoIds()]);
      set({ records, downloadedIds: new Set(ids), loaded: true });
    } catch (error) {
      console.warn("Failed to load the downloads library", error);
    } finally {
      set({ loading: false });
    }
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
