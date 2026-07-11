import { getString } from '../../lib/i18n/index';
import type { ScanProgress } from '../../lib/useSubscriptionFeed';

export interface ScanProgressBarProps {
  progress: ScanProgress;
}

export function ScanProgressBar({ progress }: ScanProgressBarProps) {
  const total = Math.max(progress.total, 1);
  const processed = Math.min(progress.processed, total);
  const percent = Math.min(100, Math.max(0, Math.round((processed / total) * 100)));

  return (
    <div className="flex flex-col gap-2 py-3" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={processed}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-chrome-neutral-500">
          {getString('subscriptions_scanning')}
        </span>
        <span className="font-mono text-xs text-chrome-neutral-400">
          {processed}/{total}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
