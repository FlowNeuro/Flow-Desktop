import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ListMusic,
  Mic2,
  SlidersHorizontal,
  Maximize2,
  Loader2,
} from "lucide-react";

import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { getString } from "../../lib/i18n/index";
import { artistsText } from "../../lib/musicFormat";
import { HapticButton } from "./HapticButton";
import { MusicArtwork } from "./MusicArtwork";
import { EqPanel } from "./EqPanel";

const ICON_BTN =
  "grid h-9 w-9 place-items-center rounded-full text-neutral-400 transition-colors duration-200 ease-out hover:bg-surface-container-highest hover:text-neutral-100";

function DockProgress() {
  const progress = useMusicPlayerStore((s) => s.progress);
  const duration = useMusicPlayerStore((s) => s.duration);
  const seek = useMusicPlayerStore((s) => s.seek);

  const pct = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(Math.max(0, Math.min(1, ratio)) * duration);
  };

  return (
    <div
      onClick={handleSeek}
      role="slider"
      tabIndex={-1}
      aria-label={getString("music_now_playing")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="group/prog absolute inset-x-4 bottom-1 flex h-2.5 cursor-pointer items-center"
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-neutral-700/70 transition-[height] duration-150 ease-out group-hover/prog:h-1.5">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-primary)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function GlobalMusicDock() {
  const currentTrack = useMusicPlayerStore((s) => s.currentTrack);
  const isPlaying = useMusicPlayerStore((s) => s.isPlaying);
  const isBuffering = useMusicPlayerStore((s) => s.isBuffering);
  const loadingStreamId = useMusicPlayerStore((s) => s.loadingStreamId);
  const eqEnabled = useMusicPlayerStore((s) => s.eqEnabled);

  const togglePlay = useMusicPlayerStore((s) => s.togglePlay);
  const next = useMusicPlayerStore((s) => s.next);
  const previous = useMusicPlayerStore((s) => s.previous);
  const openOverlay = useMusicPlayerStore((s) => s.openOverlay);

  const [eqOpen, setEqOpen] = useState(false);

  const loading = isBuffering || loadingStreamId !== null;

  return (
    <AnimatePresence>
      {currentTrack && (
        <motion.div
          key="music-dock"
          initial={{ y: 96, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
          className="fixed bottom-3 left-1/2 z-50 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2"
        >
          <div className="relative flex items-center gap-3 rounded-3xl border border-neutral-800 bg-surface-container-high px-3 pb-3.5 pt-2">
            {/* LEFT — artwork + meta (click to expand) */}
            <button
              type="button"
              onClick={() => openOverlay("full")}
              aria-label={getString("music_expand")}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <MusicArtwork
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                layoutId="music-player-art"
                loading={loading}
                className="h-12 w-12 shrink-0 rounded-full ring-1 ring-neutral-800/60 md:rounded-md"
              />
              <div className="flex min-w-0 flex-col">
                <span className="line-clamp-1 text-sm font-medium text-neutral-100">
                  {currentTrack.title}
                </span>
                <span className="line-clamp-1 text-xs text-neutral-400">
                  {artistsText(currentTrack.artists)}
                </span>
              </div>
            </button>

            {/* CENTER — transport */}
            <div className="flex shrink-0 items-center gap-1">
              <HapticButton
                onClick={previous}
                aria-label={getString("music_previous")}
                className={ICON_BTN}
              >
                <SkipBack className="h-4 w-4" fill="currentColor" />
              </HapticButton>

              <HapticButton
                onClick={togglePlay}
                aria-label={getString(isPlaying ? "music_pause" : "music_play")}
                className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] transition-[filter] duration-200 ease-out hover:brightness-110"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-5 w-5" fill="currentColor" />
                ) : (
                  <Play className="h-5 w-5" fill="currentColor" />
                )}
              </HapticButton>

              <HapticButton
                onClick={next}
                aria-label={getString("music_next")}
                className={ICON_BTN}
              >
                <SkipForward className="h-4 w-4" fill="currentColor" />
              </HapticButton>
            </div>

            {/* RIGHT — secondary actions */}
            <div className="relative hidden shrink-0 items-center gap-0.5 sm:flex">
              <HapticButton
                onClick={() => openOverlay("queue")}
                aria-label={getString("music_queue")}
                className={ICON_BTN}
              >
                <ListMusic className="h-[18px] w-[18px]" />
              </HapticButton>

              <HapticButton
                onClick={() => openOverlay("lyrics")}
                aria-label={getString("music_lyrics")}
                className={ICON_BTN}
              >
                <Mic2 className="h-[18px] w-[18px]" />
              </HapticButton>

              <HapticButton
                onClick={() => setEqOpen((v) => !v)}
                aria-label={getString("music_equalizer")}
                aria-pressed={eqOpen}
                className={
                  eqOpen || eqEnabled
                    ? "grid h-9 w-9 place-items-center rounded-full bg-surface-container-highest text-[var(--color-primary)] transition-colors duration-200 ease-out"
                    : ICON_BTN
                }
              >
                <SlidersHorizontal className="h-[18px] w-[18px]" />
              </HapticButton>

              <HapticButton
                onClick={() => openOverlay("full")}
                aria-label={getString("music_expand")}
                className={ICON_BTN}
              >
                <Maximize2 className="h-[18px] w-[18px]" />
              </HapticButton>

              <EqPanel open={eqOpen} onClose={() => setEqOpen(false)} />
            </div>

            <DockProgress />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
