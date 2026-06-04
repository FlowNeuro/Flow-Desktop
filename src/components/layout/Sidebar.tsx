import { cloneElement, ReactElement } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Blocks,
  Compass,
  FolderHeart,
  History,
  Home,
  Settings,
  UserCircle,
  Users,
} from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';

type SidebarProps = {
  mode?: "normal" | "overlay";
};

type NavItem = {
  path: string;
  label: string;
  icon: ReactElement;
  end?: boolean;
};

const primaryItems: NavItem[] = [
  { path: '/', label: 'Home', icon: <Home />, end: true },
  { path: '/feed', label: 'FlowNeuro', icon: <Compass /> },
  { path: '/subscriptions', label: 'Subscriptions', icon: <Users /> },
  { path: '/history', label: 'You', icon: <UserCircle /> },
];

const libraryItems: NavItem[] = [
  { path: '/history', label: 'History', icon: <History /> },
  { path: '/playlists', label: 'Playlists', icon: <FolderHeart /> },
];

const systemItems: NavItem[] = [
  { path: '/settings', label: 'Settings', icon: <Settings /> },
  { path: '/sponsorblock', label: 'Extensions', icon: <Blocks /> },
];

function NavIcon({ icon, className }: { icon: ReactElement; className: string }) {
  return cloneElement(icon as ReactElement<any>, { className });
}

function CompactRailItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.path}
      end={item.end}
      className={({ isActive }) =>
        `flex h-[74px] w-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors ${
          isActive
            ? 'bg-zinc-800 text-white'
            : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
        }`
      }
    >
      <NavIcon icon={item.icon} className="h-6 w-6" />
      <span className="max-w-full truncate px-1">{item.label}</span>
    </NavLink>
  );
}

function DrawerItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex h-12 items-center gap-6 rounded-xl px-4 text-[15px] font-medium transition-colors ${
          isActive
            ? 'bg-zinc-800 text-white'
            : 'text-zinc-100 hover:bg-zinc-900'
        }`
      }
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center">
        <NavIcon icon={item.icon} className="h-6 w-6" />
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
    </NavLink>
  );
}

export function Sidebar({ mode = "normal" }: SidebarProps) {
  const { isSidebarExpanded, setWatchSidebarOpen } = useUiStore();
  const location = useLocation();
  const isOverlay = mode === "overlay";
  const isExpanded = isOverlay || isSidebarExpanded;

  if (!isOverlay && (location.pathname.startsWith('/watch/') || location.pathname.startsWith('/settings'))) {
    return null;
  }

  if (!isExpanded) {
    return (
      <aside className="hidden w-20 shrink-0 overflow-y-auto border-r border-zinc-900 bg-background px-1.5 py-2 sm:flex">
        <nav className="flex w-full flex-col items-center gap-1">
          {primaryItems.map((item) => (
            <CompactRailItem key={item.path} item={item} />
          ))}
        </nav>
      </aside>
    );
  }

  const closeOverlay = isOverlay ? () => setWatchSidebarOpen(false) : undefined;

  return (
    <aside
      className={`flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-zinc-900 bg-background px-3 py-3 ${
        isOverlay ? '' : 'hidden sm:flex'
      }`}
    >
      <nav className="flex flex-col gap-1">
        {primaryItems.slice(0, 2).map((item) => (
          <DrawerItem key={item.path} item={item} onNavigate={closeOverlay} />
        ))}
      </nav>

      <div className="my-3 border-t border-zinc-900" />

      <section>
        <NavLink
          to="/subscriptions"
          onClick={closeOverlay}
          className={({ isActive }) =>
            `mb-1 flex h-12 items-center justify-between rounded-xl px-4 text-[15px] font-semibold transition-colors ${
              isActive ? 'bg-zinc-800 text-white' : 'text-zinc-100 hover:bg-zinc-900'
            }`
          }
        >
          <span>Subscriptions</span>
          <span className="text-xl leading-none text-zinc-400">›</span>
        </NavLink>
      </section>

      <div className="my-3 border-t border-zinc-900" />

      <section>
        <div className="mb-1 flex h-10 items-center gap-2 px-4 text-[16px] font-bold text-white">
          <span>You</span>
          <span className="text-xl leading-none text-zinc-400">›</span>
        </div>
        <nav className="flex flex-col gap-1">
          {libraryItems.map((item) => (
            <DrawerItem key={item.path} item={item} onNavigate={closeOverlay} />
          ))}
        </nav>
      </section>

      <div className="my-3 border-t border-zinc-900" />

      <nav className="flex flex-col gap-1">
        {systemItems.map((item) => (
          <DrawerItem key={item.path} item={item} onNavigate={closeOverlay} />
        ))}
      </nav>
    </aside>
  );
}
