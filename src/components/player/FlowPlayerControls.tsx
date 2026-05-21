import React, { useState, useEffect } from "react";
import {
  AudioLines,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  PictureInPicture2,
  Play,
  Settings as SettingsIcon,
  SkipBack,
  SkipForward,
  Tv,
  Volume1,
  Volume2,
  VolumeX,
  Sliders,
} from "lucide-react";
import { usePlayerStore, type PlaybackRate } from "../../store/usePlayerStore";
import { useSettingsStore, type SponsorBlockCategory } from "../../store/useSettingsStore";
import type { AudioTrack, CaptionTrack, StreamVariant } from "../../types/video";
import { SubtitleCustomizer } from "./SubtitleCustomizer";

export interface FlowPlayerControlsProps {
  title?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;

  containerRef: React.RefObject<HTMLDivElement | null>;

  controlsVisible: boolean;
  setControlsVisible: (visible: boolean) => void;
  shouldShowControls: boolean;

  qualities?: StreamVariant[];
  selectedQualityId?: string | null;
  isDashPlayback?: boolean;
  onSelectQuality?: (variant: StreamVariant) => void;

  captions?: CaptionTrack[];
  selectedCaptionId: string;
  setSelectedCaptionId: (id: string) => void;

  audioTracks?: AudioTrack[];
  selectedAudioTrackId?: string | null;
  setSelectedAudioTrackId: (id: string | null) => void;

  bufferedPct: number;

  sleepMinutes: number;
  setSleepMinutes: React.Dispatch<React.SetStateAction<number>>;

  muted: boolean;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;

  isFullscreen: boolean;
  toggleFullscreen: () => void;

  isPip: boolean;
  togglePictureInPicture: () => void;

  seekTo: (time: number) => void;
  togglePlay: () => void;

  settingsOpen: boolean;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isScrubbing: boolean;
  setIsScrubbing: React.Dispatch<React.SetStateAction<boolean>>;
}

type SettingsPane = "root" | "speed" | "quality" | "captions" | "captions-customize" | "audio" | "sleep";

