import React, { useCallback, useEffect, useRef, useState } from 'react';

export type MusicMenuAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void | Promise<void>;
};

type MenuPosition = { x: number; y: number } | null;

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function useMusicContextMenu(enabled = true) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setShowMenu(false), []);

  const openMenuFromDots = useCallback(
    (event: React.MouseEvent) => {
      if (!enabled) return;
      event.preventDefault();
      event.stopPropagation();
      setMenuPosition(null);
      setShowMenu((current) => !current);
    },
    [enabled],
  );

  const openMenuFromContext = useCallback(
    (event: React.MouseEvent) => {
      if (!enabled) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = cardRef.current?.getBoundingClientRect();
      setMenuPosition(rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      setShowMenu(true);
    },
    [enabled],
  );

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closeMenu, showMenu]);

  return {
    cardRef,
    closeMenu,
    menuPosition,
    menuRef,
    openMenuFromContext,
    openMenuFromDots,
    showMenu,
  };
}

export function MusicCardMenu({
  actions,
  className,
  menuPosition,
  menuRef,
  onClose,
  show,
}: {
  actions: MusicMenuAction[];
  className?: string;
  menuPosition: MenuPosition;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  show: boolean;
}) {
  if (!show || actions.length === 0) return null;

  const positionStyle: React.CSSProperties = menuPosition
    ? { position: 'absolute', left: menuPosition.x, top: menuPosition.y, right: 'auto' }
    : { position: 'absolute', right: 0, top: 34 };

  return (
    <div
      ref={menuRef}
      style={positionStyle}
      onContextMenu={(event) => event.preventDefault()}
      className={cx(
        'z-50 w-52 rounded-xl border border-neutral-800 bg-surface-container-high py-1.5',
        className,
      )}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void action.onSelect();
            onClose();
          }}
          className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          <span className="grid h-4 w-4 shrink-0 place-items-center text-zinc-400">{action.icon}</span>
          <span className="min-w-0 flex-1 truncate">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

