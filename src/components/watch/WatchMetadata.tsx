import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ThumbsUp, ThumbsDown, Share2, Bookmark, Download, WandSparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { SubscribeButton } from "../ui/SubscribeButton";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useVideoReactions } from "../../lib/useVideoReactions";
import { formatCount } from "../../lib/utils";
import { getString } from "../../lib/i18n/index";
import type { WatchMetadataProps } from "./types";

export function WatchMetadata({
  currentVideo,
  videoData,
  channelDetails,
  dearrowData,
  rydData,
}: WatchMetadataProps) {
  const navigate = useNavigate();
  const dearrowEnabled = useSettingsStore((s) => s.dearrowEnabled);
  const dearrowBadgeEnabled = useSettingsStore((s) => s.dearrowBadgeEnabled);
  const rytdEnabled = useSettingsStore((s) => s.rytdEnabled);
  const reactions = useVideoReactions(currentVideo, videoData);
  const [showingOriginal, setShowingOriginal] = useState(false);

  const channelId = videoData?.channelId || currentVideo.channelId || channelDetails?.id || "";
  const channelName =
    videoData?.channelName || currentVideo.channelName || channelDetails?.name || getString("watch_unknown_channel");
  const avatarUrl = channelDetails?.avatarUrl || null;
  const subscriberText = channelDetails?.subscriberCountText || "";

  const dearrowTitle = dearrowEnabled ? dearrowData?.title ?? null : null;
  const primaryTitle = dearrowTitle ?? currentVideo.title;
  const canCrossfade = !!dearrowTitle && dearrowTitle !== currentVideo.title;
  const showBadge = !!dearrowTitle && dearrowBadgeEnabled;

  const goToChannel = () => {
    if (channelId) navigate(`/channel/${channelId}`);
  };

  const likeLabel =
    rytdEnabled && rydData
      ? formatCount(rydData.likes)
      : videoData?.likeCountText
      ? formatCount(videoData.likeCountText)
      : getString("like");
  const dislikeLabel = rytdEnabled && rydData ? formatCount(rydData.dislikes) : getString("watch_dislike");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        {canCrossfade ? (
          <h1
            onMouseEnter={() => setShowingOriginal(true)}
            onMouseLeave={() => setShowingOriginal(false)}
            className="grid cursor-default text-xl font-bold leading-snug tracking-tight text-neutral-100"
          >
            <span
              className={`col-start-1 row-start-1 transition-opacity duration-200 ease-out ${
                showingOriginal ? "opacity-0" : "opacity-100"
              }`}
            >
              {primaryTitle}
            </span>
            <span
              aria-hidden
              className={`col-start-1 row-start-1 transition-opacity duration-200 ease-out ${
                showingOriginal ? "opacity-100" : "opacity-0"
              }`}
            >
              {currentVideo.title}
            </span>
          </h1>
        ) : (
          <h1 className="text-xl font-bold leading-snug tracking-tight text-neutral-100">{primaryTitle}</h1>
        )}
        {showBadge && (
          <span title={getString("watch_dearrow_badge_hint")} className="mt-1 shrink-0 text-primary/70">
            <WandSparkles size={16} />
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={goToChannel}
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high font-bold text-neutral-400 transition-opacity hover:opacity-80"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={channelName} className="h-full w-full object-cover" />
            ) : (
              channelName.charAt(0).toUpperCase()
            )}
          </button>
          <button onClick={goToChannel} className="min-w-0 pr-2 text-left">
            <span className="block truncate text-[15px] font-medium leading-tight text-neutral-100 transition-colors hover:text-primary">
              {channelName}
            </span>
            {subscriberText && <span className="block text-sm text-neutral-400">{subscriberText}</span>}
          </button>
          {channelId && (
            <SubscribeButton channelId={channelId} channelName={channelName} avatarUrl={avatarUrl || undefined} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center divide-x divide-neutral-800 overflow-hidden rounded-full bg-surface-container-low">
            <button
              onClick={reactions.like}
              aria-pressed={reactions.state === "liked"}
              className={`flex h-full items-center gap-2 px-4 text-sm font-medium transition-colors hover:bg-surface-container ${
                reactions.state === "liked" ? "text-white" : "text-neutral-200"
              }`}
            >
              <ThumbsUp size={18} fill={reactions.state === "liked" ? "currentColor" : "none"} />
              <span>{likeLabel}</span>
            </button>
            <button
              onClick={reactions.dislike}
              aria-pressed={reactions.state === "disliked"}
              className={`flex h-full items-center gap-2 px-4 text-sm font-medium transition-colors hover:bg-surface-container ${
                reactions.state === "disliked" ? "text-white" : "text-neutral-200"
              }`}
            >
              <ThumbsDown size={18} fill={reactions.state === "disliked" ? "currentColor" : "none"} />
              <span>{dislikeLabel}</span>
            </button>
          </div>

          <Button variant="tonal">
            <Share2 size={18} />
            {getString("share")}
          </Button>
          <Button variant="tonal">
            <Bookmark size={18} />
            {getString("save")}
          </Button>
          <Button variant="tonal">
            <Download size={18} />
            {getString("download")}
          </Button>
        </div>
      </div>
    </div>
  );
}
