import { isTauriEnv } from "./env";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

export type { Update } from "@tauri-apps/plugin-updater";

/**
 * Asks the Tauri updater whether a newer signed build is published. It reads the
 * `latest.json` endpoint configured in `tauri.conf.json` (served from the latest
 * GitHub release) and verifies the release signature against the bundled public
 * key. Returns the pending `Update` handle when one is available, or `null` when
 * already up to date. Resolves to `null` in the browser dev shell.
 *
 * Throws when the updater is unreachable or misconfigured, so callers decide
 * whether to surface the failure (manual check) or swallow it (startup check).
 */
export async function checkForAppUpdate(): Promise<Update | null> {
  if (!(await isTauriEnv())) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  return check();
}

/**
 * Downloads and installs a pending update, reporting progress as a 0..1 fraction
 * — or `null` while indeterminate (the server omitted a Content-Length). The
 * signature is verified by the plugin before the bytes are applied.
 */
export async function downloadAndInstallUpdate(
  update: Update,
  onProgress: (fraction: number | null) => void,
): Promise<void> {
  let total = 0;
  let downloaded = 0;

  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        downloaded = 0;
        onProgress(total > 0 ? 0 : null);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress(total > 0 ? Math.min(downloaded / total, 1) : null);
        break;
      case "Finished":
        onProgress(1);
        break;
    }
  });
}

/** Relaunches the app into the freshly installed build. */
export async function relaunchApp(): Promise<void> {
  if (!(await isTauriEnv())) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
