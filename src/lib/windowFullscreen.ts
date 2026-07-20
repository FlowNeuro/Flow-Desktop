import { invoke } from "@tauri-apps/api/core";
import { logToBackend } from "./diagnostics";

export interface WindowFullscreenController {
  sync(fullscreen: boolean): Promise<void>;
}

type SetNativeFullscreen = (fullscreen: boolean) => Promise<void>;

function setNativeFullscreen(fullscreen: boolean): Promise<void> {
  return invoke("set_player_fullscreen", { fullscreen });
}

/**
 * Serializes native fullscreen transitions so a late enter cannot overwrite a
 * newer exit. Tauri/Tao owns the native window placement; callers must not
 * unmaximize or resize the window around these transitions.
 */
export function createWindowFullscreenController(
  applyNativeFullscreen: SetNativeFullscreen = setNativeFullscreen,
): WindowFullscreenController {
  let desiredFullscreen = false;
  let appliedFullscreen = false;
  let pendingTransition = Promise.resolve();

  const sync = (fullscreen: boolean): Promise<void> => {
    desiredFullscreen = fullscreen;

    const transition = pendingTransition
      .then(async () => {
        if (desiredFullscreen !== fullscreen || appliedFullscreen === fullscreen) {
          return;
        }

        await applyNativeFullscreen(fullscreen);
        appliedFullscreen = fullscreen;
        void logToBackend("info", "window fullscreen sync", { fullscreen });
      })
      .catch((cause) => {
        void logToBackend("warn", "window fullscreen sync failed", {
          fullscreen,
          cause: String(cause),
        });
      });

    pendingTransition = transition;
    return transition;
  };

  return { sync };
}
