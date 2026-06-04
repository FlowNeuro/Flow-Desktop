import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildThumbnailSources,
  type ThumbnailQuality,
} from "./thumbnails";

export function useVideoThumbnail(
  videoId?: string | null,
  fallbackUrl?: string | null,
  quality: ThumbnailQuality = "standard",
) {
  const sources = useMemo(
    () => buildThumbnailSources(videoId, fallbackUrl, quality),
    [videoId, fallbackUrl, quality],
  );

  const [src, setSrc] = useState(sources.primary);

  useEffect(() => {
    setSrc(sources.primary);
  }, [sources.primary]);

  const onError = useCallback(() => {
    setSrc((current) => (
      sources.fallback && current !== sources.fallback
        ? sources.fallback
        : current
    ));
  }, [sources.fallback]);

  return { src, onError };
}