const speedOptions: PlaybackRate[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const sleepOptions = [
  { label: "Off", minutes: 0 },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hour", minutes: 60 },
];

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
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export const FlowPlayerControls: React.FC<FlowPlayerControlsProps> = ({
  title,
  containerRef,
  shouldShowControls,
  qualities = [],
  selectedQualityId,
  isDashPlayback = false,
  onSelectQuality,
  captions = [],
  selectedCaptionId,
  setSelectedCaptionId,
  audioTracks = [],
  selectedAudioTrackId,
  setSelectedAudioTrackId,
  bufferedPct,
  sleepMinutes,
  setSleepMinutes,
  muted,
  setMuted,
  isFullscreen,
  toggleFullscreen,
  isPip,
  togglePictureInPicture,
  seekTo,
  togglePlay,
  settingsOpen,
  setSettingsOpen,
  isScrubbing,
  setIsScrubbing,
}) => {
  const {
    isPlaying,
    volume,
    setVolume,
    playbackRate,
    setPlaybackRate,
    currentTime,
    duration,
    playNext,
    playPrevious,
    isTheaterMode,
    setIsTheaterMode,
    sponsorBlockSegments,
  } = usePlayerStore();

  const { sponsorBlockColors, sponsorBlockEnabled } = useSettingsStore();

  const [settingsPane, setSettingsPane] = useState<SettingsPane>("root");
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPct, setHoverPct] = useState(0);

  const progressPct =
    duration > 0
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;

  const supportedQualities = qualities;
  const selectedQuality =
    supportedQualities.find((quality) => quality.id === selectedQualityId) ||
    supportedQualities.find((quality) => quality.isDefault) ||
    supportedQualities[0] ||
    null;

  const selectedCaption =
    captions.find((caption) => caption.id === selectedCaptionId) || null;
  const selectedAudioTrack =
    audioTracks.find((track) => track.id === selectedAudioTrackId) ||
    audioTracks.find((track) => track.isDefault) ||
    audioTracks[0] ||
    null;

  useEffect(() => {
    if (!settingsOpen) {
      setSettingsPane("root");
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (!isScrubbing) return;

    const handlePointerMove = (e: PointerEvent) => {
      const track = containerRef.current?.querySelector(
        "[data-progress-track]"
      );
      if (!(track instanceof HTMLElement) || duration <= 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left) / rect.width)
      );
      seekTo(ratio * duration);
    };

    const handlePointerUp = () => {
      setIsScrubbing(false);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isScrubbing, duration, seekTo, setIsScrubbing, containerRef]);

  const handlePointerSeek = (clientX: number) => {
    const track = containerRef.current?.querySelector("[data-progress-track]");
    if (!(track instanceof HTMLElement) || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  };

  const handleProgressMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    );
    setHoverPct(ratio * 100);
    setHoverTime(ratio * (duration || 0));
  };

  const renderSettingRow = (
    label: string,
    value: React.ReactNode,
    icon: React.ReactNode,
    onClick: () => void
  ) => (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-zinc-100 transition-colors hover:bg-white/10"
    >
      <span className="grid h-7 w-7 place-items-center text-zinc-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      <span className="max-w-[46%] truncate text-right text-zinc-300">
        {value}
      </span>
      <ChevronRight size={16} className="text-zinc-400" />
    </button>
  );

  return (
    <>
      <div
        className={cx(
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-3 pt-24 transition-opacity duration-200 sm:px-5 sm:pb-4",
          shouldShowControls ? "opacity-100" : "opacity-0"
        )}
      >
        <div
          className="pointer-events-auto"
          onClick={(event) => event.stopPropagation()}
        >
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
              <div
                className="absolute inset-y-0 left-0 bg-white/35"
                style={{ width: `${bufferedPct}%` }}
              />
              {sponsorBlockEnabled && sponsorBlockSegments.map((segment) => {
                if (!duration) return null;
                const start = (segment.segment[0] / duration) * 100;
                const width =
                  ((segment.segment[1] - segment.segment[0]) / duration) * 100;
                const segmentColor = sponsorBlockColors[segment.category as SponsorBlockCategory] || "#ef4444";
                return (
                  <div
                    key={segment.UUID}
                    className="absolute inset-y-0"
                    style={{ 
                      left: `${start}%`, 
                      width: `${width}%`,
                      backgroundColor: segmentColor
                    }}
                  />
                );
              })}
              <div
                className="absolute inset-y-0 left-0 bg-primary"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div
              className="absolute top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-primary opacity-0 shadow-lg shadow-black/40 transition-opacity group-hover/player:opacity-100"
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
              <button
                type="button"
                title="Previous"
                onClick={playPrevious}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10"
              >
                <SkipBack size={19} fill="currentColor" />
              </button>
              <button
                type="button"
                title={isPlaying ? "Pause" : "Play"}
                onClick={togglePlay}
                className="grid h-10 w-10 place-items-center rounded-full bg-black/20 text-white hover:bg-white/10 transition-transform active:scale-95"
              >
                {isPlaying ? (
                  <Pause size={24} fill="currentColor" />
                ) : (
                  <Play size={24} fill="currentColor" className="ml-0.5" />
                )}
              </button>
              <button
                type="button"
                title="Next"
                onClick={playNext}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10"
              >
                <SkipForward size={19} fill="currentColor" />
              </button>

              <div className="group/volume hidden items-center sm:flex bg-black/20 rounded-full hover:pr-2">
                <button
                  type="button"
                  title="Mute"
                  onClick={() => setMuted((value) => !value)}
                  className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10"
                >
                  {muted || volume === 0 ? (
                    <VolumeX size={19} />
                  ) : volume < 0.55 ? (
                    <Volume1 size={19} />
                  ) : (
                    <Volume2 size={19} />
                  )}
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

              <div className="ml-1 whitespace-nowrap text-xs font-semibold text-zinc-100 sm:text-sm bg-black/20 rounded-full px-2 py-1">
                {formatTime(currentTime)}{" "}
                <span className="text-zinc-400">/</span> {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-black/20 rounded-full px-1 py-1">
              {selectedQuality && (
                <button
                  type="button"
                  title="Quality"
                  onClick={() => {
                    if (settingsOpen && settingsPane === "quality") {
                      setSettingsOpen(false);
                      setSettingsPane("root");
                    } else {
                      setSettingsOpen(true);
                      setSettingsPane("quality");
                    }
                  }}
                  className="hidden h-7 items-center rounded-full px-2 text-xs font-bold text-zinc-100 hover:bg-white/10 sm:flex"
                >
                  {selectedQuality.qualityLabel}
                </button>
              )}
              <button
                type="button"
                title="Captions"
                onClick={() => {
                  if (settingsOpen && settingsPane === "captions") {
                    setSettingsOpen(false);
                    setSettingsPane("root");
                  } else {
                    setSettingsOpen(true);
                    setSettingsPane("captions");
                  }
                }}
                className={cx(
                  "grid h-7 w-7 place-items-center rounded-full hover:bg-white/10",
                  selectedCaptionId !== "off" && "text-primary/90"
                )}
              >
                <Captions size={19} />
              </button>
              <button
                type="button"
                title="Settings"
                onClick={() => {
                  setSettingsOpen((value) => !value);
                  setSettingsPane("root");
                }}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10"
              >
                <SettingsIcon
                  size={19}
                  className={
                    settingsOpen
                      ? "rotate-90 transition-transform text-primary/90"
                      : "transition-transform"
                  }
                />
              </button>
              <button
                type="button"
                title="Picture in picture"
                onClick={togglePictureInPicture}
                className={cx(
                  "hidden h-7 w-7 place-items-center rounded-full hover:bg-white/10 sm:grid",
                  isPip && "bg-white/15"
                )}
              >
                <PictureInPicture2 size={19} />
              </button>
              <button
                type="button"
                title="Theater mode"
                onClick={() => setIsTheaterMode(!isTheaterMode)}
                className={cx(
                  "grid h-7 w-7 place-items-center rounded-full hover:bg-white/10",
                  isTheaterMode && "bg-white/15"
                )}
              >
                <Tv size={19} />
              </button>
              <button
                type="button"
                title="Fullscreen"
                onClick={toggleFullscreen}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10"
              >
                {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={cx(
          "absolute bottom-20 right-3 z-40 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-white/10 bg-[#151515]/65 p-2 text-white shadow-2xl backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform sm:right-5",
          settingsOpen
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 translate-y-4 scale-95 pointer-events-none"
        )}
      >
        {settingsPane !== "root" && (
          <div className="mb-1 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => {
                if (settingsPane === "captions-customize") {
                  setSettingsPane("captions");
                } else {
                  setSettingsPane("root");
                }
              }}
              className="flex h-10 items-center gap-2 rounded-md px-1 text-sm font-bold hover:bg-white/10 text-left"
            >
              <ChevronLeft size={18} />
              {settingsPane === "speed"
                ? "Playback speed"
                : settingsPane === "quality"
                ? "Quality"
                : settingsPane === "captions"
                ? "Subtitles/CC"
                : settingsPane === "captions-customize"
                ? "Subtitle Style"
                : settingsPane === "audio"
                ? "Audio track"
                : "Sleep timer"}
            </button>
            {settingsPane === "captions" && (
              <button
                type="button"
                title="Customize Subtitles"
                onClick={() => setSettingsPane("captions-customize")}
                className="grid h-8 w-8 place-items-center rounded-md text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                <Sliders size={17} />
              </button>
            )}
          </div>
        )}

        {settingsPane === "root" && (
          <div className="space-y-1 animate-pane-in">
            {renderSettingRow(
              "Playback speed",
              playbackRate === 1 ? "Normal" : `${playbackRate}x`,
              <Gauge size={18} />,
              () => setSettingsPane("speed")
            )}
            {renderSettingRow(
              "Quality",
              selectedQuality?.qualityLabel || "Auto",
              <Monitor size={18} />,
              () => setSettingsPane("quality")
            )}
            {renderSettingRow(
              "Subtitles/CC",
              selectedCaption ? selectedCaption.label : "Off",
              <Captions size={18} />,
              () => setSettingsPane("captions")
            )}
            {renderSettingRow(
              "Subtitle Style",
              "Customize",
              <Sliders size={18} />,
              () => setSettingsPane("captions-customize")
            )}
            {renderSettingRow(
              "Audio track",
              selectedAudioTrack?.label || "Original",
              <AudioLines size={18} />,
              () => setSettingsPane("audio")
            )}
            {renderSettingRow(
              "Sleep timer",
              sleepMinutes ? `${sleepMinutes} min` : "Off",
              <Pause size={18} />,
              () => setSettingsPane("sleep")
            )}
          </div>
        )}

        {settingsPane === "speed" && (
          <div className="space-y-1 animate-pane-in">
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
          <div className="space-y-1 animate-pane-in">
            {supportedQualities.length === 0 ? (
              <div className="px-3 py-4 text-sm text-zinc-400">Auto</div>
            ) : (
              supportedQualities.map((quality) => (
                <button
                  key={quality.id}
                  type="button"
                  onClick={() => {
                    if (
                      !isDashPlayback &&
                      !quality.hasAudio &&
                      !audioTracks.some((track) => !!track.localUrl)
                    ) {
                      return;
                    }
                    onSelectQuality?.(quality);
                    setSettingsPane("root");
                    setSettingsOpen(false);
                  }}
                  className={cx(
                    "flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium",
                    isDashPlayback ||
                      quality.hasAudio ||
                      audioTracks.some((track) => !!track.localUrl)
                      ? "hover:bg-white/10"
                      : "cursor-not-allowed text-zinc-500"
                  )}
                >
                  <span className="flex flex-col text-left leading-tight">
                    <span>{quality.qualityLabel}</span>
                    {quality.isVideoOnly}
                  </span>
                  {(selectedQualityId === quality.id ||
                    (!selectedQualityId && quality.isDefault)) && (
                    <Check size={17} />
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {settingsPane === "captions" && (
          <div className="space-y-1 animate-pane-in">
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
                  {caption.isAutoGenerated && (
                    <span className="ml-1 text-xs text-zinc-400">auto</span>
                  )}
                </span>
                {selectedCaptionId === caption.id && <Check size={17} />}
              </button>
            ))}
          </div>
        )}

        {settingsPane === "captions-customize" && (
          <div className="animate-pane-in">
            <SubtitleCustomizer />
          </div>
        )}

        {settingsPane === "audio" && (
          <div className="space-y-1 animate-pane-in">
            {audioTracks.length === 0 ? (
              <div className="px-3 py-4 text-sm text-zinc-400">
                Original audio
              </div>
            ) : (
              audioTracks.map((track) => (
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
                    {track.languageCode && (
                      <span className="ml-1 text-xs text-zinc-400">
                        {track.languageCode}
                      </span>
                    )}
                  </span>
                  {(selectedAudioTrackId === track.id ||
                    (!selectedAudioTrackId && track.isDefault)) && (
                    <Check size={17} />
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {settingsPane === "sleep" && (
          <div className="space-y-1 animate-pane-in">
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
    </>
  );
};

export default FlowPlayerControls;
