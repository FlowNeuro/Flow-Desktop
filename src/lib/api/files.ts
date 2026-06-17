import { invokeBackend } from "./errors";

export async function writeBackupFile(path: string, contents: string): Promise<void> {
  return invokeBackend<void>("write_backup_file", { path, contents });
}
