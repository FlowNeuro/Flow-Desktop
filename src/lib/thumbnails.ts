export type ThumbnailQuality = "standard" | "large";

const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export function isYoutubeVideoId(id?: string | null): id is string {
  return Boolean(id && YOUTUBE_VIDEO_ID.test(id));
}

export function youtubeThumbnailUrl(
  videoId: string,
  quality: ThumbnailQuality = "standard",
): string {
  const file = quality === "large" ? "maxresdefault" : "hqdefault";
  return `https://i.ytimg.com/vi/${videoId}/${file}.jpg`;
}

/** Upgrade Innertube / cached URLs; prefer canonical i.ytimg.com when we have a video id. */
export function resolveVideoThumbnailUrl(
  videoId?: string | null,
  fallbackUrl?: string | null,
  quality: ThumbnailQuality = "standard",
): string | undefined {
  if (isYoutubeVideoId(videoId)) {
    return youtubeThumbnailUrl(videoId, quality);
  }

  if (!fallbackUrl?.trim()) return undefined;
  return upgradeThumbnailUrl(fallbackUrl, quality);
}

export function upgradeThumbnailUrl(
  url: string,
  quality: ThumbnailQuality = "standard",
): string {
  let upgraded = url.trim();
  if (upgraded.startsWith("//")) {
    upgraded = `https:${upgraded}`;
  }

  const targetFile = quality === "large" ? "maxresdefault" : "hqdefault";

  upgraded = upgraded.replace(
    /\/(vi(?:_webp)?)\/([a-zA-Z0-9_-]{11})\/(default|mqdefault|sddefault|hqdefault|maxresdefault)(?:\.\w+)?/i,
    `/vi/$2/${targetFile}.jpg`,
  );

  upgraded = upgraded.replace(
    /=w(\d+)-h(\d+)/,
    quality === "large" ? "=w1280-h720" : "=w640-h360",
  );

  return upgraded;
}

export function buildThumbnailSources(
  videoId?: string | null,
  fallbackUrl?: string | null,
  quality: ThumbnailQuality = "standard",
) {
  const hqFallback = isYoutubeVideoId(videoId)
    ? youtubeThumbnailUrl(videoId, "standard")
    : fallbackUrl
      ? upgradeThumbnailUrl(fallbackUrl, "standard")
      : undefined;

  const primary = resolveVideoThumbnailUrl(videoId, fallbackUrl, quality) ?? hqFallback;

  return {
    primary,
    fallback: hqFallback ?? primary,
  };
}
