import { useEffect, useRef, useState } from "react";
import { getStreamInfo } from "./api/youtube";
import type { StreamInfo } from "../types/video";

export const RESOLVE_TIMEOUT_MS = 12_000;
const TARGET_SHORT_HEIGHT = 720;

interface ShortPlaybackSource {
  dashUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
}

const streamCache = new Map<string, ShortPlaybackSource>();
const inFlightStreams = new Map<string, Promise<ShortPlaybackSource>>();
let resolveChain: Promise<unknown> = Promise.resolve();

function isMp4(mime?: string | null): boolean {
  return !!mime && mime.toLowerCase().includes("mp4");
}

export function codecRank(mime?: string | null): number {
  const value = mime?.toLowerCase() ?? "";
  if (value.includes("avc1") || value.includes("h264")) return 0;
  if (value.includes("vp9") || value.includes("vp09")) return 1;
  if (value.includes("av01")) return 2;
  return 3;
}

function canPlayMime(mime?: string | null): boolean {
  if (!mime || typeof document === "undefined") return true;
  const video = document.createElement(mime.startsWith("audio/") ? "audio" : "video");
  return video.canPlayType(mime) !== "";
}

export function pickDirectUrl(info: StreamInfo): string | null {
  const muxed = (info.variants || [])
    .filter(
      (variant) =>
        variant.isPlayable &&
        variant.hasAudio &&
        !!variant.localUrl &&
        canPlayMime(variant.mimeType),
    )
    .sort(
      (a, b) =>
        codecRank(a.mimeType) - codecRank(b.mimeType) ||
        Number(isMp4(b.mimeType)) - Number(isMp4(a.mimeType)) ||
        (b.height ?? 0) - (a.height ?? 0),
    );
  return muxed[0]?.localUrl ?? null;
}

export function pickAdaptiveVideoUrl(info: StreamInfo): string | null {
  const variants = (info.variants || [])
    .filter(
      (variant) =>
        variant.isPlayable &&
        variant.isVideoOnly &&
        !!variant.localUrl &&
        canPlayMime(variant.mimeType),
    )
    .sort((a, b) => {
      const aHeight = a.height ?? 0;
      const bHeight = b.height ?? 0;
      const aOver = aHeight > TARGET_SHORT_HEIGHT ? 1 : 0;
      const bOver = bHeight > TARGET_SHORT_HEIGHT ? 1 : 0;
      return (
        aOver - bOver ||
        codecRank(a.mimeType) - codecRank(b.mimeType) ||
        Number(isMp4(b.mimeType)) - Number(isMp4(a.mimeType)) ||
        Math.abs(aHeight - TARGET_SHORT_HEIGHT) - Math.abs(bHeight - TARGET_SHORT_HEIGHT) ||
        (b.bitrate ?? 0) - (a.bitrate ?? 0)
      );
    });
  return variants[0]?.localUrl ?? null;
}

export function pickAudioUrl(info: StreamInfo): string | null {
  const tracks = (info.audioTracks || [])
    .filter((track) => track.available && !!track.localUrl && canPlayMime(track.mimeType))
    .sort((a, b) => {
      const defaultRank = Number(b.isDefault) - Number(a.isDefault);
      if (defaultRank !== 0) return defaultRank;
      const mp4Rank = Number(isMp4(b.mimeType)) - Number(isMp4(a.mimeType));
      if (mp4Rank !== 0) return mp4Rank;
      return (b.bitrate ?? 0) - (a.bitrate ?? 0);
    });
  return tracks[0]?.localUrl ?? null;
}

export function selectShortPlaybackSource(info: StreamInfo): ShortPlaybackSource {
  const adaptiveVideo = pickAdaptiveVideoUrl(info);
  const audioUrl = pickAudioUrl(info);
  if (adaptiveVideo) {
    return {
      dashUrl: info.dashManifestUrl ?? null,
      videoUrl: adaptiveVideo,
      audioUrl,
    };
  }

  return {
    dashUrl: info.dashManifestUrl ?? null,
    videoUrl: pickDirectUrl(info),
    audioUrl: null,
  };
}

function fetchShortStream(videoId: string): Promise<ShortPlaybackSource> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("stream resolve timed out")), RESOLVE_TIMEOUT_MS),
  );

  return Promise.race([getStreamInfo(videoId), timeout])
    .then(selectShortPlaybackSource)
    .then((source) => {
      streamCache.set(videoId, source);
      return source;
    });
}

export function resolveShortStream(videoId: string): Promise<ShortPlaybackSource> {
  const cached = streamCache.get(videoId);
  if (cached) return Promise.resolve(cached);

  const existing = inFlightStreams.get(videoId);
  if (existing) return existing;

  const request = resolveChain.then(() => streamCache.get(videoId) ?? fetchShortStream(videoId));
  resolveChain = request.then(
    () => {},
    () => {},
  );

  const tracked = request.finally(() => inFlightStreams.delete(videoId));
  inFlightStreams.set(videoId, tracked);
  return tracked;
}

export function useShortStream(videoId: string, shouldLoad: boolean, retryToken = 0) {
  const [dashUrl, setDashUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const retryTokenRef = useRef(retryToken);

  useEffect(() => {
    if (retryTokenRef.current !== retryToken) {
      retryTokenRef.current = retryToken;
      setUnavailable(false);
      setDashUrl(null);
      setVideoUrl(null);
      setAudioUrl(null);
      streamCache.delete(videoId);
      inFlightStreams.delete(videoId);
    }
    if (!shouldLoad) return;
    let cancelled = false;
    setLoading(true);

    resolveShortStream(videoId)
      .then((source) => {
        if (cancelled) return;
        setDashUrl(source.dashUrl);
        setVideoUrl(source.videoUrl);
        setAudioUrl(source.audioUrl);
        setUnavailable(!source.dashUrl && !source.videoUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn(`[shorts] stream ${videoId} unavailable:`, err);
        setUnavailable(true);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [retryToken, shouldLoad, videoId]);

  return { dashUrl, videoUrl, audioUrl, loading, unavailable };
}
