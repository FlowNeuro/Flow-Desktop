import { useEffect } from "react";
import { getDeepFlowRemainingMs, setDeepFlowEnabled } from "../../lib/deepFlow";
import { SETTINGS } from "../../lib/settings/schema";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";

export function DeepFlowController() {
  const active = useAppSettingsStore((state) => state.values[SETTINGS.DEEP_FLOW_ACTIVE] === "true");
  const activatedAt = useAppSettingsStore((state) => Number(state.values[SETTINGS.DEEP_FLOW_ACTIVATED_AT] ?? "0"));
  const expireHours = useAppSettingsStore((state) => Number(state.values[SETTINGS.DEEP_FLOW_EXPIRE_HOURS] ?? "4"));

  useEffect(() => {
    const remainingMs = getDeepFlowRemainingMs(active, activatedAt, expireHours);
    if (!active || remainingMs === null) return;

    if (remainingMs <= 0) {
      void setDeepFlowEnabled(false, "timer");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void setDeepFlowEnabled(false, "timer");
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [active, activatedAt, expireHours]);

  return null;
}
