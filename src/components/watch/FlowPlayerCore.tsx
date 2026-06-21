import { useCallback, useEffect, useRef } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import Player from "../player/Player";
import {
  useVideoStream,
  saveLocalWatchProgress,
  clearLocalWatchProgress,
} from "../../lib/useVideoStream";
import { logInteraction } from "../../lib/api/recommendation";
import { addWatchRecord } from "../../lib/api/db";
import { isMusicVideo } from "../../lib/utils";
import { SETTINGS } from "../../lib/settings/schema";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { shouldRecordWatchHistory } from "../../lib/deepFlow";
import type { FlowPlayerCoreProps } from "./types";

/**
 * Owns stream resolution (via useVideoStream) and all playback feedback —
 * progress persistence + recommendation logging. Reads `currentVideo`/`dearrowData`
 * via granular selectors and writes `currentTime` through an action, so its frequent
 * time updates never re-render sibling slots (metadata / related). The <Player> itself
 * owns its sizing and reads `isTheaterMode` directly.
 */
export function FlowPlayerCore({ videoId, videoDetails, onEnded }: FlowPlayerCoreProps) {
  const currentVideo = usePlayerStore((s) => s.currentVideo);
  const dearrowData = usePlayerStore((s) => s.dearrowData);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const playNext = usePlayerStore((s) => s.playNext);
  const autoplayEnabled = useAppSettingsStore((s) => s.values[SETTINGS.AUTOPLAY_ENABLED] !== "false");

  const stream = useVideoStream(videoId);

  const lastProgressPersistedAtRef = useRef(0);
  const latestProgressRef = useRef<{ time: number; duration: number } | null>(null);

  const resolvedChannelId =
    videoDetails?.channelId || currentVideo?.channelId || currentVideo?.id || "";

  const handleTimeUpdate = useCallback(
    (time: number, mediaDuration: number) => {
      const nextDuration = mediaDuration || currentVideo?.durationSeconds || 1;
      setCurrentTime(time);
      setDuration(nextDuration);

      if (!currentVideo) return;
      latestProgressRef.current = { time, duration: nextDuration };
      const recordHistory = shouldRecordWatchHistory();
      if (recordHistory) {
        saveLocalWatchProgress(currentVideo.id, time, nextDuration);
      }

      const now = Date.now();
      if (now - lastProgressPersistedAtRef.current < 5000) return;
      lastProgressPersistedAtRef.current = now;

      const percentWatched = nextDuration > 0 ? Math.min(1, Math.max(0, time / nextDuration)) : 0;
      void logInteraction(
        currentVideo.id,
        currentVideo.title,
        currentVideo.channelName,
        resolvedChannelId || currentVideo.id,
        videoDetails?.description || null,
        Math.floor(nextDuration) || null,
        false,
        nextDuration <= 60,
        "WATCHED",
        percentWatched,
      ).catch((err) => console.warn("Failed to log watch interaction", err));

      if (recordHistory) {
        void addWatchRecord({
          videoId: currentVideo.id,
          title: currentVideo.title,
          channelName: currentVideo.channelName,
          watchDate: new Date().toISOString(),
          watchDurationSeconds: Math.floor(time),
          totalDurationSeconds: Math.floor(nextDuration || 0),
          isMusic: isMusicVideo(currentVideo),
        });
      }
    },
    [currentVideo, resolvedChannelId, setCurrentTime, setDuration, videoDetails],
  );

  useEffect(() => {
    if (!currentVideo) return;

    const persistLatestProgress = () => {
      const latest = latestProgressRef.current;
      if (!latest) return;
      const recordHistory = shouldRecordWatchHistory();
      if (recordHistory) {
        saveLocalWatchProgress(currentVideo.id, latest.time, latest.duration);
      }

      const duration = latest.duration || currentVideo.durationSeconds || 1;
      const percentWatched = duration > 0 ? Math.min(1, Math.max(0, latest.time / duration)) : 0;
      const finalType = latest.time < 15 && percentWatched < 0.15 ? "SKIPPED" : "WATCHED";
      void logInteraction(
        currentVideo.id,
        currentVideo.title,
        currentVideo.channelName,
        resolvedChannelId || currentVideo.id,
        videoDetails?.description || null,
        Math.floor(duration) || null,
        false,
        duration <= 60,
        finalType,
        percentWatched,
      ).catch((err) => console.warn("Failed to log final watch interaction", err));

      if (recordHistory) {
        void addWatchRecord({
          videoId: currentVideo.id,
          title: currentVideo.title,
          channelName: currentVideo.channelName,
          watchDate: new Date().toISOString(),
          watchDurationSeconds: Math.floor(latest.time),
          totalDurationSeconds: Math.floor(latest.duration || currentVideo.durationSeconds || 0),
          isMusic: isMusicVideo(currentVideo),
        });
      }
    };

    window.addEventListener("beforeunload", persistLatestProgress);
    return () => {
      window.removeEventListener("beforeunload", persistLatestProgress);
      persistLatestProgress();
    };
  }, [currentVideo, resolvedChannelId, videoDetails]);

  const handleEnded = useCallback(() => {
    if (!currentVideo) return;
    const duration = latestProgressRef.current?.duration || currentVideo.durationSeconds || 1;
    void logInteraction(
      currentVideo.id,
      currentVideo.title,
      currentVideo.channelName,
      resolvedChannelId || currentVideo.id,
      videoDetails?.description || null,
      Math.floor(duration) || null,
      false,
      duration <= 60,
      "WATCHED",
      1,
    ).catch((err) => console.warn("Failed to log watch interaction on ended", err));

    clearLocalWatchProgress(currentVideo.id);
    if (autoplayEnabled) {
      playNext();
    } else {
      setIsPlaying(false);
    }
    onEnded?.();
  }, [autoplayEnabled, currentVideo, onEnded, playNext, resolvedChannelId, setIsPlaying, videoDetails]);

  const title = (dearrowData?.title || currentVideo?.title) ?? "";
  const poster =
    dearrowData?.thumbnailUrl || currentVideo?.thumbnailUrl || videoDetails?.thumbnailUrl;

  return (
    <Player
      src={stream.streamUrl}
      title={title}
      poster={poster}
      isLoading={stream.loadingStream}
      error={stream.streamError}
      qualities={stream.streamVariants}
      captions={stream.captions}
      audioTracks={stream.audioTracks}
      dashManifestUrl={stream.dashManifestUrl}
      hlsManifestUrl={stream.hlsManifestUrl}
      isLive={stream.isLive}
      selectedQualityId={stream.selectedQualityId}
      resumeTime={stream.resumeTime}
      sourceMode={stream.sourceMode}
      chapters={videoDetails?.chapters}
      onRetrySource={stream.onRetrySource}
      onSelectQuality={stream.onSelectQuality}
      onTimeUpdate={handleTimeUpdate}
      onEnded={handleEnded}
      onRetry={stream.onHardRetry}
    />
  );
}
