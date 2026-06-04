import { getSetting, setSetting } from "./api/db";
import { getPlaylistDetails } from "./api/youtube";
import type { PlaylistSummary, VideoSummary } from "../types/video";

export type PlaylistSource = "Owned" | "Saved";

export interface StoredPlaylist {
  id: string;
  name: string;
  /** Title captured from the browse/search card when the user saved the playlist. */
  sourceTitle?: string | null;
  description?: string;
  tracks: VideoSummary[];
  createdAt?: string;
  source?: PlaylistSource;
  thumbnailUrl?: string | null;
  videoCountText?: string | null;
  videoCount?: number | null;
}

const PLAYLISTS_SETTING_KEY = "user_playlists";

const PLACEHOLDER_PLAYLIST_TITLES = new Set([
  "unknown playlist",
  "",
]);

export const resolvePlaylistTitle = (
  ...candidates: Array<string | null | undefined>
) => {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    if (!PLACEHOLDER_PLAYLIST_TITLES.has(trimmed.toLowerCase())) {
      return trimmed;
    }
  }

  return "Playlist";
};

export const parseVideoCountFromText = (text?: string | null): number | null => {
  if (!text) return null;
  const match = text.match(/(\d[\d,]*)/);
  if (!match?.[1]) return null;
  return Number.parseInt(match[1].replace(/,/g, ""), 10);
};

export const formatVideoCountText = (count: number) => (
  `${count} ${count === 1 ? "video" : "videos"}`
);

export const getStoredPlaylistVideoCount = (playlist: StoredPlaylist) => {
  if (playlist.tracks.length > 0) return playlist.tracks.length;
  if (typeof playlist.videoCount === "number" && playlist.videoCount > 0) {
    return playlist.videoCount;
  }
  const parsed = parseVideoCountFromText(playlist.videoCountText);
  return parsed ?? 0;
};

export const storedPlaylistToCardSummary = (playlist: StoredPlaylist): PlaylistSummary & {
  description?: string | null;
  videoCount?: number;
} => {
  const videoCount = getStoredPlaylistVideoCount(playlist);
  const thumbnailUrl = playlist.thumbnailUrl
    ?? playlist.tracks.map((track) => track.thumbnailUrl).find(Boolean)
    ?? null;

  const description = playlist.description
    && !/^\d+[\d,]*\s+videos?$/i.test(playlist.description.trim())
    ? playlist.description
    : "View full playlist";

  return {
    type: "playlist",
    id: playlist.id,
    title: resolvePlaylistTitle(playlist.sourceTitle, playlist.name),
    thumbnailUrl,
    videoCount,
    videoCountText: playlist.videoCountText ?? formatVideoCountText(videoCount),
    description,
  };
};

