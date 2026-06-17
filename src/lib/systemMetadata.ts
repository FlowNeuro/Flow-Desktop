import { isTauriEnv } from "./api/env";

export interface SystemMetadata {
  platform: string;
  osType: string;
  osVersion: string;
  family: string;
  arch: string;
  locale: string;
  display: string;
  userAgent: string;
  source: "tauri-os" | "browser-fallback";
}

const unknown = "unknown";

const getBrowserDisplay = () => {
  if (typeof window === "undefined" || !window.screen) return unknown;
  const { width, height } = window.screen;
  return width > 0 && height > 0 ? `${width}x${height}` : unknown;
};

const getBrowserFallbackMetadata = (): SystemMetadata => ({
  platform: typeof navigator !== "undefined" ? navigator.platform || unknown : unknown,
  osType: "browser",
  osVersion: unknown,
  family: "browser",
  arch: unknown,
  locale: typeof navigator !== "undefined" ? navigator.language || unknown : unknown,
  display: getBrowserDisplay(),
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent || unknown : unknown,
  source: "browser-fallback",
});

let cachedMetadata: SystemMetadata | null = null;

export async function getSystemMetadata(): Promise<SystemMetadata> {
  if (cachedMetadata) return cachedMetadata;

  const fallback = getBrowserFallbackMetadata();
  if (!(await isTauriEnv())) {
    cachedMetadata = fallback;
    return cachedMetadata;
  }

  try {
    const os = await import("@tauri-apps/plugin-os");
    cachedMetadata = {
      platform: os.platform(),
      osType: os.type(),
      osVersion: os.version(),
      family: os.family(),
      arch: os.arch(),
      locale: (await os.locale()) ?? fallback.locale,
      display: fallback.display,
      userAgent: fallback.userAgent,
      source: "tauri-os",
    };
    return cachedMetadata;
  } catch {
    cachedMetadata = fallback;
    return cachedMetadata;
  }
}
