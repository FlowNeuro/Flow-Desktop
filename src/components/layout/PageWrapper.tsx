import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Outlet, useLocation } from 'react-router-dom';
import { useUiStore } from '../../store/useUiStore';

export function PageWrapper() {
  const location = useLocation();
  const { isWatchSidebarOpen, setWatchSidebarOpen } = useUiStore();
  const isWatchPage = location.pathname.startsWith('/watch/');
  const isPlaylistDetailsPage = location.pathname.startsWith('/playlist/');

  return (
    <div className="flex h-screen flex-col bg-background text-zinc-100 overflow-hidden font-sans">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main
          className={
            isPlaylistDetailsPage
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "flex-1 overflow-y-auto"
          }
        >
          <Outlet />
        </main>
      </div>
      {isWatchPage && isWatchSidebarOpen && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-50 flex">
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0 bg-black/60"
            onClick={() => setWatchSidebarOpen(false)}
          />
          <div className="relative h-full animate-sidebar-slide-in">
            <Sidebar mode="overlay" />
          </div>
        </div>
      )}
    </div>
  );
}
