import { useEffect, useRef, useState } from "react";
import * as dashjs from "dashjs";

interface ShortVideoSurfaceProps {
  dashUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  poster?: string;
  active: boolean;
  muted: boolean;
  onError?: () => void;
}

function proxyPrefix(dashUrl: string): string | null {
  const marker = "?url=";
  const index = dashUrl.indexOf(marker);
  return index < 0 ? null : dashUrl.slice(0, index + marker.length);
}

export function ShortVideoSurface({
  dashUrl,
  videoUrl,
  audioUrl,
  poster,
  active,
  muted,
  onError,
}: ShortVideoSurfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const [fit, setFit] = useState<"cover" | "contain">("cover");

  const useDirect = !!videoUrl;
  const hasSeparateAudio = useDirect && !!audioUrl && audioUrl !== videoUrl;

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    let syncTimer: number | null = null;

    const teardown = () => {
      if (syncTimer != null) {
        window.clearInterval(syncTimer);
        syncTimer = null;
      }
      try {
        dashRef.current?.destroy();
      } catch {
        dashRef.current = null;
      }
      dashRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
    };

    if (!active) {
      teardown();
      return teardown;
    }

    if (useDirect && videoUrl) {
      teardown();
      video.src = videoUrl;
      video.loop = !hasSeparateAudio;
      video.muted = true;

      if (audio && hasSeparateAudio && audioUrl) {
        audio.src = audioUrl;
        audio.loop = true;
        audio.muted = true;
        audio.volume = 1;
      }

      const playBoth = () => {
        if (audio && hasSeparateAudio) {
          audio.currentTime = video.currentTime;
          void audio.play().catch(() => {});
        }
        void video.play().catch(() => {});
      };

      const pauseAudio = () => {
        if (audio && hasSeparateAudio) audio.pause();
      };

      const loopBoth = () => {
        video.currentTime = 0;
        if (audio && hasSeparateAudio) audio.currentTime = 0;
        playBoth();
      };

      video.addEventListener("canplay", playBoth);
      video.addEventListener("pause", pauseAudio);
      video.addEventListener("ended", loopBoth);

      if (audio && hasSeparateAudio) {
        syncTimer = window.setInterval(() => {
          if (video.paused || audio.paused) return;
          if (Math.abs(audio.currentTime - video.currentTime) > 0.25) {
            audio.currentTime = video.currentTime;
          }
        }, 1_000);
      }

      video.load();

      return () => {
        video.removeEventListener("canplay", playBoth);
        video.removeEventListener("pause", pauseAudio);
        video.removeEventListener("ended", loopBoth);
        teardown();
      };
    }

    if (dashUrl) {
      teardown();
      video.loop = true;
      video.muted = true;
      const player = dashjs.MediaPlayer().create();
      const dashEvents = dashjs.MediaPlayer.events;
      const playDash = () => {
        void video.play().catch(() => {});
      };
      const handleDashError = () => onError?.();
      const prefix = proxyPrefix(dashUrl);
      if (prefix) {
        player.extend(
          "RequestModifier",
          () => ({
            modifyRequestURL: (url: string) =>
              url.startsWith("http://127.0.0.1:") || url.startsWith("blob:")
                ? url
                : `${prefix}${encodeURIComponent(url)}`,
            modifyRequestHeader: (xhr: XMLHttpRequest) => xhr,
          }),
          true,
        );
      }
      player.updateSettings({
        streaming: {
          capabilities: { useMediaCapabilitiesApi: false },
          buffer: { bufferToKeep: 12, bufferTimeDefault: 3 },
        },
      });
      player.on(dashEvents.STREAM_INITIALIZED, playDash);
      player.on(dashEvents.ERROR, handleDashError);
      player.initialize(video, dashUrl, true);
      dashRef.current = player;

      return () => {
        player.off(dashEvents.STREAM_INITIALIZED, playDash);
        player.off(dashEvents.ERROR, handleDashError);
        teardown();
      };
    }

    return teardown;
  }, [active, audioUrl, dashUrl, hasSeparateAudio, useDirect, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (hasSeparateAudio && audio) {
      if (video) video.muted = true;
      audio.muted = muted;
      if (!muted && active) void audio.play().catch(() => {});
    } else if (video) {
      video.muted = muted;
      if (!muted && active) void video.play().catch(() => {});
    }
  }, [active, hasSeparateAudio, muted]);

  return (
    <>
      <video
        ref={videoRef}
        poster={poster}
        className={`h-full w-full bg-black ${fit === "cover" ? "object-cover" : "object-contain"}`}
        playsInline
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight) {
            setFit(v.videoHeight >= v.videoWidth ? "cover" : "contain");
          }
        }}
        onError={(e) => {
          const v = e.currentTarget;
          if (active && v.error && v.currentSrc) onError?.();
        }}
      />
      <audio ref={audioRef} preload="auto" />
    </>
  );
}
