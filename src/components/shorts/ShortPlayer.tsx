import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Volume2, VolumeX } from "lucide-react";
import { useProxiedImageUrl } from "../../lib/useProxiedImageUrl";
import { useShortStream } from "../../lib/useShortStream";
import { ShortVideoSurface } from "./ShortVideoSurface";
import { ShortMetadata } from "./ShortMetadata";
import { ShortActionBar } from "./ShortActionBar";
import { ShortSidePanel } from "./ShortSidePanel";
import type { ShortItem, ShortsPanelState } from "../../types/shorts";

interface ShortPlayerProps {
  short: ShortItem;
  active: boolean;
  preload: boolean;
  muted: boolean;
  panelState: ShortsPanelState;
  onRequestPanel: (panel: ShortsPanelState) => void;
  onToggleMute: () => void;
  onUnavailable: () => void;
}

export function ShortPlayer({
  short,
  active,
  preload,
  muted,
  panelState,
  onRequestPanel,
  onToggleMute,
  onUnavailable,
}: ShortPlayerProps) {
  const [activeRetryToken, setActiveRetryToken] = useState(0);
  const [activeRetryAttempted, setActiveRetryAttempted] = useState(false);
  const thumbnail = useProxiedImageUrl(short.thumbnailUrl);
  const panelOpen = active && panelState !== "none";

  useEffect(() => {
    setActiveRetryAttempted(false);
    setActiveRetryToken(0);
  }, [short.id]);

  const { dashUrl, videoUrl, audioUrl, loading, unavailable } = useShortStream(
    short.id,
    active || preload,
    activeRetryToken,
  );

  // A Short whose stream can't be resolved (e.g. login-walled) is skipped so the
  // feed never stalls on a dead frame.
  useEffect(() => {
    if (!active || !unavailable || loading) return;
    if (!activeRetryAttempted) {
      setActiveRetryAttempted(true);
      setActiveRetryToken((value) => value + 1);
      return;
    }
    onUnavailable();
  }, [active, activeRetryAttempted, loading, unavailable, onUnavailable]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* Ambient background*/}
      <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden>
        {thumbnail && (
          <img
            src={thumbnail}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-40 blur-[120px] saturate-150"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/60 via-neutral-950/80 to-neutral-950" />
      </div>

      {/* Centered media group */}
      <div className="relative z-10 flex h-[90%] max-h-[850px] flex-row items-stretch">
        <div
          className={`relative aspect-[9/16] h-full overflow-hidden border border-white/10 bg-black ${
            panelOpen ? "rounded-l-2xl" : "rounded-2xl"
          }`}
        >
          <ShortVideoSurface
            dashUrl={active ? dashUrl : null}
            videoUrl={active ? videoUrl : null}
            audioUrl={active ? audioUrl : null}
            poster={thumbnail}
            active={active}
            muted={muted}
            onError={() => {
              console.error(`[shorts] video error ${short.id}`, dashUrl, videoUrl);
              onUnavailable();
            }}
          />

          {active && loading && !dashUrl && !videoUrl && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <Loader2 className="h-8 w-8 animate-spin text-white/80" />
            </div>
          )}

          {active && unavailable && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
              <p className="text-sm text-white/70">Skipping unavailable Short…</p>
            </div>
          )}

          {/* Overlay only on the focused Short — keeps reaction/subscribe hooks to one instance. */}
          {active && (
            <>
              <button
                type="button"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={onToggleMute}
                className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition-colors duration-200 ease-out hover:bg-black/75"
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              <ShortMetadata short={short} onOpenDescription={() => onRequestPanel("description")} />
              <ShortActionBar short={short} onRequestPanel={onRequestPanel} />
            </>
          )}
        </div>

        <AnimatePresence initial={false}>
          {panelOpen && (
            <motion.div
              key="short-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              className="h-full overflow-hidden"
            >
              <ShortSidePanel
                short={short}
                panelState={panelState}
                onClose={() => onRequestPanel("none")}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
