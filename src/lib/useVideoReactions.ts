import { useEffect, useState } from "react";
import { logInteraction, markNotInterested } from "./api/recommendation";
import type { VideoSummary } from "../types/video";

export type ReactionState = "none" | "liked" | "disliked";

interface ReactionVideoMeta {
  description?: string | null;
  channelId?: string | null;
}

/**
 * Local like/dislike toggle for the active video. Reactions feed the neural
 * recommendation engine (LIKED / not-interested); un-toggling does not log.
 */
export function useVideoReactions(video: VideoSummary | null, videoMeta: ReactionVideoMeta | null) {
  const [state, setState] = useState<ReactionState>("none");

  useEffect(() => {
    setState("none");
  }, [video?.id]);

  const channelId = videoMeta?.channelId || video?.channelId || video?.id || "";
  const isShort = (video?.durationSeconds ?? 0) <= 60;

  const like = () => {
    if (!video) return;
    const next: ReactionState = state === "liked" ? "none" : "liked";
    setState(next);
    if (next !== "liked") return;
    void logInteraction(
      video.id,
      video.title,
      video.channelName,
      channelId,
      videoMeta?.description ?? null,
      video.durationSeconds ?? null,
      false,
      isShort,
      "LIKED",
      1,
    ).catch((err) => console.warn("Failed to log like", err));
  };

  const dislike = () => {
    if (!video) return;
    const next: ReactionState = state === "disliked" ? "none" : "disliked";
    setState(next);
    if (next !== "disliked") return;
    void markNotInterested(
      video.id,
      video.title,
      video.channelName,
      channelId,
      videoMeta?.description ?? null,
      video.durationSeconds ?? null,
      false,
      isShort,
    ).catch((err) => console.warn("Failed to log dislike", err));
  };

  return { state, like, dislike };
}
