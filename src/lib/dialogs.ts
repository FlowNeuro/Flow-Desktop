import { isTauriEnv } from './api/env';

export async function pickFolder(title: string): Promise<string | null> {
  if (await isTauriEnv()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, title });
      return typeof selected === 'string' ? selected : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function pickSaveFile(
  title: string,
  defaultName: string,
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (await isTauriEnv()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const selected = await save({ title, defaultPath: defaultName, filters });
      return typeof selected === 'string' ? selected : null;
    } catch {
      return null;
    }
  }
  return null;
}
