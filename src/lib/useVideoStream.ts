import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { getStreamInfo, getYoutubeErrorMessage } from "./api/youtube";
import { addWatchRecord } from "./api/db";
import { isMusicVideo } from "./utils";
import { SETTINGS } from "./settings/schema";
import { selectPreferredStreamVariant } from "./settings/playerRuntime";
import { shouldRecordWatchHistory } from "./deepFlow";
import { useAppSettingsStore } from "../store/useAppSettingsStore";
import type { AudioTrack, CaptionTrack, StreamInfo, StreamVariant } from "../types/video";

export type SourceMode = "hls" | "dash-native" | "sabr-dash" | "direct" | "unavailable";

const PROGRESS_PREFIX = "flow_watch_progress:";
const getProgressKey = (videoId: string) => `${PROGRESS_PREFIX}${videoId}`;

type SavedWatchProgress = { currentTime: number; duration: number; updatedAt: number };

export const readSavedWatchProgress = (videoId: string, fallbackDuration = 0): number => {
  try {
    const raw = localStorage.getItem(getProgressKey(videoId));
    if (!raw) return 0;
    const progress = JSON.parse(raw) as SavedWatchProgress;
    const duration = progress.duration || fallbackDuration || 0;
    if (!Number.isFinite(progress.currentTime) || progress.currentTime < 5) return 0;
    if (duration > 0 && progress.currentTime >= Math.max(0, duration - 12)) return 0;
    return Math.max(0, progress.currentTime);
  } catch (error) {
    console.warn("Failed to read saved watch progress", error);
    return 0;
  }
};

export const saveLocalWatchProgress = (videoId: string, currentTime: number, duration: number) => {
  if (!Number.isFinite(currentTime) || currentTime < 0) return;
  try {
    if (duration > 0 && currentTime >= Math.max(0, duration - 12)) {
      localStorage.removeItem(getProgressKey(videoId));
      return;
    }
    localStorage.setItem(
      getProgressKey(videoId),
      JSON.stringify({ currentTime, duration, updatedAt: Date.now() } satisfies SavedWatchProgress),
    );
  } catch (error) {
    console.warn("Failed to save watch progress", error);
  }
};

export const clearLocalWatchProgress = (videoId: string) => {
  try {
    localStorage.removeItem(getProgressKey(videoId));
  } catch (error) {
    console.warn("Failed to clear watch progress", error);
  }
};

