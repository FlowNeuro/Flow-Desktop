import { useCallback, useEffect, useRef, useState } from "react";
import * as dashjs from "dashjs";
import { Play } from "lucide-react";
import { MediaScrubber } from "../ui/MediaScrubber";

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
  const userPausedRef = useRef(false);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [userPaused, setUserPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const useDirect = !!videoUrl;
  const hasSeparateAudio = useDirect && !!audioUrl && audioUrl !== videoUrl;

  useEffect(() => {
    userPausedRef.current = userPaused;
  }, [userPaused]);

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
      setUserPaused(false);
      userPausedRef.current = false;
      setProgress(0);
      setDuration(0);
      teardown();
      return teardown;
    }

    if (useDirect && videoUrl) {
      setUserPaused(false);
      userPausedRef.current = false;
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
        if (userPausedRef.current) return;
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
      setUserPaused(false);
      userPausedRef.current = false;
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
    if (!video) return;

    const syncProgress = () => {
      setProgress(video.currentTime || 0);
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };

    video.addEventListener("timeupdate", syncProgress);
    video.addEventListener("durationchange", syncProgress);
    video.addEventListener("loadedmetadata", syncProgress);
    return () => {
      video.removeEventListener("timeupdate", syncProgress);
      video.removeEventListener("durationchange", syncProgress);
      video.removeEventListener("loadedmetadata", syncProgress);
    };
  }, [dashUrl, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (hasSeparateAudio && audio) {
      if (video) video.muted = true;
      audio.muted = muted;
      if (!muted && active && !userPausedRef.current) void audio.play().catch(() => {});
    } else if (video) {
      video.muted = muted;
      if (!muted && active && !userPausedRef.current) void video.play().catch(() => {});
    }
  }, [active, hasSeparateAudio, muted]);

  const togglePlayback = useCallback(() => {
    if (!active) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    if (video.paused) {
      userPausedRef.current = false;
      setUserPaused(false);
      if (audio && hasSeparateAudio) {
        audio.currentTime = video.currentTime;
        void audio.play().catch(() => {});
      }
      void video.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      setUserPaused(true);
      video.pause();
      if (audio && hasSeparateAudio) audio.pause();
    }
  }, [active, hasSeparateAudio]);

  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video || duration <= 0) return;
      const nextTime = Math.min(duration, Math.max(0, seconds));
      video.currentTime = nextTime;
      if (audio && hasSeparateAudio) {
        audio.currentTime = nextTime;
        if (!video.paused && !userPausedRef.current) void audio.play().catch(() => {});
      }
      setProgress(nextTime);
    },
    [duration, hasSeparateAudio],
  );

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        poster={poster}
        className={`h-full w-full cursor-pointer bg-black ${fit === "cover" ? "object-cover" : "object-contain"}`}
        playsInline
        onClick={togglePlayback}
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
      {userPaused && (
        <button
          type="button"
          aria-label="Play"
          onClick={togglePlayback}
          className="absolute inset-0 grid place-items-center bg-black/10 text-white"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/55 shadow-xl backdrop-blur-md">
            <Play className="ml-1 h-8 w-8" fill="currentColor" />
          </span>
        </button>
      )}
      {active && duration > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2 pt-6">
          <MediaScrubber
            progress={progress}
            duration={duration}
            onSeek={seekTo}
            variant="edge"
            ariaLabel="Seek Short"
          />
        </div>
      )}
      <audio ref={audioRef} preload="auto" />
    </div>
  );
}
