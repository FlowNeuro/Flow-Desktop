import { useState, cloneElement, ReactElement } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Blocks,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Compass,
  Download,
  History,
  Home,
  ListVideo,
  Music2,
  Settings,
  ThumbsUp,
  Users,
  UserCircle,
} from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useSubscriptionStore } from '../../store/useSubscriptionStore';
import { SidebarItem } from '../ui/SidebarItem';
import { getString } from '../../lib/i18n/index';

const SUBS_DEFAULT_LIMIT = 7;

type SidebarProps = {
  mode?: 'normal' | 'overlay';
};

function CompactRailItem({
  path,
  icon,
  label,
  end,
}: {
  path: string;
  icon: ReactElement;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={path}
      end={end}
      className={({ isActive }) =>
        `flex h-[74px] w-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors ${
          isActive
            ? 'bg-surface-container text-white'
            : 'text-neutral-300 hover:bg-surface-container-low hover:text-white'
        }`
      }
    >
      {cloneElement(icon as ReactElement<any>, { className: 'h-6 w-6' })}
      <span className="max-w-full truncate px-1">{label}</span>
    </NavLink>
  );
}

function SectionHeader({
  label,
  to,
  onClick,
}: {
  label: string;
  to?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span>{label}</span>
      <ChevronRight className="w-4 h-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
    </>
  );

  if (to) {
    return (
      <NavLink
        to={to}
        onClick={onClick}
        className="group flex items-center gap-2 px-5 py-2 mt-2 text-base font-semibold text-neutral-100 cursor-pointer hover:bg-surface-container-low mx-2 rounded-lg"
      >
        {inner}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2 px-5 py-2 mt-2 text-base font-semibold text-neutral-100 cursor-pointer hover:bg-surface-container-low mx-2 rounded-lg"
    >
      {inner}
    </button>
  );
}

export function Sidebar({ mode = 'normal' }: SidebarProps) {
  const { isSidebarExpanded, setWatchSidebarOpen } = useUiStore();
  const { subscriptions } = useSubscriptionStore();
  const location = useLocation();
  const [subsExpanded, setSubsExpanded] = useState(false);

  const isOverlay = mode === 'overlay';
  const isExpanded = isOverlay || isSidebarExpanded;

  if (
    !isOverlay &&
    (location.pathname.startsWith('/watch/') ||
      location.pathname.startsWith('/settings'))
  ) {
    return null;
  }

  if (!isExpanded) {
    return (
      <aside className="hidden w-20 shrink-0 overflow-y-auto bg-background px-1.5 py-2 sm:flex">
        <nav className="flex w-full flex-col items-center gap-1">
          <CompactRailItem path="/" icon={<Home />} label={getString('home')} end />
          <CompactRailItem path="/feed" icon={<Compass />} label={getString('sidebar_flowneuron')} />
          <CompactRailItem path="/music" icon={<Music2 />} label={getString('sidebar_music')} />
          <CompactRailItem path="/subscriptions" icon={<Users />} label={getString('sidebar_subscriptions')} />
          <CompactRailItem path="/history" icon={<UserCircle />} label={getString('sidebar_you')} />
        </nav>
      </aside>
    );
  }

  const closeOverlay = isOverlay ? () => setWatchSidebarOpen(false) : undefined;
  const visibleSubs = subsExpanded
    ? subscriptions
    : subscriptions.slice(0, SUBS_DEFAULT_LIMIT);

  return (
    <aside
      className={`flex h-full w-64 shrink-0 flex-col overflow-y-auto hide-scrollbar bg-background py-3 ${
        isOverlay ? '' : 'hidden sm:flex'
      }`}
    >
      {/* Core */}
      <nav className="flex flex-col">
        <SidebarItem to="/" end icon={<Home />} label={getString('home')} onClick={closeOverlay} />
        <SidebarItem to="/feed" icon={<Compass />} label={getString('sidebar_flowneuron')} onClick={closeOverlay} />
        <SidebarItem to="/music" icon={<Music2 />} label={getString('sidebar_music')} onClick={closeOverlay} />
      </nav>

      <hr className="border-neutral-800/50 my-3 mx-4" />

      {/* Subscriptions */}
      <section>
        <SectionHeader label={getString('sidebar_subscriptions')} to="/subscriptions" onClick={closeOverlay} />
        <nav className="mt-1 flex flex-col">
          {visibleSubs.map((channel) => (
            <SidebarItem
              key={channel.id}
              to={`/channel/${channel.id}`}
              icon={
                channel.avatarUrl ? (
                  <img src={channel.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-surface-container-high" />
                )
              }
              label={channel.name}
              onClick={closeOverlay}
            />
          ))}
          {subscriptions.length > SUBS_DEFAULT_LIMIT && (
            <SidebarItem
              icon={subsExpanded ? <ChevronUp /> : <ChevronDown />}
              label={subsExpanded ? getString('sidebar_show_less') : getString('sidebar_show_more')}
              onClick={() => setSubsExpanded(!subsExpanded)}
            />
          )}
        </nav>
      </section>

      <hr className="border-neutral-800/50 my-3 mx-4" />

      {/* You */}
      <section>
        <SectionHeader label={getString('sidebar_you')} to="/history" onClick={closeOverlay} />
        <nav className="mt-1 flex flex-col">
          <SidebarItem to="/history" icon={<History />} label={getString('library_history_label')} onClick={closeOverlay} />
          <SidebarItem to="/playlists" icon={<ListVideo />} label={getString('library_playlists_label')} onClick={closeOverlay} />
          <SidebarItem to="/watch-later" icon={<Clock />} label={getString('library_watch_later_label')} onClick={closeOverlay} />
          <SidebarItem to="/liked" icon={<ThumbsUp />} label={getString('library_liked_videos_label')} onClick={closeOverlay} />
          <SidebarItem to="/downloads" icon={<Download />} label={getString('library_downloads_label')} onClick={closeOverlay} />
        </nav>
      </section>

      <hr className="border-neutral-800/50 my-3 mx-4" />

      {/* System */}
      <nav className="flex flex-col">
        <SidebarItem to="/settings" icon={<Settings />} label={getString('settings_title')} onClick={closeOverlay} />
        <SidebarItem to="/sponsorblock" icon={<Blocks />} label={getString('sidebar_extensions')} onClick={closeOverlay} />
      </nav>
    </aside>
  );
}
