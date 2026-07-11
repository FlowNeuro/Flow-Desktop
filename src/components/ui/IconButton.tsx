import { ButtonHTMLAttributes } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function IconButton({
  children,
  variant = 'ghost',
  size = 'md',
  className = '',
  disabled,
  ...props
}: IconButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none';
  
  const variants = {
    primary: 'bg-primary text-chrome-white hover:bg-chrome-red-700',
    secondary: 'bg-surface text-chrome-zinc-100 border border-chrome-zinc-800 hover:bg-chrome-zinc-800',
    ghost: 'bg-transparent text-chrome-zinc-100 hover:bg-chrome-zinc-800',
  };

  const sizes = {
    sm: 'h-8 w-8 [&>svg]:w-4 [&>svg]:h-4',
    md: 'h-10 w-10 [&>svg]:w-5 [&>svg]:h-5',
    lg: 'h-12 w-12 [&>svg]:w-6 [&>svg]:h-6',
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
