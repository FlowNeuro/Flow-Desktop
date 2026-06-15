import { useState } from "react";
import { formatCount } from "../../lib/utils";
import { getString } from "../../lib/i18n/index";
import { linkifyText } from "../../lib/linkify";
import type { DescriptionCardProps } from "./types";

const formatViews = (views: string | number | null | undefined) =>
  views ? `${formatCount(views)} views` : "0 views";

export function DescriptionCard({ currentVideo, videoData }: DescriptionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const description = videoData?.description || "";
  const viewCount = videoData?.viewCountText || currentVideo.viewCountText || null;
  const published = videoData?.publishedText || currentVideo.publishedText || "";

  return (
    <div
      onClick={() => setExpanded((value) => !value)}
      className="cursor-pointer rounded-xl bg-surface-container-low p-4 text-sm transition-colors hover:bg-surface-container"
    >
      <div className="flex items-center gap-2 font-medium text-neutral-200">
        <span>{formatViews(viewCount)}</span>
        {published && <span className="text-neutral-400">{published}</span>}
      </div>

      <div className={`mt-2 whitespace-pre-wrap text-neutral-300 ${expanded ? "" : "line-clamp-3"}`}>
        {description ? linkifyText(description) : <span className="text-neutral-500">{getString("watch_no_description")}</span>}
      </div>

      {description && (
        <span className="mt-2 inline-block font-medium text-neutral-400">
          {expanded ? getString("watch_show_less") : getString("watch_show_more")}
        </span>
      )}
    </div>
  );
}
