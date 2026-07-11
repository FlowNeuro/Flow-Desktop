import { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tonal' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  disabled, 
  ...props 
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-200 ease-out focus:outline-none disabled:opacity-50 disabled:pointer-events-none';
  
  const variants = {
    primary: 'bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:opacity-90',
    secondary: 'bg-surface-container-high text-chrome-neutral-200 hover:bg-surface-container-highest',
    tonal: 'bg-surface-container-high text-chrome-neutral-200 hover:bg-surface-container-highest',
    outline: 'bg-transparent text-chrome-neutral-200 border border-chrome-neutral-800 hover:bg-surface-container-high',
    ghost: 'bg-transparent text-chrome-neutral-200 hover:bg-surface-container-high',
    destructive: 'bg-chrome-red-950/30 text-chrome-red-400 border border-chrome-red-900/50 hover:bg-chrome-red-950/50',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
