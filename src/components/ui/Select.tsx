import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Select({ value, onChange, options, disabled, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);

    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 240;
      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }

    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className={cx('relative shrink-0', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-10 w-full items-center justify-between gap-1.5 rounded-lg border border-neutral-800 bg-surface-container-high px-3 text-sm text-neutral-100 transition-colors duration-200 ease-out hover:bg-surface-container-highest focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="font-medium">{current?.label}</span>
        <ChevronDown
          className={cx('h-4 w-4 text-neutral-400 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cx(
            'absolute right-0 z-50 max-h-60 min-w-[12rem] overflow-y-auto rounded-xl border border-neutral-800 bg-surface-container-high py-1.5',
            openUp ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-sm text-neutral-300 transition-colors duration-200 ease-out hover:bg-surface-container-highest hover:text-neutral-100"
              >
                <span className={active ? 'text-neutral-100' : undefined}>{o.label}</span>
                {active && <Check className="h-4 w-4 text-[var(--color-primary)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
