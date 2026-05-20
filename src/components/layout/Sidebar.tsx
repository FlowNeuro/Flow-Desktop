import { cloneElement, ReactElement } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Compass, Users, History, FolderHeart, Settings, Shield } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';

export function Sidebar() {
  const { isSidebarExpanded } = useUiStore();
  const location = useLocation();
  
  if (location.pathname.startsWith('/watch/')) {
    return null;
  }

  const navItems = [
    { section: 'Core', items: [
      { path: '/', label: 'Home', icon: <Home /> },
      { path: '/feed', label: 'FlowNeuro', icon: <Compass /> },
      { path: '/subscriptions', label: 'Subscriptions', icon: <Users /> },
    ]},
    { section: 'You', items: [
      { path: '/history', label: 'History', icon: <History /> },
      { path: '/playlists', label: 'Local Playlists', icon: <FolderHeart /> },
    ]},
    { section: 'System', items: [
      { path: '/settings', label: 'Settings', icon: <Settings /> },
      { path: '/sponsorblock', label: 'SponsorBlock', icon: <Shield /> },
    ]}
  ];

  return (
    <aside 
      className={`flex flex-col shrink-0 bg-background overflow-y-auto border-r border-zinc-800 transition-all duration-300 ease-in-out hidden sm:flex ${
        isSidebarExpanded ? 'w-60 px-3 py-4' : 'w-[72px] px-2 py-4'
      }`}
    >
      {navItems.map((section, idx) => (
        <div 
          key={section.section} 
          className={`transition-all duration-300 ${
            idx !== 0 ? 'mt-4 border-t border-zinc-800/60 pt-4' : ''
          }`}
        >
          {section.section !== 'Core' && (
            <h3 
              className={`mb-2 px-3 text-[10px] font-extrabold tracking-wider uppercase text-zinc-500 transition-all duration-300 origin-left ${
                isSidebarExpanded 
                  ? 'opacity-100 h-auto scale-100' 
                  : 'opacity-0 h-0 scale-95 overflow-hidden my-0 py-0 border-none'
              }`}
            >
              {section.section}
            </h3>
          )}
          
          <nav className="flex flex-col space-y-1.5">
            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => 
                  `flex items-center rounded-xl py-2.5 transition-all duration-300 ease-in-out group ${
                    isSidebarExpanded ? 'px-3 justify-start' : 'px-0 justify-center'
                  } ${
                    isActive 
                      ? 'bg-red-950/40 text-primary font-bold shadow-md shadow-red-500/5' 
                      : 'text-zinc-350 hover:text-zinc-100 hover:bg-zinc-900/60'
                  }`
                }
              >
                {/* Icon Container with smooth margin transition */}
                <div 
                  className={`shrink-0 flex items-center justify-center transition-all duration-300 ${
                    isSidebarExpanded ? 'mr-3.5' : 'mr-0'
                  }`}
                >
                  {cloneElement(item.icon as ReactElement<any>, { 
                    className: 'h-5 w-5 transition-transform duration-300 group-hover:scale-105' 
                  })}
                </div>
                
                {/* Text Label: smoothly shrinks and fades out when collapsed */}
                <span 
                  className={`text-sm tracking-wide transition-all duration-300 origin-left whitespace-nowrap ${
                    isSidebarExpanded 
                      ? 'opacity-100 max-w-[160px]' 
                      : 'opacity-0 max-w-0 overflow-hidden pointer-events-none scale-90 translate-x-2'
                  }`}
                >
                  {item.label}
                </span>
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}
