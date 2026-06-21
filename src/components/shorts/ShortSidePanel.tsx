import { X } from "lucide-react";
import { CommentsSection } from "../watch/CommentsSection";
import { useShortDetails } from "../../lib/useShortDetails";
import { getString } from "../../lib/i18n/index";
import type { ShortItem, ShortsPanelState } from "../../types/shorts";

interface ShortSidePanelProps {
  short: ShortItem;
  panelState: ShortsPanelState;
  onClose: () => void;
}

export function ShortSidePanel({ short, panelState, onClose }: ShortSidePanelProps) {
  const isComments = panelState === "comments";

  return (
    <div className="flex h-full w-[400px] flex-col rounded-r-2xl border-l border-neutral-800 bg-surface-container-high">
      <div className="flex items-center justify-between border-b border-neutral-800 p-4">
        <h3 className="text-base font-medium text-neutral-200">
          {getString(isComments ? "shorts_comments_title" : "shorts_description_title")}
        </h3>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-surface-container-highest hover:text-neutral-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isComments ? <ShortComments videoId={short.id} /> : <ShortDescription short={short} />}
    </div>
  );
}

function ShortDescription({ short }: { short: ShortItem }) {
  const { details, loading } = useShortDetails(short.id, true);
  const description = details?.description?.trim();
  const views = short.viewCountText?.replace(/\s*views?$/i, "") ?? "—";

  return (
    <div className="hide-scrollbar flex-1 overflow-y-auto">
      <div className="grid grid-cols-3 gap-2 p-4">
        <StatPill label={getString("shorts_stat_likes")} value={short.likeCountText ?? "—"} />
        <StatPill label={getString("shorts_stat_views")} value={views} />
        <StatPill label={getString("shorts_stat_date")} value={short.publishedText ?? "—"} />
      </div>
      <p className="px-4 text-base font-medium text-neutral-100">{short.title}</p>
      <p className="whitespace-pre-wrap p-4 text-sm text-neutral-300">
        {description || (loading ? "…" : getString("shorts_no_description"))}
      </p>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low p-3">
      <span className="max-w-full truncate font-mono text-sm text-neutral-100">{value}</span>
      <span className="mt-0.5 text-xs text-neutral-400">{label}</span>
    </div>
  );
}

function ShortComments({ videoId }: { videoId: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hide-scrollbar flex-1 overflow-y-auto px-4">
        <CommentsSection videoId={videoId} />
      </div>
      <div className="border-t border-neutral-800 p-3">
        <input
          readOnly
          placeholder={getString("shorts_add_comment")}
          className="w-full rounded-full bg-surface-container-low px-4 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
