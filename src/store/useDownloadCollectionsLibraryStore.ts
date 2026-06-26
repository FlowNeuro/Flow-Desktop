import { create } from "zustand";

import {
  deleteDownloadCollections,
  listDownloadCollections,
  type DownloadCollectionRecord,
} from "../lib/api/downloads";

interface CollectionsLibraryState {
  records: DownloadCollectionRecord[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  remove: (ids: number[]) => Promise<void>;
}

export const useDownloadCollectionsLibraryStore = create<CollectionsLibraryState>((set, get) => ({
  records: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const records = await listDownloadCollections();
      set({ records, loaded: true });
    } catch (error) {
      console.warn("Failed to load downloaded collections", error);
    } finally {
      set({ loading: false });
    }
  },
  remove: async (ids) => {
    if (ids.length === 0) return;
    await deleteDownloadCollections(ids);
    await get().load();
  },
}));
