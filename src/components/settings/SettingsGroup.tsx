import type { ReactNode } from 'react';

export interface SettingsGroupProps {
  title?: string;
  children: ReactNode;
}

export function SettingsGroup({ title, children }: SettingsGroupProps) {
  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-xs uppercase tracking-widest text-chrome-neutral-500 font-semibold px-1">
          {title}
        </h3>
      )}
      <div className="bg-surface-container-low rounded-2xl border border-chrome-neutral-800 flex flex-col divide-y divide-chrome-neutral-800/50 [&>*:first-child]:rounded-t-[15px] [&>*:last-child]:rounded-b-[15px]">
        {children}
      </div>
    </div>
  );
}
