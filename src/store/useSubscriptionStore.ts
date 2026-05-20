import { create } from "zustand";
import { getSetting, setSetting } from "../lib/api/db";

export interface SubscribedChannel {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface SubscriptionState {
  subscriptions: SubscribedChannel[];
  loading: boolean;
  loadSubscriptions: () => Promise<void>;
  subscribe: (channelId: string, channelName: string, avatarUrl?: string) => Promise<void>;
  unsubscribe: (channelId: string) => Promise<void>;
  isSubscribed: (channelId: string) => boolean;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscriptions: [],
  loading: false,

  loadSubscriptions: async () => {
    set({ loading: true });
    try {
      const subsJson = await getSetting("subscriptions");
      if (subsJson) {
        set({ subscriptions: JSON.parse(subsJson), loading: false });
      } else {
        const defaults = [
          { id: "UCsBjURrdU234nU351gVEfTA", name: "Fireship" },
          { id: "UCwRxwjk_c_92sAMeX4JzW4w", name: "Linus Tech Tips" }
        ];
        await setSetting("subscriptions", JSON.stringify(defaults));
        set({ subscriptions: defaults, loading: false });
      }
    } catch (e) {
      console.error("Failed to load subscriptions in store", e);
      set({ loading: false });
    }
  },

  subscribe: async (channelId, channelName, avatarUrl) => {
    const { subscriptions } = get();
    const cleanId = channelId.replace("channel:", "");
    if (subscriptions.some((c) => c.id === cleanId)) return;
    const updated = [...subscriptions, { id: cleanId, name: channelName, avatarUrl }];
    set({ subscriptions: updated });
    await setSetting("subscriptions", JSON.stringify(updated));
  },

  unsubscribe: async (channelId) => {
    const { subscriptions } = get();
    const cleanId = channelId.replace("channel:", "");
    const updated = subscriptions.filter((c) => c.id !== cleanId);
    set({ subscriptions: updated });
    await setSetting("subscriptions", JSON.stringify(updated));
  },

  isSubscribed: (channelId) => {
    const cleanId = channelId.replace("channel:", "");
    return get().subscriptions.some((c) => c.id === cleanId);
  },
}));
