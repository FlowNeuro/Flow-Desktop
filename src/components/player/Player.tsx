import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Music,
  Video
} from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { getStreamInfo, getSponsorBlockSegments } from "../../lib/api/youtube";
import type { SponsorBlockSegment } from "../../lib/api/youtube";
import { addWatchRecord, getSetting, setSetting } from "../../lib/api/db";

export const Player: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isWatchPage = location.pathname.startsWith("/watch/");

  const {
    currentVideo,
    isPlaying,
    volume,
    playbackRate,
    playMode,
    setIsPlaying,
    setVolume,
    playNext,
    playPrevious,
    setPlayMode,
    currentTime,
    duration,
    setCurrentTime,
    setDuration
  } = usePlayerStore();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [showMute, setShowMute] = useState(false);

  const [segments, setSegments] = useState<SponsorBlockSegment[]>([]);
  const [categoriesConfig, setCategoriesConfig] = useState<Record<string, string>>({
    sponsor: "skip",
    intro: "skip",
    outro: "skip",
    selfpromo: "skip",
    interaction: "ignore",
    filler: "ignore",
  });
  const [sbEnabled, setSbEnabled] = useState(true);
  const skippedSegmentsRef = useRef<Set<string>>(new Set());

  const videoRef = useRef<HTMLVideoElement>(null);

  // Load SponsorBlock configurations and segments
  useEffect(() => {
    if (!currentVideo || isWatchPage) {
      setSegments([]);
      skippedSegmentsRef.current.clear();
      return;
    }

    const loadSponsorBlock = async () => {
      try {
        skippedSegmentsRef.current.clear();
        
        const dbEnabled = await getSetting("sponsorblock_enabled");
        const isSbEnabled = dbEnabled !== null ? dbEnabled === "true" : true;
        setSbEnabled(isSbEnabled);

        if (!isSbEnabled) {
          setSegments([]);
          return;
        }

        const dbServer = await getSetting("sponsorblock_server");
        const serverUrl = dbServer || "https://sponsor.ajay.app";

        const dbCategories = await getSetting("sponsorblock_categories");
        if (dbCategories) {
          try {
            setCategoriesConfig(JSON.parse(dbCategories));
          } catch (e) {
            console.warn("Failed to parse sponsorblock_categories", e);
          }
        }

        const fetchedSegments = await getSponsorBlockSegments(currentVideo.id, serverUrl);
        setSegments(fetchedSegments);
      } catch (err) {
        console.warn("SponsorBlock segments query failed", err);
        setSegments([]);
      }
    };

    loadSponsorBlock();
  }, [currentVideo, isWatchPage]);

  // Fetch local proxy stream URL for background playback
  useEffect(() => {
    if (!currentVideo || isWatchPage) {
      setStreamUrl(null);
      return;
    }

    const loadStream = async () => {
      try {
        const info = await getStreamInfo(currentVideo.id);
        setStreamUrl(info.localUrl);
        setIsPlaying(true);

        await addWatchRecord({
          videoId: currentVideo.id,
          title: currentVideo.title,
          channelName: currentVideo.channelName,
          watchDate: new Date().toISOString(),
          watchDurationSeconds: 0,
          totalDurationSeconds: currentVideo.durationSeconds ?? 0,
        });
      } catch (err) {
        setStreamUrl(null);
        console.error("Failed to load stream URL in background bar", err);
      }
    };

    loadStream();
  }, [currentVideo, isWatchPage]);

  // Handle Play/Pause commands
  useEffect(() => {
    if (!videoRef.current || isWatchPage) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => setIsPlaying(false));
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, streamUrl, isWatchPage]);

  // Sync playback rate speed
  useEffect(() => {
    if (videoRef.current && !isWatchPage) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, isWatchPage]);

  // Sync native volume controls
  useEffect(() => {
    if (videoRef.current && !isWatchPage) {
      videoRef.current.volume = showMute ? 0 : volume;
    }
  }, [volume, showMute, isWatchPage]);

  // Restore playhead position when mounting/becoming active
  useEffect(() => {
    if (videoRef.current && !isWatchPage && currentTime > 0) {
      if (Math.abs(videoRef.current.currentTime - currentTime) > 2) {
        videoRef.current.currentTime = currentTime;
      }
    }
  }, [streamUrl, isWatchPage]);

  const handleTimeUpdate = () => {
    if (!videoRef.current || isWatchPage) return;
    
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    setDuration(videoRef.current.duration || currentVideo?.durationSeconds || 1);

    // SponsorBlock segments skip check
    if (sbEnabled && segments.length > 0) {
      for (const seg of segments) {
        const [start, end] = seg.segment;
        const shouldSkip = categoriesConfig[seg.category] === "skip";
        if (shouldSkip && time >= start && time < end && !skippedSegmentsRef.current.has(seg.UUID)) {
          skippedSegmentsRef.current.add(seg.UUID);
          videoRef.current.currentTime = end;
          setCurrentTime(end);

          void (async () => {
            try {
              const currentSavedMinutesStr = await getSetting("sponsorblock_saved_minutes") || "0";
              const currentSkippedSegmentsStr = await getSetting("sponsorblock_skipped_segments") || "0";
              
              const currentSavedMinutes = parseFloat(currentSavedMinutesStr);
              const currentSkippedSegments = parseInt(currentSkippedSegmentsStr, 10);
              
              const durationSec = end - start;
              const durationMin = durationSec / 60.0;
              
              const newSavedMinutes = Math.round((currentSavedMinutes + durationMin) * 100) / 100;
              const newSkippedSegments = currentSkippedSegments + 1;
              
              await setSetting("sponsorblock_saved_minutes", String(newSavedMinutes));
              await setSetting("sponsorblock_skipped_segments", String(newSkippedSegments));
            } catch (telemetryErr) {
              console.warn("Failed to update SponsorBlock telemetry stats", telemetryErr);
            }
          })();
          
          break;
        }
      }
    }
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current && !isWatchPage) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "0:00";
    const mins = Math.floor(secs / 60);
    const remainder = Math.floor(secs % 60);
    return `${mins}:${remainder.toString().padStart(2, "0")}`;
  };

  // If we are on the Watch Page, or there is no active video playing, hide the bottom bar completely!
  if (isWatchPage || !currentVideo) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950 z-40 h-20 shadow-2xl transition-all duration-300">
      <video
        ref={videoRef}
        src={streamUrl || undefined}
        onTimeUpdate={handleTimeUpdate}
        onEnded={playNext}
        className="hidden"
      />

      <div className="h-full max-w-7xl mx-auto px-6 flex items-center justify-between gap-4">
        {/* Cover thumbnail & title details */}
        <div className="flex items-center gap-3 w-1/3 min-w-0">
          <div
            onClick={() => navigate(`/watch/${currentVideo.id}`)}
            className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer bg-zinc-900 border border-zinc-800 shrink-0"
          >
            <img
              src={currentVideo.thumbnailUrl || "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=150"}
              alt={currentVideo.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <h4
              onClick={() => navigate(`/watch/${currentVideo.id}`)}
              className="text-xs font-bold text-zinc-100 truncate hover:text-red-450 cursor-pointer"
            >
              {currentVideo.title}
            </h4>
            <p className="text-[10px] text-zinc-400 truncate mt-0.5">{currentVideo.channelName}</p>
          </div>
        </div>

        {/* Minimized Controls */}
        <div className="flex flex-col items-center gap-1.5 w-1/3">
          <div className="flex items-center gap-4">
            <button
              onClick={playPrevious}
              className="text-zinc-400 hover:text-zinc-200 transition-colors active:scale-95 cursor-pointer"
            >
              <SkipBack size={16} />
            </button>
            <button
              onClick={handlePlayPause}
              className="p-2.5 bg-red-650 hover:bg-red-500 rounded-full text-white active:scale-90 transition-all cursor-pointer"
            >
              {isPlaying ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
            </button>
            <button
              onClick={playNext}
              className="text-zinc-400 hover:text-zinc-200 transition-colors active:scale-95 cursor-pointer"
            >
              <SkipForward size={16} />
            </button>
          </div>

          {/* Time progress bar */}
          <div className="flex items-center gap-2 w-full text-[10px] text-zinc-500 font-bold">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration}
              value={currentTime}
              onChange={handleProgressChange}
              className="flex-grow accent-red-650 h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none"
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Player Mode & Volume Toggle */}
        <div className="flex items-center justify-end gap-4 w-1/3">
          <div className="flex items-center gap-1 bg-zinc-900/50 border border-zinc-800/40 p-1 rounded-xl">
            <button
              onClick={() => setPlayMode("music")}
              title="Music player Mode"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                playMode === "music" ? "bg-zinc-800 text-red-400" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Music size={13} />
            </button>
            <button
              onClick={() => setPlayMode("video")}
              title="Video player Mode"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                playMode === "video" ? "bg-zinc-800 text-red-400" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Video size={13} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMute(!showMute)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              {showMute ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 accent-red-650 h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Player;
