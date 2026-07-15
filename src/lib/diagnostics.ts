import { invoke } from "@tauri-apps/api/core";

/**
 * App-wide diagnostics. Keeps a small in-memory ring buffer of recent events
 * (surfaced in the player's copyable report) and forwards failures to the
 * backend so they land in the persistent rolling log — the WebView console is
 * invisible in a packaged build. Never route secrets through here.
 */

const MAX_EVENTS = 300;

export interface DiagnosticEvent {
  at: string;
  scope: string;
  message: string;
}

const events: DiagnosticEvent[] = [];

export function recordDiagnostic(scope: string, message: string): void {
  events.push({ at: new Date().toISOString(), scope, message });
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

export function getDiagnosticEvents(): DiagnosticEvent[] {
  return events.slice();
}

export function clearDiagnosticEvents(): void {
  events.length = 0;
}

function inTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
      undefined ||
      (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== undefined)
  );
}

type LogLevel = "error" | "warn" | "info";

/**
 * Best-effort forward of a frontend event to the backend log. Never throws — a
 * diagnostics path must not become a new failure source.
 */
export async function logToBackend(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!inTauri()) return;
  try {
    await invoke("log_frontend_event", {
      level,
      message,
      context: context ? JSON.stringify(context) : null,
    });
  } catch {
    // Swallow: the WebView console still carries it in dev.
  }
}

let handlersInstalled = false;

/**
 * Installs process-wide handlers for otherwise-invisible failures: uncaught
 * errors and unhandled promise rejections. Both feed the ring buffer and the
 * backend log. Idempotent.
 */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled || typeof window === "undefined") return;
  handlersInstalled = true;

  window.addEventListener("error", (event) => {
    const detail = event.error?.stack ?? event.message ?? "Unknown error";
    recordDiagnostic("window.error", detail);
    void logToBackend("error", `window.error: ${event.message ?? detail}`, {
      stack: event.error?.stack,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as
      | { stack?: string; message?: string }
      | undefined;
    const detail = reason?.stack ?? reason?.message ?? String(event.reason ?? "unknown");
    recordDiagnostic("unhandledrejection", detail);
    void logToBackend("error", `unhandledrejection: ${detail}`, {
      stack: reason?.stack,
    });
  });
}

/**
 * Reports a fatal render error caught by the top-level ErrorBoundary.
 */
export function reportFatalError(error: Error, componentStack?: string): void {
  recordDiagnostic("react.error", `${error.name}: ${error.message}`);
  void logToBackend("error", `react.error: ${error.message}`, {
    stack: error.stack,
    componentStack,
  });
}
