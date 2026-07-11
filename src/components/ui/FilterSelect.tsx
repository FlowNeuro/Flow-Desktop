import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface FilterSelectOption<T extends string> {
  value: T;
  label: string;
}

export interface FilterSelectProps<T extends string> {
  label?: string;
  value: T;
  options: FilterSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}


export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: FilterSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className={cx('relative shrink-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-chrome-neutral-800 bg-surface-container-high px-3 text-sm text-neutral-00 transition-colors duration-200 ease-out hover:bg-surface-container-highest focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        {label && <span className="text-chrome-neutral-500">{label}:</span>}
        <span className="font-medium">{current?.label}</span>
        <ChevronDown
          className={cx('h-4 w-4 text-chrome-neutral-400 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-40 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-chrome-neutral-800 bg-surface-container-high py-1.5"
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
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-sm text-chrome-neutral-300 transition-colors duration-200 ease-out hover:bg-surface-container-highest hover:text-chrome-neutral-100"
              >
                <span className={active ? 'text-chrome-neutral-100' : undefined}>{o.label}</span>
                {active && <Check className="h-4 w-4 text-[var(--color-primary)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FilterSelect;
