import { useCallback, useEffect, useState } from "react";
import { getSetting } from "./api/db";
import { SPONSORBLOCK_CATEGORIES, type SponsorBlockCategory } from "../store/useSettingsStore";

export interface SponsorBlockCategoryStat {
  category: SponsorBlockCategory;
  clips: number;
  seconds: number;
}

function toCount(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function useSponsorBlockCategoryStats(refreshKey?: unknown) {
  const [stats, setStats] = useState<SponsorBlockCategoryStat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await Promise.all(
        SPONSORBLOCK_CATEGORIES.map(async (category) => {
          const [clipsRaw, secondsRaw] = await Promise.all([
            getSetting(`sb_stats_clips_${category}`),
            getSetting(`sb_stats_seconds_${category}`),
          ]);
          return { category, clips: toCount(clipsRaw), seconds: toCount(secondsRaw) };
        }),
      );
      setStats(entries);
    } catch (error) {
      console.warn("Failed to load SponsorBlock category stats", error);
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return { stats, loading, reload: load };
}
