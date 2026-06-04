import { isTauriEnv } from './api/env';

export async function openExternal(url: string) {
  if (await isTauriEnv()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch {}
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
