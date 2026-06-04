import type { ReactNode } from 'react';

export interface SettingsGroupProps {
  title?: string;
  children: ReactNode;
}

export function SettingsGroup({ title, children }: SettingsGroupProps) {
  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-xs uppercase tracking-widest text-neutral-500 font-semibold px-1">
          {title}
        </h3>
      )}
      <div className="bg-surface-container-low rounded-2xl border border-neutral-800 overflow-hidden flex flex-col divide-y divide-neutral-800/50">
        {children}
      </div>
    </div>
  );
}