const selectVariantByBandwidth = (
  variants: StreamVariant[],
  canUseAdaptive: boolean,
): StreamVariant | null => {
  const connection =
    (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  const downlink = connection && typeof connection.downlink === "number" ? connection.downlink : 10;

  let targetHeight = 240;
  if (downlink > 25) targetHeight = 2160;
  else if (downlink > 15) targetHeight = 1440;
  else if (downlink > 8) targetHeight = 1080;
  else if (downlink > 4) targetHeight = 720;
  else if (downlink > 2) targetHeight = 480;
  else if (downlink > 0.8) targetHeight = 360;

  const playable = variants.filter((v) => v.isPlayable && (v.hasAudio || canUseAdaptive));
  if (playable.length === 0) return null;

  let best: StreamVariant | null = null;
  let minDiff = Infinity;
  for (const variant of playable) {
    const diff = Math.abs((variant.height || 0) - targetHeight);
    if (diff < minDiff) {
      minDiff = diff;
      best = variant;
    }
  }
  return best;
};

const browserSupportsVP9 = () =>
  typeof MediaSource !== "undefined" &&
  typeof MediaSource.isTypeSupported === "function" &&
  MediaSource.isTypeSupported('video/webm; codecs="vp9"');

const computeAvailableSourceModes = (info: StreamInfo): SourceMode[] => {
  const modes: SourceMode[] = [];
  const isLive = !!info.isLive;

  if (isLive && info.hlsManifestUrl) modes.push("hls");
  if (info.dashManifestUrl && browserSupportsVP9()) modes.push("dash-native");
  if (!isLive) {
    const canUseAdaptive = (info.audioTracks || []).some((track) => !!track.localUrl);
    const hasDirect =
      (info.variants || []).some((v) => v.isPlayable && (v.hasAudio || canUseAdaptive)) || !!info.localUrl;
    if (hasDirect) modes.push("direct");
    if (info.sabr?.available && info.sabr?.manifestUrl) modes.push("sabr-dash");
  }
  if (info.hlsManifestUrl && !modes.includes("hls")) modes.push("hls");
  return modes;
};

const pickDirectVariantUrl = (info: StreamInfo, qualityId: string): string | null => {
  const canUseAdaptive = (info.audioTracks || []).some((track) => !!track.localUrl);
  let chosen: StreamVariant | null = null;
  if (!qualityId || qualityId === "auto") {
    chosen = selectVariantByBandwidth(info.variants || [], canUseAdaptive);
  } else {
    chosen = info.variants?.find((v) => v.id === qualityId) || null;
  }
  if (!chosen) {
    chosen =
      info.variants?.find((v) => v.isDefault && v.isPlayable && (v.hasAudio || canUseAdaptive)) ||
      info.variants?.find((v) => v.isPlayable && (v.hasAudio || canUseAdaptive)) ||
      null;
  }
  return chosen?.localUrl || info.localUrl || null;
};

export interface VideoStream {
  streamUrl: string | null;
  streamVariants: StreamVariant[];
  captions: CaptionTrack[];
  audioTracks: AudioTrack[];
  dashManifestUrl: string | null;
  hlsManifestUrl: string | null;
  isLive: boolean;
  sourceMode: SourceMode;
  selectedQualityId: string;
  resumeTime: number;
  loadingStream: boolean;
  streamError: string | null;
  setResumeTime: (time: number) => void;
  onSelectQuality: (variant: StreamVariant | "auto") => void;
  onRetrySource: (reason: string) => void;
  onHardRetry: () => void;
}

/**
 * Resolves a playable stream for the active video and owns all source-mode
 * fallback / quality-switch logic. Captions are mirrored into the player
 * store so sibling panels (Chapters/transcript) can read them without prop drilling.
 */
export function useVideoStream(videoId: string | undefined): VideoStream {
  const currentVideo = usePlayerStore((s) => s.currentVideo);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const setCaptionsInStore = usePlayerStore((s) => s.setCaptions);
  const preferredQuality = useAppSettingsStore((s) => s.values[SETTINGS.DEFAULT_QUALITY_WIFI] ?? "1080p");
  const preferredCodec = useAppSettingsStore((s) => s.values[SETTINGS.DEFAULT_VIDEO_CODEC] ?? "H.264");

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamVariants, setStreamVariants] = useState<StreamVariant[]>([]);
  const [captions, setCaptions] = useState<CaptionTrack[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [dashManifestUrl, setDashManifestUrl] = useState<string | null>(null);
  const [hlsManifestUrl, setHlsManifestUrl] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("unavailable");
  const [selectedQualityId, setSelectedQualityId] = useState<string>("auto");
  const [resumeTime, setResumeTime] = useState(0);
  const [loadingStream, setLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const streamInfoRef = useRef<StreamInfo | null>(null);
  const attemptedModesRef = useRef<Set<SourceMode>>(new Set());

  const publishCaptions = useCallback(
    (tracks: CaptionTrack[]) => {
      setCaptions(tracks);
      setCaptionsInStore(tracks);
    },
    [setCaptionsInStore],
  );

  useEffect(() => {
    if (!currentVideo || currentVideo.id !== videoId) return;

    const loadStream = async () => {
      setLoadingStream(true);
      setStreamError(null);
      setStreamUrl(null);
      setDashManifestUrl(null);
      setHlsManifestUrl(null);
      setAudioTracks([]);
      setStreamVariants([]);
      publishCaptions([]);
      setIsLive(false);
      setSourceMode("unavailable");
      setResumeTime(0);
      try {
        const info = await getStreamInfo(currentVideo.id);
        streamInfoRef.current = info;
        attemptedModesRef.current = new Set();
        setStreamVariants(info.variants || []);
        publishCaptions(info.captions || []);
        setAudioTracks(info.audioTracks || []);
        setIsLive(!!info.isLive);

        const canUseAdaptive = (info.audioTracks || []).some((track) => !!track.localUrl);
        const preferredVariant = selectPreferredStreamVariant(
          info.variants || [],
          preferredQuality,
          preferredCodec,
          canUseAdaptive,
        );
        let initialQualityId = preferredVariant?.id || (preferredQuality === "Auto" ? "auto" : selectedQualityId || "auto");
        if (initialQualityId === "null" || !initialQualityId) initialQualityId = "auto";
        setSelectedQualityId(initialQualityId);

        // A live broadcast has no meaningful resume point.
        setResumeTime(
          info.isLive ? 0 : readSavedWatchProgress(currentVideo.id, currentVideo.durationSeconds ?? 0),
        );

        const availableModes = computeAvailableSourceModes(info);
        const initialMode: SourceMode = availableModes[0] || "unavailable";
        attemptedModesRef.current.add(initialMode);
        setSourceMode(initialMode);

        if (initialMode === "hls") {
          setHlsManifestUrl(info.hlsManifestUrl || null);
          setDashManifestUrl(null);
          setStreamUrl(null);
        } else if (initialMode === "dash-native") {
          setHlsManifestUrl(null);
          setDashManifestUrl(info.dashManifestUrl || null);
          setStreamUrl(info.dashManifestUrl || null);
        } else if (initialMode === "sabr-dash") {
          setHlsManifestUrl(null);
          setDashManifestUrl(info.sabr?.manifestUrl || null);
          setStreamUrl(info.sabr?.manifestUrl || null);
        } else {
          setHlsManifestUrl(null);
          setDashManifestUrl(null);
          setStreamUrl(pickDirectVariantUrl(info, initialQualityId));
        }

        setIsPlaying(true);

        if (shouldRecordWatchHistory()) {
          await addWatchRecord({
            videoId: currentVideo.id,
            title: currentVideo.title,
            channelName: currentVideo.channelName,
            channelId: currentVideo.channelId ?? null,
            watchDate: new Date().toISOString(),
            watchDurationSeconds: Math.floor(
              readSavedWatchProgress(currentVideo.id, currentVideo.durationSeconds ?? 0),
            ),
            totalDurationSeconds: currentVideo.durationSeconds ?? 0,
            isMusic: isMusicVideo(currentVideo),
          });
        }
      } catch (err) {
        setStreamUrl(null);
        setStreamVariants([]);
        publishCaptions([]);
        setAudioTracks([]);
        setDashManifestUrl(null);
        setHlsManifestUrl(null);
        setIsLive(false);
        setSelectedQualityId("auto");
        setStreamError(getYoutubeErrorMessage(err));
        console.error("Failed to load stream URL", err);
      } finally {
        setLoadingStream(false);
      }
    };

    void loadStream();
  }, [currentVideo, videoId, setIsPlaying, publishCaptions, preferredCodec, preferredQuality]);

  const onSelectQuality = useCallback(
    (variant: StreamVariant | "auto") => {
      if (variant === "auto") {
        setSelectedQualityId("auto");
        setIsPlaying(true);
        if (dashManifestUrl) return;
        const canUseAdaptive = audioTracks.some((track) => !!track.localUrl);
        const chosenVariant = selectVariantByBandwidth(streamVariants, canUseAdaptive);
        if (chosenVariant) {
          setResumeTime(usePlayerStore.getState().currentTime);
          setStreamUrl(chosenVariant.localUrl);
        }
        return;
      }

      if (!variant.isPlayable) return;
      if (!dashManifestUrl && !variant.hasAudio && !audioTracks.some((track) => !!track.localUrl)) return;

      if (dashManifestUrl) {
        setSelectedQualityId(variant.id);
        setIsPlaying(true);
        return;
      }
      setResumeTime(usePlayerStore.getState().currentTime);
      setSelectedQualityId(variant.id);
      setStreamUrl(variant.localUrl);
      setIsPlaying(true);
    },
    [audioTracks, dashManifestUrl, setIsPlaying, streamVariants],
  );

  const onRetrySource = useCallback(
    (reason: string) => {
      const info = streamInfoRef.current;
      if (!info) return;
      const available = computeAvailableSourceModes(info);
      const resumeAt = usePlayerStore.getState().currentTime || 0;

      attemptedModesRef.current.add(sourceMode);
      const next = available.find((mode) => !attemptedModesRef.current.has(mode));
      console.warn("[Watch] source-mode fallback", { reason, from: sourceMode, next, available });

      if (!next) {
        if (!reason.startsWith("buffering-stall")) {
          setStreamError("Playback failed on all available sources for this video.");
        } else {
          console.warn("[Watch] stall on last available source; continuing to buffer", { reason });
        }
        return;
      }

      attemptedModesRef.current.add(next);
      setResumeTime(info.isLive ? 0 : resumeAt);
      setSourceMode(next);
      if (next === "hls") {
        setHlsManifestUrl(info.hlsManifestUrl || null);
        setDashManifestUrl(null);
        setStreamUrl(null);
      } else if (next === "dash-native") {
        setHlsManifestUrl(null);
        setDashManifestUrl(info.dashManifestUrl || null);
        setStreamUrl(info.dashManifestUrl || null);
      } else if (next === "sabr-dash") {
        setHlsManifestUrl(null);
        setDashManifestUrl(info.sabr?.manifestUrl || null);
        setStreamUrl(info.sabr?.manifestUrl || null);
      } else {
        setHlsManifestUrl(null);
        setDashManifestUrl(null);
        setStreamUrl(pickDirectVariantUrl(info, selectedQualityId || "auto"));
      }
    },
    [sourceMode, selectedQualityId],
  );

  const onHardRetry = useCallback(() => {
    if (!currentVideo) return;
    setStreamUrl(null);
    setStreamVariants([]);
    publishCaptions([]);
    setAudioTracks([]);
    setSelectedQualityId("auto");
    void getStreamInfo(currentVideo.id)
      .then((info) => {
        streamInfoRef.current = info;
        attemptedModesRef.current = new Set();
        setStreamVariants(info.variants || []);
        publishCaptions(info.captions || []);
        setAudioTracks(info.audioTracks || []);
        setIsLive(!!info.isLive);
        const canUseAdaptive = (info.audioTracks || []).some((track) => !!track.localUrl);
        const preferredVariant = selectPreferredStreamVariant(
          info.variants || [],
          preferredQuality,
          preferredCodec,
          canUseAdaptive,
        );
        const initialQualityId = preferredVariant?.id || "auto";
        setSelectedQualityId(initialQualityId);
        setStreamError(null);

        const mode = computeAvailableSourceModes(info)[0] || "unavailable";
        attemptedModesRef.current.add(mode);
        setSourceMode(mode);
        if (mode === "hls") {
          setHlsManifestUrl(info.hlsManifestUrl || null);
          setDashManifestUrl(null);
          setStreamUrl(null);
        } else if (mode === "dash-native") {
          setHlsManifestUrl(null);
          setDashManifestUrl(info.dashManifestUrl || null);
          setStreamUrl(info.dashManifestUrl || null);
        } else if (mode === "sabr-dash") {
          setHlsManifestUrl(null);
          setDashManifestUrl(info.sabr?.manifestUrl || null);
          setStreamUrl(info.sabr?.manifestUrl || null);
        } else {
          setHlsManifestUrl(null);
          setDashManifestUrl(null);
          setStreamUrl(pickDirectVariantUrl(info, initialQualityId));
        }
      })
      .catch((err) => setStreamError(getYoutubeErrorMessage(err)));
  }, [currentVideo, preferredCodec, preferredQuality, publishCaptions]);

  return {
    streamUrl,
    streamVariants,
    captions,
    audioTracks,
    dashManifestUrl,
    hlsManifestUrl,
    isLive,
    sourceMode,
    selectedQualityId,
    resumeTime,
    loadingStream,
    streamError,
    setResumeTime,
    onSelectQuality,
    onRetrySource,
    onHardRetry,
  };
}
