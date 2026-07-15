import { invokeBackend } from "./errors";

/** Returns the tail of the persisted backend rolling log files as plain text. */
export function readLogs(): Promise<string> {
  return invokeBackend<string>("read_logs");
}

/** Deletes rolled log files and truncates the active one. */
export function clearLogs(): Promise<void> {
  return invokeBackend<void>("clear_logs");
}
