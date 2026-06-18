import { useEffect, useRef } from "react";

import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { musicAudioEngine } from "../../lib/audio/musicAudioEngine";
import { recordSongHistory } from "../../lib/musicHistory";
import { upgradeMusicImageUrl } from "../../lib/thumbnails";
import type { SongItem } from "../../types/music";

const HISTORY_PERSIST_MS = 5000;

export function GlobalMusicAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = useMusicPlayerStore((s) => s.currentTrack);
  const isPlaying = useMusicPlayerStore((s) => s.isPlaying);

  // --- watch-history persistence ---
  const historyTrackRef = useRef<SongItem | null>(null);
  const lastProgressRef = useRef({ time: 0, duration: 0 });
  const lastPersistAtRef = useRef(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    musicAudioEngine.attach(el);
    const s = useMusicPlayerStore.getState();
    musicAudioEngine.setVolume(s.volume);
    musicAudioEngine.setMuted(s.isMuted);
    musicAudioEngine.setEqEnabled(s.eqEnabled);
    musicAudioEngine.setEqGains(s.eqGains);
  }, []);

  useEffect(() => {
    if (currentTrack) {
      historyTrackRef.current = currentTrack;
      lastProgressRef.current = { time: 0, duration: currentTrack.duration ?? 0 };
      lastPersistAtRef.current = Date.now();
      void recordSongHistory(currentTrack, 0, currentTrack.duration ?? 0);
    }
    return () => {
      const prev = historyTrackRef.current;
      if (prev) {
        const { time, duration } = lastProgressRef.current;
        void recordSongHistory(prev, time, duration);
      }
    };
  }, [currentTrack?.id]);

  useEffect(() => {
    const handler = () => {
      const t = historyTrackRef.current;
      if (!t) return;
      const { time, duration } = lastProgressRef.current;
      void recordSongHistory(t, time, duration);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const el = audioRef.current;
      if (el) {
        useMusicPlayerStore.getState()._syncTime(el.currentTime, el.duration);
        const duration = Number.isFinite(el.duration)
          ? el.duration
          : lastProgressRef.current.duration;
        lastProgressRef.current = { time: el.currentTime, duration };

        const now = Date.now();
        if (now - lastPersistAtRef.current > HISTORY_PERSIST_MS) {
          lastPersistAtRef.current = now;
          const t = historyTrackRef.current;
          if (t) void recordSongHistory(t, el.currentTime, duration);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const store = () => useMusicPlayerStore.getState();

    if (currentTrack) {
      const artwork = upgradeMusicImageUrl(currentTrack.thumbnail, 512);
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artists.map((a) => a.name).join(", "),
          album: currentTrack.album?.name ?? "",
          artwork: artwork
            ? [{ src: artwork, sizes: "512x512", type: "image/jpeg" }]
            : [],
        });
      } catch {
      }
    }

    navigator.mediaSession.setActionHandler("play", () => store().play());
    navigator.mediaSession.setActionHandler("pause", () => store().pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => store().previous());
    navigator.mediaSession.setActionHandler("nexttrack", () => store().next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") store().seek(details.seekTime);
    });
  }, [currentTrack]);

  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
  }, [isPlaying]);

  return (
    <audio
      ref={audioRef}
      hidden
      preload="auto"
      onPlay={() => useMusicPlayerStore.getState()._reflectPlaying(true)}
      onPause={() => useMusicPlayerStore.getState()._reflectPlaying(false)}
      onWaiting={() => useMusicPlayerStore.getState()._setBuffering(true)}
      onPlaying={() => useMusicPlayerStore.getState()._setBuffering(false)}
      onDurationChange={(e) =>
        useMusicPlayerStore
          .getState()
          ._syncTime(e.currentTarget.currentTime, e.currentTarget.duration)
      }
      onEnded={() => useMusicPlayerStore.getState().handleEnded()}
      onError={() => useMusicPlayerStore.getState()._onPlaybackError()}
    />
  );
}
