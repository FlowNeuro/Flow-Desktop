import { InputHTMLAttributes } from 'react';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export function TextInput({ value, onChange, className = '', ...props }: TextInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-surface-container-high text-chrome-neutral-200 rounded-md px-3 py-1.5 border border-chrome-neutral-700 text-sm outline-none transition-colors duration-200 ease-out hover:border-chrome-neutral-600 focus:border-chrome-neutral-500 disabled:opacity-50 placeholder:text-chrome-neutral-500 ${className}`}
      {...props}
    />
  );
}
