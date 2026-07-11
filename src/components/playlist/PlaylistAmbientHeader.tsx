import { Check, Download, Loader2, MoreVertical, Play, Shuffle } from "lucide-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { getString } from "../../lib/i18n/index";
import type { PlaylistDetailsMeta } from "../../lib/usePlaylistDetails";
import { useVideoThumbnail } from "../../lib/useVideoThumbnail";

interface PlaylistAmbientHeaderProps {
  meta: PlaylistDetailsMeta;
  heroVideoId?: string | null;
  heroThumbnailUrl: string | null;
  onPlayAll: () => void;
  onShuffle: () => void;
  canPlay: boolean;
  onDownload?: () => void;
  downloadActive?: boolean;
  downloadComplete?: boolean;
}

function isUnknownOwner(name: string) {
  return name.trim().toLowerCase() === "unknown owner";
}

export function PlaylistAmbientHeader({
  meta,
  heroVideoId,
  heroThumbnailUrl,
  onPlayAll,
  onShuffle,
  canPlay,
  onDownload,
  downloadActive,
  downloadComplete,
}: PlaylistAmbientHeaderProps) {
  const { src: ambientSrc, onError: onThumbnailError } = useVideoThumbnail(
    heroVideoId,
    heroThumbnailUrl,
    "large",
  );
  const ownerLabel = isUnknownOwner(meta.channelName) ? null : meta.channelName;

  const statsParts = [
    meta.videoCountText,
    meta.viewCountText,
    meta.updatedLabel,
  ].filter((part): part is string => Boolean(part?.trim()));

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl p-6">
        {ambientSrc ? (
          <>
            <img
              src={ambientSrc}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-3xl"
              onError={onThumbnailError}
              decoding="async"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-[var(--color-surface)]"
            />
          </>
        ) : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-surface-container"
          />
        )}

        <div className="relative z-10 flex h-full min-h-0 flex-col gap-6">
          <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-2xl border border-chrome-neutral-800/50 bg-chrome-neutral-950">
            {ambientSrc ? (
              <img
                src={ambientSrc}
                alt={meta.title}
                className="h-full w-full object-cover"
                onError={onThumbnailError}
                decoding="async"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-chrome-neutral-500">
                Playlist
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight text-chrome-neutral-100">
              {meta.title}
            </h1>
            {ownerLabel ? (
              <p className="mt-2 text-sm font-medium text-chrome-neutral-200">
                {ownerLabel}
              </p>
            ) : null}
            {statsParts.length > 0 ? (
              <p className="mt-1 text-sm text-chrome-neutral-300">
                {statsParts.join(" • ")}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <IconButton
              aria-label={getString("downloads_download_playlist")}
              title={getString(
                downloadComplete
                  ? "downloaded"
                  : downloadActive
                    ? "downloads_downloading"
                    : "downloads_download_playlist",
              )}
              onClick={onDownload}
              disabled={!onDownload || downloadActive}
            >
              {downloadActive ? (
                <Loader2 size={18} className="animate-spin" />
              ) : downloadComplete ? (
                <Check size={18} className="text-[var(--color-primary)]" />
              ) : (
                <Download size={18} />
              )}
            </IconButton>
            <IconButton aria-label="Playlist menu">
              <MoreVertical size={18} />
            </IconButton>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Button
              size="lg"
              disabled={!canPlay}
              onClick={onPlayAll}
              className="!bg-chrome-neutral-100 !text-chrome-neutral-950 hover:!opacity-90"
            >
              <Play size={18} fill="currentColor" />
              Play All
            </Button>
            <Button
              variant="tonal"
              size="lg"
              disabled={!canPlay}
              onClick={onShuffle}
            >
              <Shuffle size={18} />
              Shuffle
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
