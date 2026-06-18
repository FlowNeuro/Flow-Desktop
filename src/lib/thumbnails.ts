export type ThumbnailQuality = "standard" | "large";

const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_THUMBNAIL_RE = /\/(vi(?:_webp)?)\/([a-zA-Z0-9_-]{11})\/([^/?#]+)/i;
const YOUTUBE_THUMBNAIL_HOST_RE = /(?:^|\.)ytimg\.com$|(?:^|\.)youtube\.com$/i;

export function isYoutubeVideoId(id?: string | null): id is string {
  return Boolean(id && YOUTUBE_VIDEO_ID.test(id));
}

export function youtubeThumbnailUrl(
  videoId: string,
  quality: ThumbnailQuality = "standard",
): string {
  const file = quality === "large" ? "maxresdefault" : "hq720";
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

  const targetFile = quality === "large" ? "maxresdefault" : "hq720";

  upgraded = upgraded.replace(
    /\/(vi(?:_webp)?)\/([a-zA-Z0-9_-]{11})\/(default|mqdefault|sddefault|hqdefault|hq720|maxresdefault)(?:\.\w+)?/i,
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

export function resolveYoutubeThumbnailCandidates(
  videoId?: string | null,
  fallbackUrl?: string | null,
): string[] {
  const raw = fallbackUrl?.trim();
  const resolvedId = isYoutubeVideoId(videoId)
    ? videoId
    : raw?.match(YOUTUBE_THUMBNAIL_RE)?.[2];

  const candidates: string[] = [];
  if (resolvedId) {
    candidates.push(
      youtubeThumbnailUrl(resolvedId, "large"),
      youtubeThumbnailUrl(resolvedId, "standard"),
      `https://i.ytimg.com/vi/${resolvedId}/hqdefault.jpg`,
    );
  }
  if (raw) {
    candidates.push(upgradeThumbnailUrl(raw, "standard"), raw);
  }
  return [...new Set(candidates.filter(Boolean))];
}

export function isUnavailableYoutubeThumbnail(img: HTMLImageElement): boolean {
  try {
    const url = new URL(img.currentSrc || img.src);
    if (!YOUTUBE_THUMBNAIL_HOST_RE.test(url.hostname)) return false;
  } catch {
    return false;
  }

  const width = img.naturalWidth;
  const height = img.naturalHeight;

  return width > 0 && height > 0 && width <= 160 && height <= 120;
}

export function upgradeMusicImageUrl(url: string | null | undefined, size = 1080): string | undefined {
  if (!url?.trim()) return undefined;
  let upgraded = url.trim();
  if (upgraded.startsWith("//")) upgraded = `https:${upgraded}`;

  const isGoogleCdn = upgraded.includes("googleusercontent.com") || upgraded.includes("ggpht.com");
  if (!isGoogleCdn) return upgraded;

  if (/w\d+-h\d+/.test(upgraded)) {
    return upgraded.replace(/w\d+-h\d+/, `w${size}-h${size}`);
  }
  const paramStart = upgraded.search(/=(?:w|s|h)\d*/);
  const base = paramStart >= 0 ? upgraded.slice(0, paramStart) : upgraded;
  return `${base}=w${size}-h${size}-p-l90-rj`;
}

export function upgradeAvatarUrl(url: string | null | undefined, size = 512): string | undefined {
  if (!url?.trim()) return undefined;
  let upgraded = url.trim();
  if (upgraded.startsWith("//")) upgraded = `https:${upgraded}`;

  const isGoogleCdn = upgraded.includes("googleusercontent.com") || upgraded.includes("ggpht.com");
  if (!isGoogleCdn) return upgraded;

  if (/w\d+-h\d+/.test(upgraded)) {
    return upgraded.replace(/w\d+-h\d+/, `s${size}`);
  }
  if (/=([wsh])\d+/.test(upgraded)) {
    return upgraded.replace(/=([wsh])\d+/, `=s${size}`);
  }
  const paramStart = upgraded.search(/=(?:w|s|h)/);
  const base = paramStart >= 0 ? upgraded.slice(0, paramStart) : upgraded;
  return `${base}=s${size}`;
}
