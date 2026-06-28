import { getSetting, setSetting } from "./api/db";

export const DONATION_PROMPT_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
export const DONATION_PROMPT_INTERVAL_MS = 75 * 24 * 60 * 60 * 1000; // 75 days
export const DONATION_PROMPT_SHOW_DELAY_MS = 1_500;

const KEY_FIRST_LAUNCH = "donation_first_launch_time";
const KEY_LAST_SHOWN = "donation_prompt_last_shown_time";
const KEY_DISABLED = "donation_prompt_disabled";

async function readTimestamp(key: string): Promise<number> {
  try {
    const raw = await getSetting(key);
    const parsed = raw == null ? 0 : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (error) {
    console.warn(`Failed to read donation prompt key ${key}`, error);
    return 0;
  }
}

async function writeTimestamp(key: string, value: number): Promise<void> {
  try {
    await setSetting(key, String(value));
  } catch (error) {
    console.warn(`Failed to persist donation prompt key ${key}`, error);
  }
}

export async function evaluateDonationPrompt(now = Date.now()): Promise<boolean> {
  try {
    if ((await getSetting(KEY_DISABLED)) === "true") return false;
  } catch (error) {
    console.warn("Failed to read donation prompt disabled flag", error);
    return false;
  }

  const firstLaunch = await readTimestamp(KEY_FIRST_LAUNCH);
  if (firstLaunch === 0) {
    await writeTimestamp(KEY_FIRST_LAUNCH, now);
    return false;
  }
  if (now - firstLaunch < DONATION_PROMPT_GRACE_MS) return false;

  const lastShown = await readTimestamp(KEY_LAST_SHOWN);
  if (lastShown !== 0 && now - lastShown < DONATION_PROMPT_INTERVAL_MS) return false;

  await writeTimestamp(KEY_LAST_SHOWN, now);
  return true;
}

export async function markDonationPromptShown(now = Date.now()): Promise<void> {
  await writeTimestamp(KEY_LAST_SHOWN, now);
}

export async function disableDonationPrompt(): Promise<void> {
  try {
    await setSetting(KEY_DISABLED, "true");
  } catch (error) {
    console.warn("Failed to persist donation prompt disabled flag", error);
  }
}
