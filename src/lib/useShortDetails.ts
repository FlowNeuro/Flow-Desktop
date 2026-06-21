import { useEffect, useState } from "react";
import { getVideoDetails } from "./api/youtube";
import type { VideoDetails } from "../types/video";

export function useShortDetails(videoId: string, enabled: boolean) {
  const [details, setDetails] = useState<VideoDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    getVideoDetails(videoId)
      .then((result) => !cancelled && setDetails(result))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled, videoId]);

  return { details, loading };
}
