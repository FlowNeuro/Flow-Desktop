// Typed Tauri command wrappers for the YouTube Music subsystem.
// Mirrors the style of `youtube.ts`; every function maps 1:1 to a
// `#[tauri::command]` in `src-tauri/src/commands/music.rs`.

import { invokeBackend } from "./errors";
import type {
  AlbumItem,
  AlbumPage,
  ArtistPage,
  ChartsPage,
  ExplorePage,
  MoodAndGenreItem,
  MoodGenrePage,
  MusicHomePage,
  MusicPlaylistPage,
  MusicSearchResponse,
  MusicSearchSuggestions,
  MusicStreamInfo,
  QueuePage,
  RelatedPage,
  SearchSummaryPage,
  SongContinuation,
} from "../../types/music";

export type MusicAudioQuality = "Auto" | "High" | "Medium" | "Low";

// --- Browse ---------------------------------------------------------------

export function getMusicHomePage(continuation?: string): Promise<MusicHomePage> {
  return invokeBackend<MusicHomePage>("get_music_home_page", { continuation });
}

export function getMusicExplorePage(): Promise<ExplorePage> {
  return invokeBackend<ExplorePage>("get_music_explore_page");
}

export function getMusicChartsPage(continuation?: string): Promise<ChartsPage> {
  return invokeBackend<ChartsPage>("get_music_charts_page", { continuation });
}

export function getMusicMoods(): Promise<MoodAndGenreItem[]> {
  return invokeBackend<MoodAndGenreItem[]>("get_music_moods");
}

export function getMusicNewReleases(): Promise<AlbumItem[]> {
  return invokeBackend<AlbumItem[]>("get_music_new_releases");
}

export function getMusicMoodGenre(
  browseId: string,
  params?: string,
  continuation?: string,
): Promise<MoodGenrePage> {
  return invokeBackend<MoodGenrePage>("get_music_mood_genre", { browseId, params, continuation });
}

export function getMusicArtistItems(
  browseId: string,
  params?: string,
  continuation?: string,
): Promise<MoodGenrePage> {
  return invokeBackend<MoodGenrePage>("get_music_artist_items", { browseId, params, continuation });
}

// --- Search ---------------------------------------------------------------

export function searchMusicTyped(query: string, filter = ""): Promise<MusicSearchResponse> {
  return invokeBackend<MusicSearchResponse>("search_music_typed", { query, filter });
}

export function searchMusicContinuation(continuation: string): Promise<MusicSearchResponse> {
  return invokeBackend<MusicSearchResponse>("search_music_continuation", { continuation });
}

export function getMusicSearchSummary(query: string): Promise<SearchSummaryPage> {
  return invokeBackend<SearchSummaryPage>("get_music_search_summary", { query });
}

export function getMusicSearchSuggestions(query: string): Promise<MusicSearchSuggestions> {
  return invokeBackend<MusicSearchSuggestions>("get_music_search_suggestions", { query });
}

// --- Album / Artist / Playlist -------------------------------------------

export function getMusicAlbumPage(browseId: string): Promise<AlbumPage> {
  return invokeBackend<AlbumPage>("get_music_album_page", { browseId });
}

export function getMusicAlbumContinuation(continuation: string): Promise<SongContinuation> {
  return invokeBackend<SongContinuation>("get_music_album_continuation", { continuation });
}

export function getMusicArtistPage(browseId: string): Promise<ArtistPage> {
  return invokeBackend<ArtistPage>("get_music_artist_page", { browseId });
}

export function getMusicPlaylistPage(playlistId: string): Promise<MusicPlaylistPage> {
  return invokeBackend<MusicPlaylistPage>("get_music_playlist_page", { playlistId });
}

export function getMusicPlaylistContinuation(continuation: string): Promise<SongContinuation> {
  return invokeBackend<SongContinuation>("get_music_playlist_continuation", { continuation });
}

// --- Watch / queue / lyrics ----------------------------------------------

export function getMusicWatchQueue(
  videoId?: string,
  playlistId?: string,
  params?: string,
): Promise<QueuePage> {
  return invokeBackend<QueuePage>("get_music_watch_queue", { videoId, playlistId, params });
}

export function getMusicQueueContinuation(continuation: string): Promise<QueuePage> {
  return invokeBackend<QueuePage>("get_music_queue_continuation", { continuation });
}

export function getMusicQueue(videoIds: string[], playlistId?: string): Promise<QueuePage> {
  return invokeBackend<QueuePage>("get_music_queue", { videoIds, playlistId });
}

export function getMusicRelatedTyped(videoId: string): Promise<RelatedPage> {
  return invokeBackend<RelatedPage>("get_music_related_typed", { videoId });
}

export function getMusicLyricsTyped(videoId: string): Promise<string | null> {
  return invokeBackend<string | null>("get_music_lyrics_typed", { videoId });
}

// --- Playback -------------------------------------------------------------

/**
 * Resolve a proxied, playable audio stream for a music track. The returned
 * `audioUrl` is already a local proxy URL (`http://127.0.0.1:{port}/stream/…`)
 * — feed it straight to an `<audio>` element. `loudnessDb` is for volume
 * normalization.
 */
export function getMusicStream(
  videoId: string,
  audioQuality: MusicAudioQuality = "Auto",
): Promise<MusicStreamInfo> {
  return invokeBackend<MusicStreamInfo>("get_music_stream", { videoId, audioQuality });
}
