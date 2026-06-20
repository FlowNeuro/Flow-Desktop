import { useEffect, useMemo } from "react";
import { getHistoryDateLabel, type HistoryDateGroup, type HistoryVideo } from "./useHistory";
import { useLikesStore, type LikedItem, type LikedItemKind } from "../store/useLikesStore";
import type { SongItem } from "../types/music";
import type { VideoSummary } from "../types/video";

const artistText = (song: SongItem) => (
  song.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown Artist"
);

export const songVideoId = (song: SongItem) => song.videoId ?? song.id;

export function likedSongToHistoryVideo(item: Extract<LikedItem, { kind: "music" }>): HistoryVideo {
  return {
    id: songVideoId(item.song),
    title: item.song.title,
    channelName: artistText(item.song),
    thumbnailUrl: item.song.thumbnail || null,
    durationSeconds: item.song.duration ?? null,
    publishedText: getHistoryDateLabel(item.likedAt),
    viewCountText: "Liked",
    watchDate: item.likedAt,
    watchProgressPercent: 0,
    isMusic: true,
  };
}

export function likedVideoToHistoryVideo(item: Extract<LikedItem, { kind: "video" }>): HistoryVideo {
  return {
    ...item.video,
    publishedText: getHistoryDateLabel(item.likedAt),
    viewCountText: item.video.viewCountText ?? "Liked",
    watchDate: item.likedAt,
    watchProgressPercent: 0,
    isMusic: false,
  };
}

export function likedItemToHistoryVideo(item: LikedItem): HistoryVideo {
  return item.kind === "music"
    ? likedSongToHistoryVideo(item)
    : likedVideoToHistoryVideo(item);
}

export function groupLikedItemsByDate(items: LikedItem[]): HistoryDateGroup[] {
  const groups = new Map<string, HistoryVideo[]>();

  for (const item of items) {
    const label = getHistoryDateLabel(item.likedAt);
    const videos = groups.get(label) ?? [];
    videos.push(likedItemToHistoryVideo(item));
    groups.set(label, videos);
  }

  return Array.from(groups.entries()).map(([dateLabel, videos]) => ({
    dateLabel,
    videos,
  }));
}

export function useLikes() {
  const items = useLikesStore((s) => s.items);
  const loaded = useLikesStore((s) => s.loaded);
  const load = useLikesStore((s) => s.load);
  const remove = useLikesStore((s) => s.remove);
  const clear = useLikesStore((s) => s.clear);

  useEffect(() => {
    if (!loaded) void load();
  }, [load, loaded]);

  const historyVideos = useMemo(() => items.map(likedItemToHistoryVideo), [items]);
  const groupedLikes = useMemo(() => groupLikedItemsByDate(items), [items]);

  return {
    items,
    historyVideos,
    groupedLikes,
    loading: !loaded,
    removeLikedItem: remove as (kind: LikedItemKind, id: string) => Promise<void>,
    clearLikes: clear,
  };
}

export function videoLikeId(video: VideoSummary) {
  return video.id;
}
