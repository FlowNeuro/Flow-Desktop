import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useUiStore, type ToastVariant } from "../../store/useUiStore";

const toastIcons: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const toastIconStyles: Record<ToastVariant, string> = {
  success: "text-[var(--color-primary)]",
  error: "text-red-400",
  info: "text-neutral-300",
};

export function ToastHost() {
  const toast = useUiStore((state) => state.toast);
  const dismissToast = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(dismissToast, toast.durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [dismissToast, toast]);

  if (!toast) return null;

  const Icon = toastIcons[toast.variant];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[100] flex max-w-sm items-start gap-3 rounded-2xl border border-neutral-800 bg-surface-container-high px-4 py-3 text-sm text-neutral-100"
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${toastIconStyles[toast.variant]}`} />
      <div className="min-w-0">
        {toast.title ? (
          <p className="font-medium text-neutral-100">{toast.title}</p>
        ) : null}
        <p className="text-neutral-300">{toast.message}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={dismissToast}
        className="ml-1 rounded-full p-1 text-neutral-500 transition-colors hover:bg-surface-container-highest hover:text-neutral-200"
      >
        <X size={14} />
      </button>
    </div>
  );
}
