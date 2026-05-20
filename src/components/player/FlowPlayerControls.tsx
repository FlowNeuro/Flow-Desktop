import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, 
  Settings, Maximize, Subtitles, RectangleHorizontal, Tv 
} from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";

interface FlowPlayerControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export const FlowPlayerControls: React.FC<FlowPlayerControlsProps> = ({ videoRef }) => {
  const {
    isPlaying,
    setIsPlaying,
    volume,
    setVolume,
    currentTime,
    duration,
    setCurrentTime,
    playNext,
    playPrevious,
    isTheaterMode,
    setIsTheaterMode,
    playbackRate,
    setPlaybackRate,
    sponsorBlockSegments
  } = usePlayerStore();

  const [showMute, setShowMute] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync player store state to native video element
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => setIsPlaying(false));
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, videoRef, setIsPlaying]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = showMute ? 0 : volume;
    }
  }, [volume, showMute, videoRef]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, videoRef]);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0) setShowMute(false);
    else setShowMute(true);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMute(!showMute);
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      videoRef.current?.parentElement?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Auto-hide controls
  useEffect(() => {
    const handleMouseMove = () => {
      setIsHovering(true);
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      hoverTimeout.current = setTimeout(() => setIsHovering(false), 3000);
    };

    const parent = videoRef.current?.parentElement;
    if (parent) {
      parent.addEventListener("mousemove", handleMouseMove);
      parent.addEventListener("mouseleave", () => setIsHovering(false));
    }
    return () => {
      if (parent) {
        parent.removeEventListener("mousemove", handleMouseMove);
        parent.removeEventListener("mouseleave", () => setIsHovering(false));
      }
    };
  }, [videoRef]);

  // Color mapping for SponsorBlock
  const getSponsorColor = (category: string) => {
    switch(category) {
      case "sponsor": return "bg-[#00d400]";
      case "intro": return "bg-[#00ffff]";
      case "outro": return "bg-[#0202ed]";
      case "interaction": return "bg-[#cc00ff]";
      case "selfpromo": return "bg-[#ffff00]";
      case "music_offtopic": return "bg-[#ff9900]";
      case "preview": return "bg-[#008fd6]";
      case "filler": return "bg-[#7300FF]";
      default: return "bg-white";
    }
  };

  return (
    <div 
      className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${isHovering || !isPlaying ? 'opacity-100' : 'opacity-0'} pointer-events-none`}
      onClick={() => setIsPlaying(!isPlaying)}
    >
      {/* Gradient Bottom Overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* Controls Container */}
      <div className="relative z-10 px-4 pb-2 w-full flex flex-col gap-1 pointer-events-auto">
        
        {/* Scrubber Area */}
        <div className="group relative w-full h-1 hover:h-2 transition-all duration-150 cursor-pointer bg-white/20 rounded-full flex items-center">
          
          {/* Buffered / Base track (implicit via bg-white/20) */}
          
          {/* SponsorBlock Segments Rendered Behind Progress */}
          {sponsorBlockSegments.map((seg, idx) => {
            const startPct = (seg.segment[0] / duration) * 100;
            const endPct = (seg.segment[1] / duration) * 100;
            const widthPct = endPct - startPct;
            if (isNaN(startPct) || isNaN(widthPct)) return null;
            return (
              <div 
                key={idx}
                className={`absolute h-full ${getSponsorColor(seg.category)}`}
                style={{ left: `${startPct}%`, width: `${widthPct}%` }}
              />
            );
          })}

          {/* Current Progress Track */}
          <div 
            className="absolute h-full bg-[#ff0000]"
            style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
          />
          
          {/* Invisible Range Input for Seeking */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Bottom Bar */}
        <div className="flex items-center justify-between pt-1">
          
          {/* Left Controls */}
          <div className="flex items-center gap-4 text-white">
            <button onClick={playPrevious} className="hover:text-[#ff0000] transition-colors"><SkipBack size={20} fill="currentColor" /></button>
            <button onClick={handlePlayPause} className="hover:text-[#ff0000] transition-colors">
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </button>
            <button onClick={playNext} className="hover:text-[#ff0000] transition-colors"><SkipForward size={20} fill="currentColor" /></button>
            
            <div className="flex items-center gap-2 group/volume relative">
              <button onClick={toggleMute} className="hover:text-[#ff0000] transition-colors">
                {showMute || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-300 ease-out flex items-center">
                <input
                  type="range"
                  min={0} max={1} step={0.05}
                  value={showMute ? 0 : volume}
                  onChange={handleVolumeChange}
                  onClick={(e) => e.stopPropagation()}
                  className="w-16 h-1 accent-white bg-white/20 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>

            <span className="text-xs font-medium opacity-90 ml-1">
              {formatTime(currentTime)} <span className="opacity-60 mx-1">/</span> {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-4 text-white relative">
            <button className="hover:text-[#ff0000] transition-colors"><Subtitles size={20} /></button>
            
            <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }} className="hover:text-[#ff0000] transition-colors">
              <Settings size={20} className={showSettings ? "rotate-90 transition-transform" : "transition-transform"} />
            </button>
            
            {showSettings && (
              <div 
                className="absolute bottom-12 right-12 bg-[#272727] border border-[#3f3f3f] rounded-xl p-2 w-56 text-sm shadow-2xl z-50 origin-bottom-right"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between p-2 hover:bg-[#3f3f3f] rounded-lg cursor-pointer transition-colors">
                    <span className="font-medium text-white">Playback Speed</span>
                    <select 
                      value={playbackRate} 
                      onChange={(e) => setPlaybackRate(parseFloat(e.target.value) as any)}
                      className="bg-transparent text-white outline-none font-bold text-xs cursor-pointer text-right"
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={1}>Normal</option>
                      <option value={1.5}>1.5x</option>
                      <option value={2}>2x</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between p-2 hover:bg-[#3f3f3f] rounded-lg cursor-pointer transition-colors">
                    <span className="font-medium text-white">Ambient Mode</span>
                    <div className="w-8 h-4 bg-[#ff0000] rounded-full relative"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full" /></div>
                  </div>
                  <div className="h-px bg-[#3f3f3f] my-1 mx-2" />
                  <div className="flex items-center justify-between p-2 hover:bg-[#3f3f3f] rounded-lg cursor-pointer transition-colors">
                    <span className="font-medium text-white">SponsorBlock</span>
                    <span className="text-xs text-[#00d400] font-bold">Active</span>
                  </div>
                </div>
              </div>
            )}

            <button className="hover:text-[#ff0000] transition-colors"><RectangleHorizontal size={20} /></button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); setIsTheaterMode(!isTheaterMode); }} 
              className="hover:text-[#ff0000] transition-colors"
            >
              <Tv size={20} />
            </button>

            <button onClick={toggleFullscreen} className="hover:text-[#ff0000] transition-colors ml-1">
              <Maximize size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
