import { ButtonHTMLAttributes } from 'react';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Chip({
  children,
  active = false,
  className = '',
  ...props
}: ChipProps) {
  // Pill-shaped chips (rounded-full) for categories.
  const baseStyles = 'inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-full transition-colors focus:outline-none whitespace-nowrap';
  
  const activeStyles = active 
    ? 'bg-chrome-zinc-100 text-chrome-zinc-950 hover:bg-chrome-zinc-200' 
    : 'bg-surface text-chrome-zinc-200 border border-chrome-zinc-800 hover:bg-chrome-zinc-800';

  return (
    <button
      className={`${baseStyles} ${activeStyles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
