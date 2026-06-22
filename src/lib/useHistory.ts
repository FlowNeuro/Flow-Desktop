import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearWatchHistory,
  deleteWatchRecord,
  getWatchHistory,
} from "./api/db";
import type { WatchHistoryRecord } from "../types/db";
import type { VideoSummary } from "../types/video";
import type { SongItem } from "../types/music";

export interface HistoryVideo extends VideoSummary {
  watchDate: string;
  watchProgressPercent: number;
  isMusic: boolean;
}

export function historyVideoToSong(video: HistoryVideo): SongItem {
  const artist = (video.channelName ?? "").replace(/\s*-\s*topic\s*$/i, "").trim();
  return {
    id: video.id,
    title: video.title,
    artists: artist ? [{ name: artist, id: null }] : [],
    album: null,
    duration: video.durationSeconds || null,
    musicVideoType: null,
    thumbnail: video.thumbnailUrl || "",
    explicit: false,
    videoId: video.id,
    playlistId: null,
    params: null,
  };
}

export interface HistoryDateGroup {
  dateLabel: string;
  videos: HistoryVideo[];
}

const HISTORY_LIMIT = 100;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getHistoryDateLabel(watchDate: string, now = new Date()) {
  const watchedAt = new Date(watchDate);

  if (Number.isNaN(watchedAt.getTime())) {
    return "Recently";
  }

  const today = startOfLocalDay(now);
  const watchedDay = startOfLocalDay(watchedAt);
  const dayDiff = Math.floor((today.getTime() - watchedDay.getTime()) / DAY_IN_MS);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) return "This Week";

  return watchedAt.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function mapHistoryRecordToVideo(record: WatchHistoryRecord): HistoryVideo {
  const duration = record.totalDurationSeconds ?? 0;
  const progress = duration > 0
    ? Math.min(100, Math.max(0, (record.watchDurationSeconds / duration) * 100))
    : 0;

  return {
    id: record.videoId,
    title: record.title,
    channelName: record.channelName || "Unknown Channel",
    channelId: record.channelId || null,
    thumbnailUrl: `https://i.ytimg.com/vi/${record.videoId}/hqdefault.jpg`,
    durationSeconds: record.totalDurationSeconds || 0,
    publishedText: getHistoryDateLabel(record.watchDate),
    viewCountText: "History",
    watchDate: record.watchDate,
    watchProgressPercent: progress,
    isMusic: record.isMusic ?? false,
  };
}

export function groupHistoryByDate(records: WatchHistoryRecord[]): HistoryDateGroup[] {
  const groups = new Map<string, HistoryVideo[]>();

  for (const record of records) {
    const label = getHistoryDateLabel(record.watchDate);
    const videos = groups.get(label) ?? [];
    videos.push(mapHistoryRecordToVideo(record));
    groups.set(label, videos);
  }

  return Array.from(groups.entries()).map(([dateLabel, videos]) => ({
    dateLabel,
    videos,
  }));
}

export function useHistory() {
  const [history, setHistory] = useState<WatchHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshHistory = useCallback(async () => {
    setLoading(true);

    try {
      const records = await getWatchHistory(HISTORY_LIMIT, 0);
      setHistory(records);
    } catch (error) {
      console.error("Failed to fetch history", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const removeHistoryItem = useCallback(async (videoId: string) => {
    await deleteWatchRecord(videoId);
    setHistory((current) => current.filter((item) => item.videoId !== videoId));
  }, []);

  const clearHistory = useCallback(async () => {
    await clearWatchHistory();
    setHistory([]);
  }, []);

  const groupedHistory = useMemo(() => groupHistoryByDate(history), [history]);

  return {
    history,
    groupedHistory,
    loading,
    refreshHistory,
    removeHistoryItem,
    clearHistory,
  };
}
