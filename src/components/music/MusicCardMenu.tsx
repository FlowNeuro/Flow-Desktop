import React, { useCallback, useRef, useState } from 'react';
import { AnchoredPortalMenu, type MenuAnchor } from '../ui/AnchoredPortalMenu';

export type MusicMenuAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void | Promise<void>;
};

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function useMusicContextMenu(enabled = true) {
  const [showMenu, setShowMenu] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setShowMenu(false), []);

  const openMenuFromDots = useCallback(
    (event: React.MouseEvent) => {
      if (!enabled) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setAnchor({ top: rect.bottom + 4, right: rect.right });
      setShowMenu((current) => !current);
    },
    [enabled],
  );

  const openMenuFromContext = useCallback(
    (event: React.MouseEvent) => {
      if (!enabled) return;
      event.preventDefault();
      event.stopPropagation();
      setAnchor({ top: event.clientY, left: event.clientX });
      setShowMenu(true);
    },
    [enabled],
  );

  return {
    cardRef,
    closeMenu,
    anchor,
    openMenuFromContext,
    openMenuFromDots,
    showMenu,
  };
}

export function MusicCardMenu({
  actions,
  anchor,
  className,
  onClose,
  show,
}: {
  actions: MusicMenuAction[];
  anchor: MenuAnchor | null;
  className?: string;
  onClose: () => void;
  show: boolean;
}) {
  if (!show || !anchor || actions.length === 0) return null;

  return (
    <AnchoredPortalMenu
      anchor={anchor}
      onClose={onClose}
      className={cx(
        'z-[70] w-52 rounded-xl border border-chrome-neutral-800 bg-surface-container-high py-1.5',
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
          className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm text-chrome-zinc-300 transition-colors hover:bg-chrome-zinc-800 hover:text-chrome-zinc-100"
        >
          <span className="grid h-4 w-4 shrink-0 place-items-center text-chrome-zinc-400">{action.icon}</span>
          <span className="min-w-0 flex-1 truncate">{action.label}</span>
        </button>
      ))}
    </AnchoredPortalMenu>
  );
}
