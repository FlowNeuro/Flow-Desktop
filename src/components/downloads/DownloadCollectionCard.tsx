import { Check, Disc3, Download, ListVideo, Loader2, Trash2 } from "lucide-react";

import type { DownloadCollectionRecord } from "../../lib/api/downloads";
import type { CollectionDownloadState } from "../../lib/useCollectionDownloads";
import { getString } from "../../lib/i18n/index";
import { useProxiedImageUrl } from "../../lib/useProxiedImageUrl";

interface DownloadCollectionCardProps {
  collection: DownloadCollectionRecord;
  progress: CollectionDownloadState;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen?: () => void;
  onDelete?: () => void;
}

export function DownloadCollectionCard({
  collection,
  progress,
  selectable = false,
  selected = false,
  onToggleSelect,
  onOpen,
  onDelete,
}: DownloadCollectionCardProps) {
  const thumbnail = useProxiedImageUrl(collection.thumbnailUrl);
  const isAlbum = collection.kind === "album";
  const { total, completed, active, isComplete } = progress;
  const percent = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  const PlaceholderIcon = isAlbum ? Disc3 : ListVideo;

  const activate = () => {
    if (selectable) onToggleSelect?.();
    else onOpen?.();
  };

  return (
    <div className="group flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") activate();
        }}
        className={`relative w-full cursor-pointer overflow-hidden border bg-surface-container ${
          isAlbum ? "aspect-square rounded-xl" : "aspect-video rounded-xl"
        } ${selected ? "border-[var(--color-primary)]" : "border-transparent"}`}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={collection.title}
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-300 ${
              isComplete ? "group-hover:scale-[1.03]" : "scale-100 opacity-60"
            }`}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-surface-container-high text-neutral-600">
            <PlaceholderIcon className="h-10 w-10" />
          </div>
        )}

        {!isComplete ? (
          <div className="absolute inset-0 flex flex-col justify-end bg-black/40 p-3">
            <div className="flex items-center gap-2">
              <span className="text-neutral-100">
                {active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-100">
                {getString("downloads_collection_progress", completed, total)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full bg-black/80 px-2 py-0.5 text-[12px] font-medium leading-tight text-white">
            <Check size={12} className="text-[var(--color-primary)]" />
            {total}
          </div>
        )}

        {!selectable && onDelete ? (
          <button
            type="button"
            aria-label={getString("downloads_remove")}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full border border-neutral-800 bg-neutral-950/90 text-neutral-300 opacity-0 backdrop-blur-md transition-colors duration-200 ease-out hover:bg-red-950/50 hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={15} />
          </button>
        ) : null}

        {selectable ? (
          <div
            className={`absolute left-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full border transition-colors ${
              selected
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                : "border-white/70 bg-black/40 text-transparent"
            }`}
          >
            <Check size={14} />
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        <h3
          onClick={activate}
          className="line-clamp-2 cursor-pointer text-sm font-medium leading-snug text-neutral-100 transition-colors hover:text-white"
        >
          {collection.title}
        </h3>
        <div className="mt-0.5 truncate text-[13px] text-neutral-400">
          {collection.author ||
            getString(isAlbum ? "downloads_albums_section" : "downloads_playlists_section")}
        </div>
      </div>
    </div>
  );
}
