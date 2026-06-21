import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { MessageCircle, MoreVertical, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useVideoReactions } from "../../lib/useVideoReactions";
import { useUiStore } from "../../store/useUiStore";
import { markNotInterested } from "../../lib/api/recommendation";
import { getString } from "../../lib/i18n/index";
import { formatCount } from "../../lib/utils";
import type { ShortItem, ShortsPanelState } from "../../types/shorts";
import type { VideoDetails, VideoSummary } from "../../types/video";
import type { RydData } from "../../lib/api/foss";

interface ShortActionBarProps {
  short: ShortItem;
  details?: VideoDetails | null;
  rydData?: RydData | null;
  commentCountText?: string | null;
  onRequestPanel: (panel: ShortsPanelState) => void;
}

export function ShortActionBar({
  short,
  details,
  rydData,
  commentCountText,
  onRequestPanel,
}: ShortActionBarProps) {
  const showToast = useUiStore((s) => s.showToast);
  const [menuOpen, setMenuOpen] = useState(false);
  const likeCountText = rydData
    ? formatCount(rydData.likes)
    : formatCount(short.likeCountText ?? details?.likeCountText) || "Like";
  const dislikeCountText = rydData ? formatCount(rydData.dislikes) : "Dislike";
  const resolvedCommentCountText = formatCount(commentCountText ?? short.commentCountText) || "Comments";

  const video = useMemo<VideoSummary>(
    () => ({
      id: short.id,
      title: short.title,
      channelName: short.channelName,
      channelId: short.channelId ?? null,
      thumbnailUrl: short.thumbnailUrl,
      durationSeconds: null,
      publishedText: short.publishedText ?? null,
      viewCountText: short.viewCountText ?? null,
      channelAvatarUrl: short.channelAvatarUrl ?? null,
      isLive: false,
    }),
    [short],
  );
  const { state, like, dislike } = useVideoReactions(video, { channelId: short.channelId ?? null });

  const copyLink = () => {
    setMenuOpen(false);
    void navigator.clipboard?.writeText(`https://www.youtube.com/shorts/${short.id}`);
    showToast({ variant: "success", message: getString("shorts_link_copied") });
  };

  const notInterested = () => {
    setMenuOpen(false);
    void markNotInterested(
      short.id,
      short.title,
      short.channelName,
      short.channelId ?? short.id,
      null,
      null,
      false,
      true,
    ).catch(() => {});
    showToast({ variant: "success", message: getString("shorts_not_interested") });
  };

  return (
    <motion.div layout className="mb-4 flex w-[260px] flex-col items-start gap-5 lg:w-[280px]">
      <ActionButton
        ariaLabel="Like"
        active={state === "liked"}
        countText={likeCountText}
        onClick={like}
        icon={<ThumbsUp className="h-6 w-6" fill={state === "liked" ? "currentColor" : "none"} />}
      />
      <ActionButton
        ariaLabel="Dislike"
        active={state === "disliked"}
        countText={dislikeCountText}
        onClick={dislike}
        icon={<ThumbsDown className="h-6 w-6" fill={state === "disliked" ? "currentColor" : "none"} />}
      />
      <ActionButton
        ariaLabel="Comments"
        countText={resolvedCommentCountText}
        onClick={() => onRequestPanel("comments")}
        icon={<MessageCircle className="h-6 w-6" />}
      />
      <ActionButton
        ariaLabel="Share"
        countText="Share"
        onClick={copyLink}
        icon={<Share2 className="h-6 w-6" />}
      />

      <div className="relative">
        <ActionButton
          ariaLabel="More options"
          active={menuOpen}
          countText="More"
          onClick={() => setMenuOpen((open) => !open)}
          icon={<MoreVertical className="h-6 w-6" />}
        />
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-2 right-16 z-20 w-44 overflow-hidden rounded-xl border border-neutral-800 bg-surface-container-high py-1 shadow-2xl">
              <MenuItem onClick={notInterested}>{getString("shorts_menu_not_interested")}</MenuItem>
              <MenuItem onClick={copyLink}>{getString("shorts_menu_copy_link")}</MenuItem>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function ActionButton({
  icon,
  countText,
  active,
  ariaLabel,
  onClick,
}: {
  icon: ReactNode;
  countText?: string;
  active?: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        className={`flex h-14 w-14 items-center justify-center rounded-full border border-white/5 bg-white/10 text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/20 ${
          active ? "text-primary" : ""
        }`}
      >
        {icon}
      </button>
      <span className="mt-1 mb-2 h-4 text-xs font-semibold text-neutral-300 drop-shadow-md">
        {countText ?? ""}
      </span>
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-surface-container-highest"
    >
      {children}
    </button>
  );
}
