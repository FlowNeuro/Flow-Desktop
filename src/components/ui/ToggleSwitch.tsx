export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-[var(--color-primary)]' : 'bg-chrome-neutral-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-on-primary transition-transform duration-200 ease-out ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