export const getPlaylistTimestamp = (playlist: StoredPlaylist) => {
  if (playlist.createdAt) {
    const timestamp = Date.parse(playlist.createdAt);
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  const idTimestamp = playlist.id.match(/\d+$/)?.[0];
  return idTimestamp ? Number(idTimestamp) : 0;
};

export const normalizePlaylist = (playlist: StoredPlaylist): StoredPlaylist => {
  const videoCount = getStoredPlaylistVideoCount(playlist);

  return {
    ...playlist,
    name: resolvePlaylistTitle(playlist.sourceTitle, playlist.name),
    tracks: playlist.tracks ?? [],
    source: playlist.source ?? "Owned",
    createdAt: playlist.createdAt ?? new Date(getPlaylistTimestamp(playlist) || Date.now()).toISOString(),
    thumbnailUrl: playlist.thumbnailUrl
      ?? playlist.tracks.map((track) => track.thumbnailUrl).find(Boolean)
      ?? null,
    videoCount: videoCount > 0 ? videoCount : playlist.videoCount ?? null,
    videoCountText: playlist.videoCountText ?? (videoCount > 0 ? formatVideoCountText(videoCount) : null),
  };
};

export const loadStoredPlaylists = async () => {
  const playlistsJson = await getSetting(PLAYLISTS_SETTING_KEY);
  if (!playlistsJson) return [];

  const parsedPlaylists = JSON.parse(playlistsJson) as StoredPlaylist[];
  return parsedPlaylists.map(normalizePlaylist);
};

export const getStoredPlaylistById = async (playlistId: string) => {
  const playlists = await loadStoredPlaylists();
  const playlist = playlists.find((stored) => stored.id === playlistId);
  return playlist ? normalizePlaylist(playlist) : null;
};

export const updateStoredPlaylistTracks = async (
  playlistId: string,
  tracks: VideoSummary[],
) => {
  const playlists = await loadStoredPlaylists();
  const index = playlists.findIndex((stored) => stored.id === playlistId);
  if (index === -1) return null;

  const current = playlists[index];
  if (!current) return null;

  const videoCount = tracks.length;
  const updated: StoredPlaylist = normalizePlaylist({
    ...current,
    id: current.id,
    name: current.name,
    tracks,
    videoCount: videoCount > 0 ? videoCount : null,
    videoCountText: videoCount > 0 ? formatVideoCountText(videoCount) : null,
  });

  const nextPlaylists = playlists.map((stored, storedIndex) => (
    storedIndex === index ? updated : stored
  ));

  await persistStoredPlaylists(nextPlaylists);
  return updated;
};

export const persistStoredPlaylists = async (playlists: StoredPlaylist[]) => {
  await setSetting(PLAYLISTS_SETTING_KEY, JSON.stringify(playlists));
};

export const isPlaylistInLibrary = async (playlistId: string) => {
  const playlists = await loadStoredPlaylists();
  return playlists.some((playlist) => playlist.id === playlistId);
};

export const savePlaylistToLibrary = async (playlist: PlaylistSummary) => {
  const playlists = await loadStoredPlaylists();
  const existingPlaylist = playlists.find((storedPlaylist) => storedPlaylist.id === playlist.id);

  let details: Awaited<ReturnType<typeof getPlaylistDetails>> | null = null;
  try {
    details = await getPlaylistDetails(playlist.id);
  } catch (error) {
    console.warn("Failed to fetch playlist details while saving", error);
  }

  const fetchedTracks = details?.videos ?? [];
  const parsedCount = parseVideoCountFromText(playlist.videoCountText);
  const videoCount = details?.videoCount
    ?? (fetchedTracks.length > 0 ? fetchedTracks.length : null)
    ?? parsedCount
    ?? existingPlaylist?.videoCount
    ?? 0;

  const thumbnailUrl = playlist.thumbnailUrl
    ?? fetchedTracks[0]?.thumbnailUrl
    ?? existingPlaylist?.thumbnailUrl
    ?? null;

  const resolvedName = resolvePlaylistTitle(
    playlist.title,
    details?.title,
    existingPlaylist?.sourceTitle,
    existingPlaylist?.name,
  );

  const savedPlaylist: StoredPlaylist = {
    id: playlist.id,
    name: resolvedName,
    sourceTitle: playlist.title.trim() || existingPlaylist?.sourceTitle || resolvedName,
    description: details?.description?.trim() || existingPlaylist?.description || "Saved playlist",
    tracks: fetchedTracks.length > 0 ? fetchedTracks : (existingPlaylist?.tracks ?? []),
    createdAt: existingPlaylist?.createdAt ?? new Date().toISOString(),
    source: "Saved",
    thumbnailUrl,
    videoCount: videoCount > 0 ? videoCount : null,
    videoCountText: playlist.videoCountText ?? (videoCount > 0 ? formatVideoCountText(videoCount) : null),
  };

  const updatedPlaylists = existingPlaylist
    ? playlists.map((storedPlaylist) => (
      storedPlaylist.id === playlist.id ? savedPlaylist : storedPlaylist
    ))
    : [...playlists, savedPlaylist];

  await persistStoredPlaylists(updatedPlaylists);
  return updatedPlaylists;
};

export const removePlaylistFromLibrary = async (playlistId: string) => {
  const playlists = await loadStoredPlaylists();
  const updatedPlaylists = playlists.filter((playlist) => playlist.id !== playlistId);
  await persistStoredPlaylists(updatedPlaylists);
  return updatedPlaylists;
};
