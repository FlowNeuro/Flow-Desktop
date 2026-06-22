import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { ShortVideoSummary, VideoSummary } from "../../types/video";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { SETTINGS } from "../../lib/settings/schema";
import { buildShortQueue, shortSummaryToItem } from "../../lib/shortsQueue";

interface ShortsShelfProps {
  title: string;
  shorts: ShortVideoSummary[];
  onPlay: (video: VideoSummary) => void;
}

export const ShortsShelf: React.FC<ShortsShelfProps> = ({
  title,
  shorts,
}) => {
  const navigate = useNavigate();
  const shortsShelfEnabled = useAppSettingsStore((state) => state.values[SETTINGS.SHORTS_SHELF_ENABLED] !== "false");
  const disableShortsPlayer = useAppSettingsStore((state) => state.values[SETTINGS.DISABLE_SHORTS_PLAYER] === "true");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollLimits = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      checkScrollLimits();
      el.addEventListener("scroll", checkScrollLimits);
      window.addEventListener("resize", checkScrollLimits);
    }
    
    const timer = setTimeout(checkScrollLimits, 200);
    
    return () => {
      if (el) {
        el.removeEventListener("scroll", checkScrollLimits);
        window.removeEventListener("resize", checkScrollLimits);
      }
      clearTimeout(timer);
    };
  }, [shorts]);

  const handleScroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollAmount = direction === "left" ? -clientWidth * 0.75 : clientWidth * 0.75;
      scrollRef.current.scrollTo({
        left: scrollLeft + scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const handlePlayShort = (short: ShortVideoSummary) => {
    if (disableShortsPlayer) {
      navigate(`/watch/${short.id}`);
      return;
    }

    navigate(`/shorts/${short.id}`, {
      state: {
        initialShort: shortSummaryToItem(short),
        initialQueue: buildShortQueue(shorts),
        queueOnly: true,
      },
    });
  };

  if (!shortsShelfEnabled || !shorts || shorts.length === 0) return null;

  return (
    <div className="relative group/shelf flex flex-col gap-4 py-4 border-b border-zinc-900 last:border-0">
      {/* Shelf Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <span>{title}</span>
          <span className="text-xs text-zinc-500 font-semibold bg-zinc-900 border border-zinc-800/80 px-2 py-0.5 rounded-full">
            {shorts.length}
          </span>
        </h2>
      </div>

      {/* Shelf Slider Area */}
      <div className="relative w-full overflow-visible">
        {/* Left Navigation Chevron */}
        {canScrollLeft && (
          <button
            onClick={() => handleScroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 -ml-2 sm:-ml-4 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-black/80 hover:bg-black border border-zinc-800 text-zinc-200 hover:text-white shadow-xl opacity-0 group-hover/shelf:opacity-100 transition-all duration-300 transform active:scale-90 hover:scale-105 pointer-events-auto backdrop-blur-sm cursor-pointer"
            aria-label="Scroll left"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scroll-smooth scrollbar-none pb-2 px-1 -mx-1"
        >
          {shorts.map((short) => (
            <div
              key={short.id}
              onClick={() => handlePlayShort(short)}
              className="w-[140px] sm:w-[176px] shrink-0 flex flex-col gap-2 group cursor-pointer transform transition-transform duration-300 hover:translate-y-[-2px]"
            >
              {/* Vertical Card Cover */}
              <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-850">
                {short.thumbnailUrl && (
                  <img
                    src={short.thumbnailUrl}
                    alt={short.title}
                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                    loading="lazy"
                  />
                )}
                {/* Play overlay button */}
                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <div className="p-2.5 bg-primary rounded-full text-white shadow-md">
                    <Play size={16} fill="white" />
                  </div>
                </div>
                {short.viewCountText && (
                  <div className="absolute bottom-2 left-2 text-[10px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded tracking-wide backdrop-blur-sm">
                    {short.viewCountText}
                  </div>
                )}
              </div>

              {/* Text metadata */}
              <h3 className="text-zinc-200 text-xs font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors pr-1">
                {short.title}
              </h3>
            </div>
          ))}
        </div>

        {/* Right Navigation Chevron */}
        {canScrollRight && (
          <button
            onClick={() => handleScroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 -mr-2 sm:-mr-4 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-black/80 hover:bg-black border border-zinc-800 text-zinc-200 hover:text-white shadow-xl opacity-0 group-hover/shelf:opacity-100 transition-all duration-300 transform active:scale-90 hover:scale-105 pointer-events-auto backdrop-blur-sm cursor-pointer"
            aria-label="Scroll right"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
};
