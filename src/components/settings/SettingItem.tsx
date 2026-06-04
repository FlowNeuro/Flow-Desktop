import type { ReactNode } from 'react';

export interface SettingItemProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingItem({ title, description, children }: SettingItemProps) {
  return (
    <div className="flex justify-between items-center px-5 py-4 hover:bg-surface-container transition-colors duration-200 ease-out">
      <div className="flex-1 min-w-0 mr-4">
        <div className="text-sm font-medium text-neutral-200">{title}</div>
        {description && (
          <div className="text-xs text-neutral-400 mt-0.5">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
