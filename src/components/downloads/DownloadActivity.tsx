import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  X,
  XCircle,
  WifiOff,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";

import {
  cancelDownload,
  pauseDownload,
  resumeDownload,
  type DownloadProgress,
} from "../../lib/api/downloads";
import { isTauriEnv } from "../../lib/api/env";
import { getString } from "../../lib/i18n/index";
import { useDownloadStore } from "../../store/useDownloadStore";
import { useDownloadsLibraryStore } from "../../store/useDownloadsLibraryStore";
import { DOWNLOAD_SURFACE_SPRING, downloadSurfaceLayoutId } from "./surface";

function progressPercent(item: DownloadProgress): number | null {
  if (!item.totalBytes || item.totalBytes <= 0) return null;
  return Math.max(0, Math.min(100, (item.downloadedBytes / item.totalBytes) * 100));
}

function DockCard({
  item,
  onOpen,
  onDismiss,
}: {
  item: DownloadProgress;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const percent = progressPercent(item);
  const paused = item.status === "paused";
  const waiting = item.status === "waitingForNetwork";
  const running = item.status === "queued"
    || item.status === "downloading"
    || paused
    || waiting
    || item.status === "muxing";
  const failed = item.status === "failed";
  const detail = failed
    ? item.error
    : item.status === "completed"
      ? getString("download_complete")
      : item.status === "muxing"
        ? getString("download_muxing")
        : waiting
          ? getString("download_waiting_network")
          : paused
            ? getString("download_paused")
            : item.qualityLabel;

  return (
    <motion.div
      layoutId={downloadSurfaceLayoutId(item.id)}
      layout
      initial={false}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={DOWNLOAD_SURFACE_SPRING}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="cursor-pointer rounded-2xl border border-neutral-800 bg-surface-container-high p-4 transition-colors duration-200 ease-out hover:bg-surface-container-highest"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-neutral-300">
          {waiting ? (
            <WifiOff className="h-4 w-4" />
          ) : running && !paused ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : paused ? (
            <Pause className="h-4 w-4" />
          ) : failed ? (
            <XCircle className="h-4 w-4 text-red-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-neutral-100">{item.title}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-neutral-400">{detail}</div>
        </div>
        <div className="flex items-center gap-1">
          {running && item.status !== "muxing" ? (
            <button
              type="button"
              aria-label={paused ? getString("download_resume") : getString("download_pause")}
              onClick={(event) => {
                event.stopPropagation();
                void (paused ? resumeDownload(item.id) : pauseDownload(item.id));
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors duration-200 ease-out hover:bg-surface-container-low hover:text-neutral-100"
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={running ? getString("download_cancel") : getString("close")}
            onClick={(event) => {
              event.stopPropagation();
              if (running) void cancelDownload(item.id);
              else onDismiss();
            }}
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors duration-200 ease-out hover:bg-surface-container-low hover:text-neutral-100"
          >
            <X size={15} />
          </button>
        </div>
      </div>
      {running ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container-low">
          <div
            className={`h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-200 ${percent == null ? "w-1/3 animate-pulse" : ""}`}
            style={percent == null ? undefined : { width: `${percent}%` }}
          />
        </div>
      ) : null}
    </motion.div>
  );
}

export function DownloadActivity() {
  const active = useDownloadStore((state) => state.active);
  const dialog = useDownloadStore((state) => state.dialog);
  const updateProgress = useDownloadStore((state) => state.updateProgress);
  const dismissProgress = useDownloadStore((state) => state.dismissProgress);
  const openActivity = useDownloadStore((state) => state.openActivity);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void isTauriEnv().then(async (tauri) => {
      if (!tauri) return;
      const stop = await listen<DownloadProgress>("download-progress", (event) => {
        updateProgress(event.payload);
        if (event.payload.status === "completed") {
          void useDownloadsLibraryStore.getState().load();
        }
      });
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [updateProgress]);

  const items = Object.values(active).reverse();
  if (dialog || items.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[120] flex max-h-[70vh] w-[380px] max-w-[calc(100vw-3rem)] flex-col gap-2 overflow-y-auto">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <DockCard
            key={item.id}
            item={item}
            onOpen={() => openActivity(item.id)}
            onDismiss={() => dismissProgress(item.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
