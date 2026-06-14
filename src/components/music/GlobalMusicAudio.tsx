import { useEffect, useRef } from "react";

import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { musicAudioEngine } from "../../lib/audio/musicAudioEngine";

export function GlobalMusicAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = useMusicPlayerStore((s) => s.currentTrack);
  const isPlaying = useMusicPlayerStore((s) => s.isPlaying);

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
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const el = audioRef.current;
      if (el) {
        useMusicPlayerStore.getState()._syncTime(el.currentTime, el.duration);
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
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artists.map((a) => a.name).join(", "),
          album: currentTrack.album?.name ?? "",
          artwork: currentTrack.thumbnail
            ? [{ src: currentTrack.thumbnail, sizes: "512x512", type: "image/jpeg" }]
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
