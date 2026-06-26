import { useEffect } from "react";

import { useDownloadsLibraryStore } from "../store/useDownloadsLibraryStore";
import { useDownloadStore } from "../store/useDownloadStore";
import type { DownloadProgress, DownloadRecord, DownloadStatus } from "./api/downloads";
import type { SongItem } from "../types/music";
import type { VideoSummary } from "../types/video";

export function downloadRecordToVideo(record: DownloadRecord): VideoSummary {
  return {
    id: record.videoId ?? String(record.id),
    title: record.title,
    channelName: record.author ?? "",
    thumbnailUrl: record.thumbnailUrl,
    durationSeconds: record.durationSeconds,
  };
}

export function downloadRecordToSong(record: DownloadRecord): SongItem {
  return {
    id: record.videoId ?? String(record.id),
    title: record.title,
    artists: record.author ? [{ name: record.author, id: null }] : [],
    album: null,
    duration: record.durationSeconds,
    musicVideoType: null,
    thumbnail: record.thumbnailUrl ?? "",
    explicit: false,
    videoId: record.videoId,
    playlistId: null,
    params: null,
  };
}

const recordVideoId = (record: DownloadRecord): string => record.videoId ?? String(record.id);

function recordMatchesKind(record: DownloadRecord, kind: "video" | "audio"): boolean {
  return kind === "video"
    ? record.mediaKind === "video"
    : record.mediaKind === "music" || record.mediaKind === "audio";
}

export function findDownloadedRecord(
  videoId: string | null | undefined,
  kind: "video" | "audio",
): DownloadRecord | undefined {
  if (!videoId) return undefined;
  return useDownloadsLibraryStore
    .getState()
    .records.find((record) => recordVideoId(record) === videoId && recordMatchesKind(record, kind));
}

const ACTIVE_STATUSES: ReadonlySet<DownloadStatus> = new Set([
  "queued",
  "downloading",
  "paused",
  "waitingForNetwork",
  "muxing",
]);

export function isActiveStatus(status: DownloadStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

function useEnsureLibraryLoaded() {
  const loaded = useDownloadsLibraryStore((state) => state.loaded);
  const load = useDownloadsLibraryStore((state) => state.load);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
}

export function useDownloadsLibrary() {
  useEnsureLibraryLoaded();
  const records = useDownloadsLibraryStore((state) => state.records);
  const loading = useDownloadsLibraryStore((state) => state.loading);
  const remove = useDownloadsLibraryStore((state) => state.remove);
  const clear = useDownloadsLibraryStore((state) => state.clear);
  const reload = useDownloadsLibraryStore((state) => state.load);
  return { records, loading, remove, clear, reload };
}

export function useIsDownloaded(videoId: string | null | undefined): boolean {
  useEnsureLibraryLoaded();
  return useDownloadsLibraryStore((state) =>
    videoId ? state.downloadedIds.has(videoId) : false,
  );
}

export function useDownloadedVideoRecord(
  videoId: string | null | undefined,
): DownloadRecord | undefined {
  useEnsureLibraryLoaded();
  return useDownloadsLibraryStore((state) =>
    videoId
      ? state.records.find(
          (record) => recordVideoId(record) === videoId && record.mediaKind === "video",
        )
      : undefined,
  );
}

export function useActiveDownloadForVideo(
  videoId: string | null | undefined,
): DownloadProgress | undefined {
  return useDownloadStore((state) => {
    if (!videoId) return undefined;
    return Object.values(state.active).find(
      (item) => item.videoId === videoId && isActiveStatus(item.status),
    );
  });
}
