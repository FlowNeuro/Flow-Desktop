import { cloneElement, ReactElement, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

type SidebarItemProps = {
  icon: ReactElement | ReactNode;
  label: string;
  isActive?: boolean;
  to?: string;
  end?: boolean;
  onClick?: () => void;
  rightElement?: ReactNode;
};

const baseClasses =
  'flex items-center gap-4 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors';
const idleClasses = 'text-chrome-neutral-200 hover:bg-surface-container-low';
const activeClasses = 'bg-surface-container text-chrome-white font-medium';

function renderIcon(icon: ReactElement | ReactNode) {
  if (icon && typeof icon === 'object' && 'type' in (icon as ReactElement)) {
    const el = icon as ReactElement<any>;
    if (typeof el.type === 'function' || typeof el.type === 'object') {
      return cloneElement(el, { className: 'w-5 h-5 shrink-0' });
    }
  }
  return icon;
}

export function SidebarItem({
  icon,
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
        <span className="grid h-6 w-6 shrink-0 place-items-center">
          {renderIcon(icon)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        {rightElement && <span className="ml-auto shrink-0">{rightElement}</span>}
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
        {renderIcon(icon)}
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-sm">{label}</span>
      {rightElement && <span className="ml-auto shrink-0">{rightElement}</span>}
    </button>
  );
}
