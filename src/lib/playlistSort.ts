import type { VideoSummary } from "../types/video";

export const PLAYLIST_SORT_OPTIONS = [
  "Manual",
  "Date added (newest)",
  "Date added (oldest)",
  "Most popular",
  "Date published (newest)",
  "Date published (oldest)",
] as const;

export type PlaylistSortType = (typeof PLAYLIST_SORT_OPTIONS)[number];

export const parseViewCount = (text?: string | null): number => {
  if (!text) return 0;
  const normalized = text.toLowerCase();
  const match = normalized.match(/([\d,.]+)\s*([kmb])?/);
  if (!match?.[1]) return 0;

  let value = Number.parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(value)) return 0;

  const suffix = match[2];
  if (suffix === "k") value *= 1_000;
  if (suffix === "m") value *= 1_000_000;
  if (suffix === "b") value *= 1_000_000_000;
  return value;
};

export function sortPlaylistVideos(
  videos: VideoSummary[],
  sortType: PlaylistSortType,
): VideoSummary[] {
  if (sortType === "Manual") return videos;

  const copy = [...videos];

  switch (sortType) {
    case "Date added (newest)":
      return copy.reverse();
    case "Date added (oldest)":
      return copy;
    case "Most popular":
      return copy.sort(
        (a, b) => parseViewCount(b.viewCountText) - parseViewCount(a.viewCountText),
      );
    case "Date published (newest)":
      return copy.reverse();
    case "Date published (oldest)":
      return copy;
    default:
      return copy;
  }
}
