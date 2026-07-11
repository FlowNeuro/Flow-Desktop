import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

type SidebarItemProps = {
  icon: ReactNode;
  activeIcon?: ReactNode;
  label: string;
  isActive?: boolean;
  to?: string;
  end?: boolean;
  onClick?: () => void;
  rightElement?: ReactNode;
};

const baseClasses =
  'flex items-center gap-4 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors';
const idleClasses = 'text-chrome-neutral-300 hover:bg-surface-container-low hover:text-chrome-neutral-100';
const activeClasses = 'text-[var(--color-primary)] font-medium';

export function SidebarItem({
  icon,
  activeIcon,
  label,
  isActive,
  to,
  end,
  onClick,
  rightElement,
}: SidebarItemProps) {
  if (to) {
    return (
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        className={({ isActive: navActive }) => {
          const active = isActive ?? navActive;
          return `${baseClasses} ${active ? activeClasses : idleClasses}`;
        }}
      >
        {({ isActive: navActive }) => {
          const active = isActive ?? navActive;
          return (
            <>
              <span className="grid h-6 w-6 shrink-0 place-items-center">
                {active ? (activeIcon ?? icon) : icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
              {rightElement && <span className="ml-auto shrink-0">{rightElement}</span>}
            </>
          );
        }}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} w-full ${isActive ? activeClasses : idleClasses}`}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center">
        {isActive ? (activeIcon ?? icon) : icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-sm">{label}</span>
      {rightElement && <span className="ml-auto shrink-0">{rightElement}</span>}
    </button>
  );
}
