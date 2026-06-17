import { invokeBackend } from "./errors";
import { isTauriEnv } from "./env";

// --------------------------------------------------------------------------------
// SponsorBlock
// --------------------------------------------------------------------------------

export interface SponsorBlockSegment {
  category: string;
  segment: [number, number];
  UUID: string;
}

export async function getSponsorBlockSegments(
  videoId: string,
  serverUrl?: string,
): Promise<SponsorBlockSegment[]> {
  if (!(await isTauriEnv())) {
    console.warn("Tauri not detected. Returning mock SponsorBlock segments.");
    return [
      {
        category: "sponsor",
        segment: [10, 25],
        UUID: "mock-sponsor-uuid-1",
      },
    ];
  }
  return invokeBackend<SponsorBlockSegment[]>("get_sponsorblock_segments", {
    videoId,
    serverUrl,
  });
}

// --------------------------------------------------------------------------------
// DeArrow
// --------------------------------------------------------------------------------

export interface DeArrowOverride {
  title: string | null;
  thumbnailUrl: string | null;
}

export async function getDeArrowOverride(videoId: string): Promise<DeArrowOverride | null> {
  if (!(await isTauriEnv())) return null;
  return invokeBackend<DeArrowOverride | null>("get_dearrow_override", { videoId });
}

// --------------------------------------------------------------------------------
// Return YouTube Dislike (RYD)
// --------------------------------------------------------------------------------

export interface RydData {
  id: string;
  dateCreated: string;
  likes: number;
  dislikes: number;
  rating: number;
  viewCount: number;
  deleted: boolean;
}

export async function getReturnYouTubeDislike(videoId: string): Promise<RydData | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`RYD API error: ${res.status}`);
    }
    const data = await res.json();
    return data as RydData;
  } catch (error) {
    console.warn("Failed to fetch RYD data", error);
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}
