import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as dashjs from "dashjs";
import {
  AudioLines,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Loader2,
  Maximize,
  Minimize,
  Monitor,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  Tv,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayerStore, type PlaybackRate } from "../../store/usePlayerStore";
import type { AudioTrack, CaptionTrack, StreamVariant } from "../../types/video";

type PlayerProps = {
  src?: string | null;
  dashManifestUrl?: string | null;
  title?: string;
  poster?: string | null;
  isLoading?: boolean;
  error?: string | null;
  qualities?: StreamVariant[];
  captions?: CaptionTrack[];
  audioTracks?: AudioTrack[];
  selectedQualityId?: string | null;
  resumeTime?: number;
  onSelectQuality?: (variant: StreamVariant) => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onRetry?: () => void;
  className?: string;
};

type SettingsPane = "root" | "speed" | "quality" | "captions" | "audio" | "sleep";

const speedOptions: PlaybackRate[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const sleepOptions = [
  { label: "Off", minutes: 0 },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hour", minutes: 60 },
];

type CaptionCue = {
  start: number;
  end: number;
  text: string;
};

type DashBitrateInfo = {
  qualityIndex: number;
  height?: number;
  bitrate?: number;
};

type DashRepresentationInfo = {
  id: string;
  absoluteIndex?: number;
  bandwidth?: number;
  codecs?: string | null;
  frameRate?: number;
  height?: number;
  mimeType?: string | null;
  width?: number;
};

type DashPlayerController = {
  initialize: (element: HTMLMediaElement, source: string, autoPlay: boolean) => void;
  destroy: () => void;
  off: (type: string, listener: (event: unknown) => void, scope?: object) => void;
  on: (type: string, listener: (event: unknown) => void, scope?: object) => void;
  updateSettings: (settings: unknown) => void;
  getBitrateInfoListFor: (type: string) => DashBitrateInfo[];
  getRepresentationsByType: (type: string) => DashRepresentationInfo[];
  setRepresentationForTypeById: (type: string, id: string, forceReplace?: boolean) => void;
  extend?: (parentNameString: string, childInstance: () => unknown, override: boolean) => void;
};

type QualitySwitchSnapshot = {
  appliedAt: number;
  corrected: boolean;
  fromTime: number;
  targetQualityId: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function extractCodecMimeType(mimeType?: string | null) {
  if (!mimeType) return null;
  const [baseType, ...rest] = mimeType.split(";");
  const codecMatch = rest.join(";").match(/codecs\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if (!baseType) return null;
  const trimmedBaseType = baseType.trim();
  const codecsValue = codecMatch?.[1] || codecMatch?.[2];
  return codecsValue ? `${trimmedBaseType}; codecs="${codecsValue}"` : trimmedBaseType;
}

function isVariantSupported(mimeType?: string | null) {
  const codecMimeType = extractCodecMimeType(mimeType);
  if (!codecMimeType) return true;
  if (typeof MediaSource !== "undefined" && typeof MediaSource.isTypeSupported === "function") {
    return MediaSource.isTypeSupported(codecMimeType);
  }
  const probe = document.createElement("video");
  return probe.canPlayType(codecMimeType) !== "";
}

function formatPlayerLogPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function parseVttTimestamp(value: string) {
  const parts = value.trim().split(":");
  const secondsPart = parts.pop() || "0";
  const seconds = Number(secondsPart.replace(",", "."));
  const minutes = Number(parts.pop() || 0);
  const hours = Number(parts.pop() || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
}

function parseVttCues(vtt: string): CaptionCue[] {
  return vtt
    .replace(/\r/g, "")
    .split("\n\n")
    .flatMap((block) => {
      const lines = block.split("\n").filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return [];

      const timingLine = lines[timingIndex];
      if (!timingLine) return [];
      const [startRaw, endRaw] = timingLine.split("-->");
      if (!startRaw || !endRaw) return [];

      const end = endRaw.trim().split(/\s+/)[0];
      if (!end) return [];
      const text = lines
        .slice(timingIndex + 1)
        .join("\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      if (!text) return [];
      return [{
        start: parseVttTimestamp(startRaw),
        end: parseVttTimestamp(end),
        text,
      }];
    });
}

function parseTimedTextCues(text: string): CaptionCue[] {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  return Array.from(doc.querySelectorAll("text")).flatMap((node) => {
    const start = Number(node.getAttribute("start"));
    const duration = Number(node.getAttribute("dur") || 0);
    const content = (node.textContent || "").trim();
    if (!Number.isFinite(start) || !content) return [];
    return [{ start, end: start + duration, text: content }];
  });
}

function parseCaptionCues(text: string): CaptionCue[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("WEBVTT") || trimmed.includes("-->")) {
    return parseVttCues(trimmed);
  }
  return parseTimedTextCues(trimmed);
}

export const Player: React.FC<PlayerProps> = ({
  src,
  dashManifestUrl,
  title,
  poster,
  isLoading = false,
  error,
  qualities = [],
  captions = [],
  audioTracks = [],
  selectedQualityId,
  resumeTime = 0,
  onSelectQuality,
  onEnded,
  onTimeUpdate,
  onRetry,
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skippedSegmentsRef = useRef<Set<string>>(new Set());
  const lastSrcRef = useRef<string | null | undefined>(src);
  const desiredPlayingRef = useRef(false);
  const pendingResumeTimeRef = useRef(0);
  const sourceSwitchingRef = useRef(false);
  const dashPlayerRef = useRef<DashPlayerController | null>(null);
  const qualitySwitchSnapshotRef = useRef<QualitySwitchSnapshot | null>(null);
  const qualitySwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaBufferingRef = useRef(false);

  const {
    isPlaying,
    setIsPlaying,
    volume,
    setVolume,
    playbackRate,
    setPlaybackRate,
    currentTime,
    duration,
    setCurrentTime,
    setDuration,
    playNext,
    playPrevious,
    isTheaterMode,
    setIsTheaterMode,
    sponsorBlockSegments,
  } = usePlayerStore();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<SettingsPane>("root");
  const [muted, setMuted] = useState(false);
  const [ambientMode, setAmbientMode] = useState(true);
  const [sponsorBlockEnabled, setSponsorBlockEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPct, setHoverPct] = useState(0);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string>("off");
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<string | null>(null);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [isSourceSwitching, setIsSourceSwitching] = useState(false);

  const isDashPlayback = !!dashManifestUrl;
  const dashProxyPrefix = useMemo(() => {
    if (!dashManifestUrl) return null;
    const marker = "?url=";
    const markerIndex = dashManifestUrl.indexOf(marker);
    if (markerIndex < 0) return null;
    return dashManifestUrl.slice(0, markerIndex + marker.length);
  }, [dashManifestUrl]);
  const supportedQualities = useMemo(() => {
    if (!isDashPlayback) return qualities;
    return qualities.filter((quality) => isVariantSupported(quality.mimeType));
  }, [isDashPlayback, qualities]);
  const selectedQuality = useMemo(() => {
    return supportedQualities.find((quality) => quality.id === selectedQualityId)
      || supportedQualities.find((quality) => quality.isDefault)
      || supportedQualities[0]
      || null;
  }, [selectedQualityId, supportedQualities]);
  const selectedCaption = captions.find((caption) => caption.id === selectedCaptionId) || null;
  const selectedAudioTrack = audioTracks.find((track) => track.id === selectedAudioTrackId)
    || audioTracks.find((track) => track.isDefault)
    || audioTracks[0]
    || null;
  const usesExternalAudio = !isDashPlayback && !!selectedQuality && !selectedQuality.hasAudio && !!selectedAudioTrack?.localUrl;
  const activeCaption = selectedCaptionId === "off"
    ? null
    : captionCues.find((cue) => currentTime >= cue.start && currentTime <= cue.end);

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const shouldShowControls = controlsVisible || !isPlaying || settingsOpen || isScrubbing;
  const showAmbient = ambientMode && !!poster && !error;
  const effectivePoster = hasStartedPlayback || resumeTime > 0 || isSourceSwitching ? undefined : poster || undefined;

  const logPlayerEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    const entry = formatPlayerLogPayload({
      currentTime: videoRef.current?.currentTime,
      duration: videoRef.current?.duration,
      isDashPlayback,
      selectedQualityId,
      ...payload,
    });
    console.log(`[Player] ${event}`, entry);
    const globalWindow = window as Window & {
      __FLOW_PLAYER_LOGS__?: Array<{ event: string; payload: Record<string, unknown>; at: string }>;
    };
    globalWindow.__FLOW_PLAYER_LOGS__ = globalWindow.__FLOW_PLAYER_LOGS__ || [];
    globalWindow.__FLOW_PLAYER_LOGS__.push({
      event,
      payload: entry,
      at: new Date().toISOString(),
    });
    if (globalWindow.__FLOW_PLAYER_LOGS__.length > 200) {
      globalWindow.__FLOW_PLAYER_LOGS__.shift();
    }
  }, [isDashPlayback, selectedQualityId]);
  const logPlayerEventRef = useRef(logPlayerEvent);

  const applyDashQualitySelection = useCallback(() => {
    const player = dashPlayerRef.current;
    const video = videoRef.current;
    if (!player || !video || !selectedQuality) return;

    const representations = player.getRepresentationsByType("video") || [];
    const targetRepresentation = representations.find((representation) => representation.id === selectedQuality.id)
      || representations
        .filter((representation) => typeof representation.height === "number")
        .sort((left, right) => Math.abs((left.height || 0) - (selectedQuality.height || 0)) - Math.abs((right.height || 0) - (selectedQuality.height || 0)))[0];

    if (!targetRepresentation) {
      logPlayerEvent("dash-quality-target-missing", {
        requestedQualityId: selectedQuality.id,
        requestedHeight: selectedQuality.height,
        availableRepresentations: representations.map((representation) => ({
          id: representation.id,
          height: representation.height,
          codecs: representation.codecs,
          mimeType: representation.mimeType,
        })),
      });
      return;
    }

    qualitySwitchSnapshotRef.current = {
      appliedAt: performance.now(),
      corrected: false,
      fromTime: video.currentTime,
      targetQualityId: targetRepresentation.id,
    };
    if (qualitySwitchTimeoutRef.current) {
      clearTimeout(qualitySwitchTimeoutRef.current);
    }
    qualitySwitchTimeoutRef.current = setTimeout(() => {
      if (qualitySwitchSnapshotRef.current) {
        logPlayerEvent("dash-quality-switch-timeout", {
          snapshot: qualitySwitchSnapshotRef.current,
        });
        qualitySwitchSnapshotRef.current = null;
      }
    }, 8000);

    player.updateSettings({
      streaming: {
        abr: {
          autoSwitchBitrate: {
            video: false,
            audio: true,
          },
        },
      },
    });
    player.setRepresentationForTypeById("video", targetRepresentation.id, false);
    logPlayerEvent("dash-quality-switch-requested", {
      requestedQualityId: selectedQuality.id,
      selectedMimeType: selectedQuality.mimeType,
      targetRepresentationId: targetRepresentation.id,
      targetHeight: targetRepresentation.height,
      targetCodecs: targetRepresentation.codecs,
      targetMimeType: targetRepresentation.mimeType,
      switchTime: video.currentTime,
    });
  }, [logPlayerEvent, selectedQuality]);
  const applyDashQualitySelectionRef = useRef(applyDashQualitySelection);

  useEffect(() => {
    applyDashQualitySelectionRef.current = applyDashQualitySelection;
  }, [applyDashQualitySelection]);

  useEffect(() => {
    logPlayerEventRef.current = logPlayerEvent;
  }, [logPlayerEvent]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 2400);
  }, []);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    const nextTime = Math.min(Math.max(time, 0), video.duration || duration || 0);
    video.currentTime = nextTime;
    if (audio) {
      audio.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  }, [duration, setCurrentTime]);

  const setPlaybackDesired = useCallback((shouldPlay: boolean) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    desiredPlayingRef.current = shouldPlay;
    setIsPlaying(shouldPlay);

    if (!video) return;
    if (shouldPlay && (isDashPlayback || src) && !error) {
      void video.play().catch(() => {
        desiredPlayingRef.current = false;
        setIsPlaying(false);
      });
      if (usesExternalAudio && audio) {
        void audio.play().catch(() => {});
      }
    } else {
      video.pause();
      audio?.pause();
    }
  }, [error, isDashPlayback, setIsPlaying, src, usesExternalAudio]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    setPlaybackDesired(video ? video.paused : !isPlaying);
    revealControls();
  }, [isPlaying, revealControls, setPlaybackDesired]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      void container.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (pipError) {
      console.warn("Picture-in-picture failed", pipError);
    }
  }, []);

  const handlePointerSeek = useCallback((clientX: number) => {
    const track = containerRef.current?.querySelector("[data-progress-track]");
    if (!(track instanceof HTMLElement) || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  }, [duration, seekTo]);

  const updateBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0 || video.buffered.length === 0) {
      setBufferedPct(0);
      return;
    }

    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    setBufferedPct(Math.min(100, (bufferedEnd / video.duration) * 100));
  }, []);

  const syncExternalAudio = useCallback((hard = false) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !usesExternalAudio) return;

    if (mediaBufferingRef.current || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      return;
    }

    const targetTime = video.currentTime;
    const drift = audio.currentTime - targetTime;

    if (hard || Math.abs(drift) > 0.65) {
      audio.currentTime = targetTime;
      audio.playbackRate = playbackRate;
      return;
    }

    if (Math.abs(drift) > 0.08 && !video.paused && !video.ended) {
      audio.playbackRate = clamp(playbackRate - drift * 0.12, playbackRate - 0.05, playbackRate + 0.05);
    } else {
      audio.playbackRate = playbackRate;
    }
  }, [playbackRate, usesExternalAudio]);

  useEffect(() => {
    if (!usesExternalAudio || isSourceSwitching) return;
    const interval = window.setInterval(() => syncExternalAudio(false), 250);
    return () => window.clearInterval(interval);
  }, [isSourceSwitching, syncExternalAudio, usesExternalAudio]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!isDashPlayback || !dashManifestUrl) {
      dashPlayerRef.current?.destroy();
      dashPlayerRef.current = null;
      return;
    }

    const player = dashjs.MediaPlayer().create() as unknown as DashPlayerController;
    if (dashProxyPrefix) {
      player.extend?.("RequestModifier", () => ({
        modifyRequestURL: (url: string) => {
          if (url.startsWith("http://127.0.0.1:") || url.startsWith("blob:")) {
            return url;
          }
          return `${dashProxyPrefix}${encodeURIComponent(url)}`;
        },
        modifyRequestHeader: (xhr: XMLHttpRequest) => xhr,
      }), true);
    }
    player.updateSettings({
      streaming: {
        abr: {
          autoSwitchBitrate: {
            video: false,
            audio: true,
          },
        },
        buffer: {
          fastSwitchEnabled: true,
        },
      },
    });
    logPlayerEventRef.current("dash-initialize", {
      dashManifestUrl,
      usesProxyModifier: !!dashProxyPrefix,
    });

    const dashEvents = dashjs.MediaPlayer.events;
    const onPlaybackWaiting = () => {
      logPlayerEventRef.current("dash-playback-waiting", {
        readyState: video.readyState,
        networkState: video.networkState,
      });
    };
    const onBufferStateChanged = (event: unknown) => {
      logPlayerEventRef.current("dash-buffer-state", event as Record<string, unknown>);
    };
    const onQualityChangeRequested = (event: unknown) => {
      logPlayerEventRef.current("dash-quality-change-requested", event as Record<string, unknown>);
    };
    const onQualityChangeRendered = (event: unknown) => {
      const snapshot = qualitySwitchSnapshotRef.current;
      const qualityEvent = (event || {}) as Record<string, unknown>;
      logPlayerEventRef.current("dash-quality-change-rendered", {
        ...qualityEvent,
        snapshotFromTime: snapshot?.fromTime,
        snapshotAgeMs: snapshot ? Math.round(performance.now() - snapshot.appliedAt) : undefined,
      });
      if (snapshot && video.currentTime < Math.max(1, snapshot.fromTime - 2)) {
        const rewindTime = snapshot.fromTime;
        video.currentTime = rewindTime;
        snapshot.corrected = true;
        logPlayerEventRef.current("dash-quality-rewind-corrected", {
          rewindTime,
        });
      }
      if (qualitySwitchTimeoutRef.current) {
        clearTimeout(qualitySwitchTimeoutRef.current);
        qualitySwitchTimeoutRef.current = null;
      }
      qualitySwitchSnapshotRef.current = null;
    };
    const onPlaybackError = (event: unknown) => {
      logPlayerEventRef.current("dash-playback-error", { event });
    };
    const onDashError = (event: unknown) => {
      logPlayerEventRef.current("dash-error", { event });
    };
    const onCapabilitiesDrop = (event: unknown) => {
      logPlayerEventRef.current("dash-capabilities-dropped", { event });
    };
    const onStreamInitialized = () => {
      logPlayerEventRef.current("dash-stream-initialized", {
        representations: player.getRepresentationsByType("video").map((representation) => ({
          id: representation.id,
          height: representation.height,
          width: representation.width,
          codecs: representation.codecs,
          mimeType: representation.mimeType,
          bandwidth: representation.bandwidth,
        })),
      });
      applyDashQualitySelectionRef.current();
    };

    player.on(dashEvents.PLAYBACK_WAITING, onPlaybackWaiting);
    player.on(dashEvents.BUFFER_LEVEL_STATE_CHANGED, onBufferStateChanged);
    player.on(dashEvents.QUALITY_CHANGE_REQUESTED, onQualityChangeRequested);
    player.on(dashEvents.QUALITY_CHANGE_RENDERED, onQualityChangeRendered);
    player.on(dashEvents.PLAYBACK_ERROR, onPlaybackError);
    player.on(dashEvents.ERROR, onDashError);
    player.on(dashEvents.ADAPTATION_SET_REMOVED_NO_CAPABILITIES, onCapabilitiesDrop);
    player.on(dashEvents.STREAM_INITIALIZED, onStreamInitialized);

    player.initialize(video, dashManifestUrl, desiredPlayingRef.current || isPlaying);
    dashPlayerRef.current = player;

    return () => {
      player.off(dashEvents.PLAYBACK_WAITING, onPlaybackWaiting);
      player.off(dashEvents.BUFFER_LEVEL_STATE_CHANGED, onBufferStateChanged);
      player.off(dashEvents.QUALITY_CHANGE_REQUESTED, onQualityChangeRequested);
      player.off(dashEvents.QUALITY_CHANGE_RENDERED, onQualityChangeRendered);
      player.off(dashEvents.PLAYBACK_ERROR, onPlaybackError);
      player.off(dashEvents.ERROR, onDashError);
      player.off(dashEvents.ADAPTATION_SET_REMOVED_NO_CAPABILITIES, onCapabilitiesDrop);
      player.off(dashEvents.STREAM_INITIALIZED, onStreamInitialized);
      if (qualitySwitchTimeoutRef.current) {
        clearTimeout(qualitySwitchTimeoutRef.current);
        qualitySwitchTimeoutRef.current = null;
      }
      player.destroy();
      if (dashPlayerRef.current === player) {
        dashPlayerRef.current = null;
      }
    };
  }, [dashManifestUrl, dashProxyPrefix, isDashPlayback]);

  useEffect(() => {
    if (!isDashPlayback) return;
    applyDashQualitySelection();
  }, [applyDashQualitySelection, isDashPlayback, selectedQualityId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onVideoWaiting = () => {
      mediaBufferingRef.current = true;
      if (usesExternalAudio) {
        audioRef.current?.pause();
      }
      logPlayerEvent("html-video-waiting", {
        readyState: video.readyState,
        networkState: video.networkState,
        audioTime: audioRef.current?.currentTime,
      });
    };
    const onVideoStalled = () => {
      mediaBufferingRef.current = true;
      if (usesExternalAudio) {
        audioRef.current?.pause();
      }
      logPlayerEvent("html-video-stalled", {
        readyState: video.readyState,
        networkState: video.networkState,
        audioTime: audioRef.current?.currentTime,
      });
    };
    const resumeExternalAudio = (eventName: string) => {
      mediaBufferingRef.current = false;
      const audio = audioRef.current;
      if (!usesExternalAudio || !audio) {
        logPlayerEvent(eventName, {
          readyState: video.readyState,
          networkState: video.networkState,
        });
        return;
      }

      try {
        audio.currentTime = video.currentTime;
      } catch {
        // Ignore; syncExternalAudio will retry on the next timer tick.
      }

      audio.playbackRate = playbackRate;
      if (desiredPlayingRef.current && !video.paused && !video.ended) {
        void audio.play().catch(() => {});
      }

      logPlayerEvent(eventName, {
        readyState: video.readyState,
        networkState: video.networkState,
        audioTime: audio.currentTime,
      });
    };
    const onVideoCanPlay = () => resumeExternalAudio("html-video-canplay");
    const onVideoPlaying = () => resumeExternalAudio("html-video-playing");
    const onVideoSeeking = () => {
      const snapshot = qualitySwitchSnapshotRef.current;
      logPlayerEvent("html-video-seeking", {
        snapshotFromTime: snapshot?.fromTime,
        snapshotTargetQualityId: snapshot?.targetQualityId,
      });
      if (
        snapshot
        && !snapshot.corrected
        && performance.now() - snapshot.appliedAt < 10_000
        && video.currentTime < Math.max(1, snapshot.fromTime - 2)
      ) {
        const rewindTime = snapshot.fromTime;
        snapshot.corrected = true;
        requestAnimationFrame(() => {
          video.currentTime = rewindTime;
          logPlayerEvent("html-video-rewind-corrected", { rewindTime });
        });
      }
    };
    const onVideoError = () => {
      logPlayerEvent("html-video-error", {
        mediaError: video.error ? {
          code: video.error.code,
          message: video.error.message,
        } : null,
      });
    };

    video.addEventListener("waiting", onVideoWaiting);
    video.addEventListener("stalled", onVideoStalled);
    video.addEventListener("canplay", onVideoCanPlay);
    video.addEventListener("playing", onVideoPlaying);
    video.addEventListener("seeking", onVideoSeeking);
    video.addEventListener("error", onVideoError);

    return () => {
      video.removeEventListener("waiting", onVideoWaiting);
      video.removeEventListener("stalled", onVideoStalled);
      video.removeEventListener("canplay", onVideoCanPlay);
      video.removeEventListener("playing", onVideoPlaying);
      video.removeEventListener("seeking", onVideoSeeking);
      video.removeEventListener("error", onVideoError);
    };
  }, [logPlayerEvent, playbackRate, usesExternalAudio]);

  useEffect(() => {
    if (lastSrcRef.current === src) return;

    const video = videoRef.current;
    const audio = audioRef.current;
    const targetTime = Math.max(0, resumeTime || currentTime || 0);

    pendingResumeTimeRef.current = targetTime;
    skippedSegmentsRef.current.clear();
    lastSrcRef.current = src;

    if (targetTime > 0) {
      sourceSwitchingRef.current = true;
      setIsSourceSwitching(true);
      video?.pause();
      audio?.pause();
    } else {
      sourceSwitchingRef.current = false;
      setHasStartedPlayback(false);
      setIsSourceSwitching(false);
    }
  }, [currentTime, resumeTime, src]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    if (isSourceSwitching || sourceSwitchingRef.current) return;

    desiredPlayingRef.current = isPlaying;
    if (isPlaying && (isDashPlayback || src) && !error) {
      void video.play().catch(() => {
        desiredPlayingRef.current = false;
        setIsPlaying(false);
      });
      if (usesExternalAudio && audio) {
        void audio.play().catch(() => {});
      }
    } else {
      video.pause();
      audio?.pause();
    }
  }, [error, isDashPlayback, isPlaying, isSourceSwitching, setIsPlaying, src, usesExternalAudio]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!audio || !video || !usesExternalAudio || isSourceSwitching) return;

    audio.currentTime = video.currentTime;
    audio.playbackRate = playbackRate;
    audio.preservesPitch = true;
    audio.volume = muted ? 0 : volume;
    audio.muted = muted || volume === 0;

    if (isPlaying && !error) {
      void audio.play().catch(() => {});
    }
  }, [
    error,
    isPlaying,
    isSourceSwitching,
    muted,
    playbackRate,
    selectedAudioTrack?.localUrl,
    src,
    usesExternalAudio,
    volume,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    video.volume = usesExternalAudio ? 0 : (muted ? 0 : volume);
    video.muted = usesExternalAudio || muted || volume === 0;
    if (audio) {
      audio.volume = muted ? 0 : volume;
      audio.muted = muted || volume === 0;
    }
  }, [muted, usesExternalAudio, volume]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.playbackRate = playbackRate;
      video.preservesPitch = true;
    }
    if (audio) {
      audio.playbackRate = playbackRate;
      audio.preservesPitch = true;
    }
  }, [playbackRate]);

  useEffect(() => {
    const caption = captions.find((item) => item.id === selectedCaptionId);
    if (!caption) {
      setCaptionCues([]);
      return;
    }

    let cancelled = false;
    fetch(caption.url)
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled) setCaptionCues(parseCaptionCues(text));
      })
      .catch(() => {
        if (!cancelled) setCaptionCues([]);
      });

    return () => {
      cancelled = true;
    };
  }, [captions, selectedCaptionId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    for (let index = 0; index < video.textTracks.length; index += 1) {
      const track = video.textTracks[index];
      if (!track) continue;
      track.mode = "disabled";
    }
  }, [captions, selectedCaptionId]);

  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnter = () => setIsPip(true);
    const onLeave = () => setIsPip(false);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  useEffect(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleepMinutes > 0) {
      sleepTimerRef.current = setTimeout(() => setPlaybackDesired(false), sleepMinutes * 60_000);
    }
    return () => {
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [setPlaybackDesired, sleepMinutes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;
        case "j":
          seekTo(currentTime - 10);
          break;
        case "l":
          seekTo(currentTime + 10);
          break;
        case "arrowleft":
          seekTo(currentTime - 5);
          break;
        case "arrowright":
          seekTo(currentTime + 5);
          break;
        case "arrowup":
          event.preventDefault();
          setVolume(volume + 0.05);
          setMuted(false);
          break;
        case "arrowdown":
          event.preventDefault();
          setVolume(volume - 0.05);
          break;
        case "m":
          setMuted((value) => !value);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "t":
          setIsTheaterMode(!isTheaterMode);
          break;
      }
      revealControls();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentTime,
    isTheaterMode,
    revealControls,
    seekTo,
    setIsTheaterMode,
    setMuted,
    setVolume,
    toggleFullscreen,
    togglePlay,
    volume,
  ]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    if (isDashPlayback) {
      applyDashQualitySelection();
    }
    const nextDuration = video.duration || duration || 0;
    setDuration(nextDuration);
    const pendingResumeTime = Math.max(resumeTime, pendingResumeTimeRef.current);
    if (pendingResumeTime > 0 && Math.abs(video.currentTime - pendingResumeTime) > 0.25) {
      const restoredTime = Math.min(pendingResumeTime, Math.max(0, nextDuration - 0.25));
      video.currentTime = restoredTime;
      if (audio) {
        try {
          audio.currentTime = restoredTime;
        } catch {
          // Some WebView media backends reject audio seeks until metadata arrives.
        }
      }
    }
    if (pendingResumeTime > 0) {
      setHasStartedPlayback(true);
      sourceSwitchingRef.current = false;
      setIsSourceSwitching(false);
      requestAnimationFrame(() => {
        syncExternalAudio(true);
        if (desiredPlayingRef.current || isPlaying) {
          void videoRef.current?.play().catch(() => {});
          if (usesExternalAudio) void audioRef.current?.play().catch(() => {});
        }
      });
    }
    updateBuffered();
  };

  const handleAudioLoadedMetadata = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    try {
      audio.currentTime = video.currentTime;
    } catch {
      // Ignore; the next sync tick will retry once the backend allows seeking.
    }

    if ((desiredPlayingRef.current || isPlaying) && usesExternalAudio && !isSourceSwitching) {
      void audio.play().catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    const nextTime = video.currentTime;
    const nextDuration = video.duration || duration || 0;

    if (sponsorBlockEnabled) {
      for (const segment of sponsorBlockSegments) {
        const [start, end] = segment.segment;
        const shouldSkip = ["sponsor", "intro", "outro", "selfpromo"].includes(segment.category);
        if (shouldSkip && nextTime >= start && nextTime < end && !skippedSegmentsRef.current.has(segment.UUID)) {
          skippedSegmentsRef.current.add(segment.UUID);
          video.currentTime = end;
          setCurrentTime(end);
          return;
        }
      }
    }

    setCurrentTime(nextTime);
    setDuration(nextDuration);
    onTimeUpdate?.(nextTime, nextDuration);
    if (usesExternalAudio && audio) syncExternalAudio(false);
    updateBuffered();
  };

  const handleProgressMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoverPct(ratio * 100);
    setHoverTime(ratio * (duration || 0));
  };

  const renderSettingRow = (
    label: string,
    value: React.ReactNode,
    icon: React.ReactNode,
    onClick: () => void,
  ) => (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-zinc-100 transition-colors hover:bg-white/10"
    >
      <span className="grid h-7 w-7 place-items-center text-zinc-300">{icon}</span>
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      <span className="max-w-[46%] truncate text-right text-zinc-300">{value}</span>
      <ChevronRight size={16} className="text-zinc-400" />
    </button>
  );

  return (
    <div
      ref={containerRef}
      className={cx(
        "group/player relative h-full w-full overflow-hidden bg-black text-white shadow-2xl outline-none",
        isFullscreen ? "rounded-none" : "rounded-xl",
        className,
      )}
      tabIndex={0}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        setControlsVisible(false);
        setHoverTime(null);
      }}
    >
      {showAmbient && (
        <img
          src={poster || undefined}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-[-8%] h-[116%] w-[116%] scale-110 object-cover opacity-35 blur-3xl saturate-150"
        />
      )}

      <video
        ref={videoRef}
        src={isDashPlayback ? undefined : src || undefined}
        poster={effectivePoster}
        playsInline
        preload="auto"
        onClick={togglePlay}
        onDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left + rect.width * 0.35) seekTo(currentTime - 10);
          else if (event.clientX > rect.left + rect.width * 0.65) seekTo(currentTime + 10);
          else toggleFullscreen();
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={updateBuffered}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => {
          desiredPlayingRef.current = true;
          setHasStartedPlayback(true);
          setIsPlaying(true);
        }}
        onPause={() => {
          const video = videoRef.current;
          if (isDashPlayback && qualitySwitchSnapshotRef.current) {
            logPlayerEvent("video-pause-during-quality-switch", {
              snapshot: qualitySwitchSnapshotRef.current,
              pausedAt: video?.currentTime,
            });
            return;
          }
          if (desiredPlayingRef.current && src && !error && !video?.ended && !sourceSwitchingRef.current) {
            setTimeout(() => {
              if (desiredPlayingRef.current) {
                void videoRef.current?.play().catch(() => {});
                if (usesExternalAudio) void audioRef.current?.play().catch(() => {});
              }
            }, 0);
            return;
          }
          setIsPlaying(false);
        }}
        onEnded={() => {
          onEnded?.();
          if (!onEnded) playNext();
        }}
        className="relative z-10 h-full w-full object-contain"
      >
        {captions.map((caption) => (
          <track
            key={caption.id}
            kind="subtitles"
            src={caption.url}
            srcLang={caption.languageCode}
            label={`${caption.label}${caption.isAutoGenerated ? " (auto)" : ""}`}
            default={caption.id === selectedCaptionId}
          />
        ))}
      </video>

      {usesExternalAudio && selectedAudioTrack?.localUrl && (
        <audio
          ref={audioRef}
          src={selectedAudioTrack.localUrl}
          preload="auto"
          onLoadedMetadata={handleAudioLoadedMetadata}
          className="hidden"
        />
      )}

      {activeCaption && (
        <div className={cx(
          "pointer-events-none absolute inset-x-4 z-30 flex justify-center px-4 text-center transition-[bottom] duration-150",
          shouldShowControls ? "bottom-24" : "bottom-8"
        )}>
          <span className="max-w-4xl rounded bg-black/75 px-3 py-1.5 text-base font-semibold leading-snug text-white shadow-2xl sm:text-lg">
            {activeCaption.text}
          </span>
        </div>
      )}

      {(isLoading || error) && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/60 px-6 text-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-sm font-semibold text-zinc-200">
              <Loader2 className="animate-spin text-red-500" size={34} />
              Resolving stream
            </div>
          ) : (
            <div className="max-w-md space-y-4">
              <div className="text-base font-bold">Playback unavailable</div>
              <p className="text-sm text-zinc-300">{error}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-black transition-transform active:scale-95"
                >
                  <RotateCcw size={16} />
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div
        className={cx(
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/50 to-transparent px-3 pb-3 pt-24 transition-opacity duration-200 sm:px-5 sm:pb-4",
          shouldShowControls ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto" onClick={(event) => event.stopPropagation()}>
          {title && (
            <div className="mb-2 hidden max-w-[70%] truncate text-sm font-bold text-white/95 sm:block">
              {title}
            </div>
          )}

          <div
            data-progress-track
            className="relative h-5 cursor-pointer py-2"
            onMouseMove={handleProgressMove}
            onMouseLeave={() => setHoverTime(null)}
            onMouseDown={(event) => {
              setIsScrubbing(true);
              handlePointerSeek(event.clientX);
            }}
            onMouseUp={() => setIsScrubbing(false)}
            onClick={(event) => handlePointerSeek(event.clientX)}
          >
            <div className="relative h-1 overflow-hidden rounded-full bg-white/25 transition-all group-hover/player:h-1.5">
              <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${bufferedPct}%` }} />
              {sponsorBlockSegments.map((segment) => {
                if (!duration) return null;
                const start = (segment.segment[0] / duration) * 100;
                const width = ((segment.segment[1] - segment.segment[0]) / duration) * 100;
                return (
                  <div
                    key={segment.UUID}
                    className="absolute inset-y-0 bg-emerald-400"
                    style={{ left: `${start}%`, width: `${width}%` }}
                  />
                );
              })}
              <div className="absolute inset-y-0 left-0 bg-red-600" style={{ width: `${progressPct}%` }} />
            </div>
            <div
              className="absolute top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-red-600 opacity-0 shadow-lg shadow-black/40 transition-opacity group-hover/player:opacity-100"
              style={{ left: `${progressPct}%` }}
            />
            {hoverTime !== null && duration > 0 && (
              <div
                className="absolute bottom-6 -translate-x-1/2 rounded bg-black/90 px-2 py-1 text-xs font-bold"
                style={{ left: `${hoverPct}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              <button type="button" title="Previous" onClick={playPrevious} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10">
                <SkipBack size={20} fill="currentColor" />
              </button>
              <button type="button" title={isPlaying ? "Pause" : "Play"} onClick={togglePlay} className="grid h-10 w-10 place-items-center rounded-full bg-white text-black transition-transform active:scale-95">
                {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
              </button>
              <button type="button" title="Next" onClick={playNext} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10">
                <SkipForward size={20} fill="currentColor" />
              </button>

              <div className="group/volume hidden items-center gap-2 sm:flex">
                <button type="button" title="Mute" onClick={() => setMuted((value) => !value)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10">
                  {muted || volume === 0 ? <VolumeX size={21} /> : volume < 0.55 ? <Volume1 size={21} /> : <Volume2 size={21} />}
                </button>
                <input
                  aria-label="Volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setVolume(value);
                    setMuted(value === 0);
                  }}
                  className="h-1 w-0 accent-white opacity-0 transition-all group-hover/volume:w-20 group-hover/volume:opacity-100"
                />
              </div>

              <div className="ml-1 whitespace-nowrap text-xs font-semibold text-zinc-100 sm:text-sm">
                {formatTime(currentTime)} <span className="text-zinc-400">/</span> {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {selectedQuality && (
                <button
                  type="button"
                  title="Quality"
                  onClick={() => {
                    setSettingsOpen(true);
                    setSettingsPane("quality");
                  }}
                  className="hidden h-9 items-center rounded-full px-2 text-xs font-bold text-zinc-100 hover:bg-white/10 sm:flex"
                >
                  {selectedQuality.qualityLabel}
                </button>
              )}
              <button
                type="button"
                title="Captions"
                onClick={() => {
                  setSettingsOpen(true);
                  setSettingsPane("captions");
                }}
                className={cx("grid h-9 w-9 place-items-center rounded-full hover:bg-white/10", selectedCaptionId !== "off" && "bg-white/15")}
              >
                <Captions size={20} />
              </button>
              <button
                type="button"
                title="Settings"
                onClick={() => {
                  setSettingsOpen((value) => !value);
                  setSettingsPane("root");
                }}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
              >
                <Settings size={20} className={settingsOpen ? "rotate-90 transition-transform" : "transition-transform"} />
              </button>
              <button type="button" title="Picture in picture" onClick={togglePictureInPicture} className={cx("hidden h-9 w-9 place-items-center rounded-full hover:bg-white/10 sm:grid", isPip && "bg-white/15")}>
                <PictureInPicture2 size={20} />
              </button>
              <button type="button" title="Theater mode" onClick={() => setIsTheaterMode(!isTheaterMode)} className={cx("grid h-9 w-9 place-items-center rounded-full hover:bg-white/10", isTheaterMode && "bg-white/15")}>
                <Tv size={20} />
              </button>
              <button type="button" title="Fullscreen" onClick={toggleFullscreen} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10">
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div className="absolute bottom-20 right-3 z-40 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-white/10 bg-[#181818]/95 p-2 text-white shadow-2xl backdrop-blur-xl sm:right-5">
          {settingsPane !== "root" && (
            <button
              type="button"
              onClick={() => setSettingsPane("root")}
              className="mb-1 flex h-10 w-full items-center gap-2 rounded-md px-2 text-sm font-bold hover:bg-white/10"
            >
              <ChevronLeft size={18} />
              {settingsPane === "speed"
                ? "Playback speed"
                : settingsPane === "quality"
                  ? "Quality"
                  : settingsPane === "captions"
                    ? "Subtitles/CC"
                    : settingsPane === "audio"
                      ? "Audio track"
                      : "Sleep timer"}
            </button>
          )}

          {settingsPane === "root" && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setAmbientMode((value) => !value)}
                className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-white/10"
              >
                <span className="grid h-7 w-7 place-items-center text-zinc-300"><Sparkles size={18} /></span>
                <span className="flex-1 text-left">Ambient mode</span>
                <span className={cx("h-5 w-9 rounded-full p-0.5 transition-colors", ambientMode ? "bg-red-600" : "bg-zinc-600")}>
                  <span className={cx("block h-4 w-4 rounded-full bg-white transition-transform", ambientMode && "translate-x-4")} />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSponsorBlockEnabled((value) => !value)}
                className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-white/10"
              >
                <span className="grid h-7 w-7 place-items-center text-zinc-300"><Sparkles size={18} /></span>
                <span className="flex-1 text-left">SponsorBlock</span>
                <span className={cx("h-5 w-9 rounded-full p-0.5 transition-colors", sponsorBlockEnabled ? "bg-emerald-500" : "bg-zinc-600")}>
                  <span className={cx("block h-4 w-4 rounded-full bg-white transition-transform", sponsorBlockEnabled && "translate-x-4")} />
                </span>
              </button>
              {renderSettingRow("Playback speed", playbackRate === 1 ? "Normal" : `${playbackRate}x`, <Gauge size={18} />, () => setSettingsPane("speed"))}
              {renderSettingRow("Quality", selectedQuality?.qualityLabel || "Auto", <Monitor size={18} />, () => setSettingsPane("quality"))}
              {renderSettingRow("Subtitles/CC", selectedCaption ? selectedCaption.label : "Off", <Captions size={18} />, () => setSettingsPane("captions"))}
              {renderSettingRow("Audio track", selectedAudioTrack?.label || "Original", <AudioLines size={18} />, () => setSettingsPane("audio"))}
              {renderSettingRow("Sleep timer", sleepMinutes ? `${sleepMinutes} min` : "Off", <Pause size={18} />, () => setSettingsPane("sleep"))}
            </div>
          )}

          {settingsPane === "speed" && (
            <div className="space-y-1">
              {speedOptions.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => {
                    setPlaybackRate(speed);
                    setSettingsPane("root");
                  }}
                  className="flex h-10 w-full items-center justify-between rounded-md px-3 text-sm font-medium hover:bg-white/10"
                >
                  <span>{speed === 1 ? "Normal" : `${speed}x`}</span>
                  {playbackRate === speed && <Check size={17} />}
                </button>
              ))}
            </div>
          )}

          {settingsPane === "quality" && (
            <div className="space-y-1">
              {supportedQualities.length === 0 ? (
                <div className="px-3 py-4 text-sm text-zinc-400">Auto</div>
              ) : supportedQualities.map((quality) => (
                <button
                  key={quality.id}
                  type="button"
                  onClick={() => {
                    if (!quality.hasAudio && !audioTracks.some((track) => !!track.localUrl)) return;
                    onSelectQuality?.(quality);
                    setSettingsPane("root");
                    setSettingsOpen(false);
                  }}
                  className={cx(
                    "flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium",
                    quality.hasAudio || audioTracks.some((track) => !!track.localUrl)
                      ? "hover:bg-white/10"
                      : "cursor-not-allowed text-zinc-500"
                  )}
                >
                  <span className="flex flex-col text-left leading-tight">
                    <span>{quality.qualityLabel}</span>
                    {quality.isVideoOnly}
                  </span>
                  {(selectedQualityId === quality.id || (!selectedQualityId && quality.isDefault)) && <Check size={17} />}
                </button>
              ))}
            </div>
          )}

          {settingsPane === "captions" && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedCaptionId("off");
                  setSettingsPane("root");
                }}
                className="flex h-10 w-full items-center justify-between rounded-md px-3 text-sm font-medium hover:bg-white/10"
              >
                <span>Off</span>
                {selectedCaptionId === "off" && <Check size={17} />}
              </button>
              {captions.map((caption) => (
                <button
                  key={caption.id}
                  type="button"
                  onClick={() => {
                    setSelectedCaptionId(caption.id);
                    setSettingsPane("root");
                  }}
                  className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10"
                >
                  <span className="text-left">
                    {caption.label}
                    {caption.isAutoGenerated && <span className="ml-1 text-xs text-zinc-400">auto</span>}
                  </span>
                  {selectedCaptionId === caption.id && <Check size={17} />}
                </button>
              ))}
            </div>
          )}

          {settingsPane === "audio" && (
            <div className="space-y-1">
              {audioTracks.length === 0 ? (
                <div className="px-3 py-4 text-sm text-zinc-400">Original audio</div>
              ) : audioTracks.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => {
                    setSelectedAudioTrackId(track.id);
                    setSettingsPane("root");
                  }}
                  className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10"
                >
                  <span className="text-left">
                    {track.label}
                    {track.languageCode && <span className="ml-1 text-xs text-zinc-400">{track.languageCode}</span>}
                  </span>
                  {(selectedAudioTrackId === track.id || (!selectedAudioTrackId && track.isDefault)) && <Check size={17} />}
                </button>
              ))}
            </div>
          )}

          {settingsPane === "sleep" && (
            <div className="space-y-1">
              {sleepOptions.map((option) => (
                <button
                  key={option.minutes}
                  type="button"
                  onClick={() => {
                    setSleepMinutes(option.minutes);
                    setSettingsPane("root");
                  }}
                  className="flex h-10 w-full items-center justify-between rounded-md px-3 text-sm font-medium hover:bg-white/10"
                >
                  <span>{option.label}</span>
                  {sleepMinutes === option.minutes && <Check size={17} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Player;
