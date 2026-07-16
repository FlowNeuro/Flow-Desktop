import { useEffect, useRef } from "react";
import { useUpdaterStore } from "../../store/useUpdaterStore";
import { UpdateDialog } from "./UpdateDialog";

/**
 * Delay the startup check so it never competes with first paint or the initial
 * data loads — the update prompt is low priority relative to getting the app
 * usable.
 */
const STARTUP_CHECK_DELAY_MS = 4000;

/**
 * Runs a one-shot silent update check shortly after launch (when `enabled` and
 * the user hasn't disabled auto-checks) and hosts the global update dialog.
 * Mount once at the app root.
 */
export function UpdateManager({ enabled }: { enabled: boolean }) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const store = useUpdaterStore.getState();
      await store.loadPreferences();
      if (cancelled || !useUpdaterStore.getState().autoCheck) return;
      await store.checkForUpdates({ silent: true });
    }, STARTUP_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled]);

  return <UpdateDialog />;
}
