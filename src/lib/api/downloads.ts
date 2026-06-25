import { invokeBackend } from "./errors";

export type DownloadMediaKind = "video" | "music" | "audio";
export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "waitingForNetwork"
  | "muxing"
  | "completed"
  | "failed"
  | "cancelled";

export interface StartDownloadRequest {
  sourceUrl?: string;
  adaptive?: AdaptiveDownloadRequest;
  title: string;
  mediaKind: DownloadMediaKind;
  qualityLabel: string;
  destinationDirectory?: string;
  parallel: boolean;
  threads: number;
  /** Source identifiers used to save companion files (poster, SponsorBlock, lyrics). */
  videoId?: string;
  thumbnailUrl?: string;
}

export interface AdaptiveDownloadRequest {
  videoUrl: string;
  audioUrl: string;
  container: DownloadContainer;
  videoMimeType: string;
  audioMimeType: string;
}

export interface DownloadStarted {
  id: string;
  filePath: string;
}

export interface DownloadProgress {
  id: string;
  title: string;
  mediaKind: DownloadMediaKind;
  qualityLabel: string;
  filePath: string;
  downloadedBytes: number;
  totalBytes: number | null;
  status: DownloadStatus;
  error: string | null;
  logs: string[];
}

export type DownloadContainer = "mp4" | "mkv";

export interface DownloadableFormat {
  formatId: string;
  resolution: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  container: DownloadContainer;
  videoCodec: string;
  audioCodec: string;
  videoMimeType: string;
  audioMimeType: string;
  videoBitrate: number | null;
  audioBitrate: number | null;
  videoSizeBytes: number | null;
  audioSizeBytes: number | null;
  estimatedSizeBytes: number | null;
  videoUrl: string;
  audioUrl: string;
}

export function getDownloadFormats(videoId: string): Promise<DownloadableFormat[]> {
  return invokeBackend<DownloadableFormat[]>("get_download_formats", { videoId });
}

export function startDownload(request: StartDownloadRequest): Promise<DownloadStarted> {
  return invokeBackend<DownloadStarted>("start_download", { request });
}

export function cancelDownload(id: string): Promise<boolean> {
  return invokeBackend<boolean>("cancel_download", { id });
}

export function pauseDownload(id: string): Promise<boolean> {
  return invokeBackend<boolean>("pause_download", { id });
}

export function resumeDownload(id: string): Promise<boolean> {
  return invokeBackend<boolean>("resume_download", { id });
}
