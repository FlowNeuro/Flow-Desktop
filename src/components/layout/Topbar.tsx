import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bell, Menu, Search, Settings } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import Logo from '../common/Logo';
import { IconButton } from '../ui/IconButton';
import { getSearchSuggestions } from '../../lib/api/youtube';

export function Topbar() {
  const { toggleSidebar, toggleWatchSidebar, setSearchQuery } = useUiStore();
  const [localSearch, setLocalSearch] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const suggestionRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setShowSuggestions(true);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (localSearch.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const delay = setTimeout(async () => {
      try {
        const res = await getSearchSuggestions(localSearch);
        setSuggestions(res.slice(0, 6));
      } catch (err) {
        console.warn("Suggestions error", err);
      }
    }, 250);

    return () => clearTimeout(delay);
  }, [localSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (localSearch.trim()) {
      setSearchQuery(localSearch);
      setShowSuggestions(false);
      navigate(`/search?q=${encodeURIComponent(localSearch)}`);
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-transparent bg-background px-3">
      {/* Left */}
      <div className="flex min-w-0 items-center gap-2">
        <IconButton onClick={location.pathname.startsWith('/watch/') ? toggleWatchSidebar : toggleSidebar}>
          <Menu />
        </IconButton>
        <div className="hidden items-center gap-1 sm:flex">
          <IconButton
            title="Back"
            onClick={() => navigate(-1)}
            className="text-zinc-300 hover:text-white"
          >
            <ArrowLeft />
          </IconButton>
          <IconButton
            title="Forward"
            onClick={() => navigate(1)}
            className="text-zinc-300 hover:text-white"
          >
            <ArrowRight />
          </IconButton>
        </div>
        <div className="cursor-pointer" onClick={() => navigate('/')}>
          <Logo size={36} showText={true} />
        </div>
      </div>

      {/* Center - Search */}
      <div className="relative flex max-w-[720px] flex-1 items-center justify-center px-4 md:px-8" ref={suggestionRef}>
        <form 
          onSubmit={handleSearch} 
          className="flex h-10 w-full items-center overflow-hidden rounded-full border border-zinc-800 bg-[#121212] transition-colors focus-within:border-zinc-500"
        >
          <div className="flex min-w-0 flex-1 items-center px-4">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search"
              value={localSearch}
              onFocus={() => setShowSuggestions(true)}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                setShowSuggestions(true);
              }}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
            <kbd className="ml-3 hidden rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 lg:block">
              Ctrl K
            </kbd>
          </div>
          <button 
            type="submit" 
            className="flex h-10 w-14 items-center justify-center border-l border-zinc-800 bg-zinc-900 text-zinc-200 transition-colors hover:bg-zinc-800"
            title="Search"
          >
            <Search className="h-5 w-5" />
          </button>
        </form>

        {/* Suggestion Dropdown overlay */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-4 right-4 top-[48px] z-50 overflow-hidden rounded-2xl border border-zinc-800 bg-[#181818] md:left-8 md:right-8">
            {suggestions.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setLocalSearch(item);
                  setSearchQuery(item);
                  setShowSuggestions(false);
                  navigate(`/search?q=${encodeURIComponent(item)}`);
                }}
                className="flex cursor-pointer items-center gap-3 px-5 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <Search className="h-3.5 w-3.5 text-zinc-500" />
                {item}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <IconButton title="Notifications">
          <Bell />
        </IconButton>
        <IconButton onClick={() => navigate('/settings')} title="Settings">
          <Settings />
        </IconButton>
      </div>
    </header>
  );
}
