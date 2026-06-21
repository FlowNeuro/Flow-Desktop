import { useMemo, useState, type ReactNode } from "react";
import { MessageCircle, MoreVertical, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useVideoReactions } from "../../lib/useVideoReactions";
import { useProxiedImageUrl } from "../../lib/useProxiedImageUrl";
import { useUiStore } from "../../store/useUiStore";
import { markNotInterested } from "../../lib/api/recommendation";
import { getString } from "../../lib/i18n/index";
import type { ShortItem, ShortsPanelState } from "../../types/shorts";
import type { VideoSummary } from "../../types/video";

interface ShortActionBarProps {
  short: ShortItem;
  onRequestPanel: (panel: ShortsPanelState) => void;
}

export function ShortActionBar({ short, onRequestPanel }: ShortActionBarProps) {
  const showToast = useUiStore((s) => s.showToast);
  const avatar = useProxiedImageUrl(short.channelAvatarUrl ?? undefined);
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div className="absolute bottom-6 right-4 z-20 flex flex-col items-center gap-5">
      <ActionButton
        ariaLabel="Like"
        active={state === "liked"}
        label={short.likeCountText ?? undefined}
        onClick={like}
        icon={<ThumbsUp className="h-6 w-6" fill={state === "liked" ? "currentColor" : "none"} />}
      />
      <ActionButton
        ariaLabel="Dislike"
        active={state === "disliked"}
        onClick={dislike}
        icon={<ThumbsDown className="h-6 w-6" fill={state === "disliked" ? "currentColor" : "none"} />}
      />
      <ActionButton
        ariaLabel="Comments"
        label={short.commentCountText ?? undefined}
        onClick={() => onRequestPanel("comments")}
        icon={<MessageCircle className="h-6 w-6" />}
      />
      <ActionButton ariaLabel="Share" onClick={copyLink} icon={<Share2 className="h-6 w-6" />} />

      <div className="relative">
        <ActionButton
          ariaLabel="More options"
          active={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          icon={<MoreVertical className="h-6 w-6" />}
        />
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute bottom-0 right-14 z-20 w-44 overflow-hidden rounded-xl border border-neutral-800 bg-surface-container-high py-1">
              <MenuItem onClick={notInterested}>{getString("shorts_menu_not_interested")}</MenuItem>
              <MenuItem onClick={copyLink}>{getString("shorts_menu_copy_link")}</MenuItem>
            </div>
          </>
        )}
      </div>

      <div className="h-12 w-12 overflow-hidden rounded-lg border border-white/10 bg-surface-container-high">
        {avatar && <img src={avatar} alt="" className="h-full w-full object-cover" />}
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  active,
  ariaLabel,
  onClick,
}: {
  icon: ReactNode;
  label?: string;
  active?: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        className={`flex h-12 w-12 items-center justify-center rounded-full bg-black/55 transition-colors duration-200 ease-out hover:bg-black/75 ${
          active ? "text-primary" : "text-white"
        }`}
      >
        {icon}
      </button>
      {label && <span className="text-xs font-medium text-white">{label}</span>}
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
