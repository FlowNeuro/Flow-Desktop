import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Outlet } from 'react-router-dom';

export function PageWrapper() {
  return (
    <div className="flex h-screen flex-col bg-background text-zinc-100 overflow-hidden font-sans">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
