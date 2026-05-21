import React, { useState, useRef, useEffect } from "react";
import { WandSparkles , ThumbsDown, ChevronDown, Check, RotateCcw } from "lucide-react";
import { useSettingsStore, SponsorBlockCategory, SponsorBlockAction } from "../../store/useSettingsStore";

// The official 23 premium MD3 preset colors matching the mobile Compose Screen
const PRESET_COLORS = [
  "#00D400", // green
  "#FFFF00", // yellow
  "#0000FF", // blue
  "#FF0000", // red
  "#FF7700", // orange
  "#FF69B4", // pink
  "#7700FF", // purple
  "#00FFFF", // cyan
  "#FFFFFF", // white
  "#008080", // teal
  "#3F51B5", // indigo
  "#FFC107", // amber
  "#CDDC39", // lime
  "#673AB7", // deep purple
  "#FF5722", // deep orange
  "#E91E63", // magenta
  "#006400", // dark green
  "#8B4513", // brown
  "#808080", // gray
  "#C0C0C0", // silver
  "#FFD700", // gold
  "#40E0D0", // turquoise
  "#4B0082"  // dark violet
];

interface CategoryDetails {
  id: SponsorBlockCategory;
  name: string;
  desc: string;
}

const SB_CATEGORIES: CategoryDetails[] = [
  {
    id: "sponsor",
    name: "Sponsor Segment",
    desc: "Paid advertisements, sponsored integrations, and direct product promotions."
  },
  {
    id: "intro",
    name: "Intros & Intermissions",
    desc: "Opening credits, card details, channel branding, or introductory animations."
  },
  {
    id: "outro",
    name: "Outros & Credits",
    desc: "End cards, patron scroll credits, generic channel logos, and end screen overlays."
  },
  {
    id: "selfpromo",
    name: "Self-Promotion",
    desc: "Promoting secondary channels, custom merchandise, Patreon handles, or social pages."
  },
  {
    id: "interaction",
    name: "Interaction Reminders",
    desc: "Requests to like the feed, subscribe to the channel, click the bell, or drop comments."
  },
  {
    id: "filler",
    name: "Non-Music Section / Filler",
    desc: "Silence, comedic banter, or unrelated spoken narratives inside music feeds."
  },
  {
    id: "music_offtopic",
    name: "Music Off-Topic",
    desc: "Dialogue segments, narrative sequences, or theatrical sound effects in music videos."
  },
  {
    id: "preview",
    name: "Previews & Highlights",
    desc: "Teasers, recap frames, highlight reels, or 'coming up next' hooks at the video start."
  },
  {
    id: "exclusive_access",
    name: "Exclusive Access",
    desc: "Behind-the-scenes segments, making-of footage, or exclusive subscriber features."
  }
];

export const SponsorBlockCategoriesList: React.FC = () => {
  const {
    sponsorBlockEnabled,
    setSponsorBlockEnabled,
    dearrowEnabled,
    setDeArrowEnabled,
    dearrowBadgeEnabled,
    setDeArrowBadgeEnabled,
    rytdEnabled,
    setRytdEnabled,
    sponsorBlockColors,
    setCategoryColor,
    sponsorBlockActions,
    setCategoryAction,
  } = useSettingsStore();

  const [activeColorPicker, setActiveColorPicker] = useState<SponsorBlockCategory | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<SponsorBlockCategory | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (activeDropdown && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setActiveDropdown(null);
      }
      if (activeColorPicker && colorPickerRef.current && !colorPickerRef.current.contains(target)) {
        setActiveColorPicker(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [activeDropdown, activeColorPicker]);

  const getActionLabel = (action: SponsorBlockAction) => {
    switch (action) {
      case "skip":
        return "Auto-Skip";
      case "mute":
        return "Mute Audio";
      case "notify":
        return "Show Skip Button";
      case "ignore":
        return "Ignore";
    }
  };

  const SponsorBlockIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-primary shrink-0" fill="currentColor">
      <path d="M12,22.7994C11.55,22.7994 11.1,22.7094 10.74,22.4394 4.89,18.8394 1.2,12.6294 1.2,5.7894 1.2,4.8894 1.65,3.9894 2.46,3.5394 8.4,0.3894 15.6,0.3894 21.54,3.6294 22.35,3.9894 22.8,4.8894 22.8,5.7894 22.71,12.6294 19.11,18.8394 13.35,22.4394 12.9,22.7094 12.45,22.7994 12,22.7994ZM12,1.9194c-3.15,0 -6.3,0.81 -9.18,2.34 -0.54,0.27 -0.9,0.9 -0.9,1.53 0.09,6.57 3.51,12.51 9.18,16.02 0.54,0.36 1.26,0.36 1.8,0C18.57,18.3894 21.9,12.3594 22.08,5.7894 22.08,5.1594 21.72,4.5294 21.18,4.2594 18.3,2.7294 15.15,1.9194 12,1.9194Z" />
      <path d="M20.73,4.9794C15.24,2.0994 8.76,2.0994 3.27,4.9794 3,5.1594 2.82,5.4294 2.82,5.7894c0.09,6.48 3.51,12.06 8.73,15.3 0.27,0.18 0.63,0.18 0.9,0 5.13,-3.15 8.64,-8.82 8.73,-15.3C21.18,5.4294 21,5.1594 20.73,4.9794ZM9.66,15.1494L9.66,6.7794l7.29,4.23z" />
    </svg>
  );


  return (
    <div className="space-y-6">
      {/* Master Toggles Card */}
      <div className="bg-[#212121] rounded-2xl p-6 space-y-4">
        <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Master Activations</h2>

        {/* SponsorBlock switch */}
        <div className="flex items-center justify-between p-4 bg-[#1E1E1E] rounded-xl hover:bg-[#252525] transition-colors">
          <div className="flex items-center gap-3">
            <SponsorBlockIcon />
            <div>
              <h3 className="text-sm font-bold text-neutral-100">SponsorBlock Skip Integration</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">Instantly auto-skip promotional segments and outros</p>
            </div>
          </div>
          <button
            onClick={() => setSponsorBlockEnabled(!sponsorBlockEnabled)}
            className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
              sponsorBlockEnabled ? "bg-primary justify-end" : "bg-[#2A2A2A] justify-start"
            }`}
          >
            <div className="w-4 h-4 bg-neutral-100 rounded-full shadow-md"></div>
          </button>
        </div>

        {/* DeArrow switch */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between p-4 bg-[#1E1E1E] rounded-xl hover:bg-[#252525] transition-colors">
            <div className="flex items-center gap-3">
              <span className="w-5 h-5 text-primary shrink-0">
              <WandSparkles  />
              </span>
              <div>
                <h3 className="text-sm font-bold text-neutral-100">DeArrow Title & Thumbnail Overrides</h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">Replace clickbait video details with crowdsourced normalizations</p>
              </div>
            </div>
            <button
              onClick={() => setDeArrowEnabled(!dearrowEnabled)}
              className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
                dearrowEnabled ? "bg-primary justify-end" : "bg-[#2A2A2A] justify-start"
              }`}
            >
              <div className="w-4 h-4 bg-neutral-100 rounded-full shadow-md"></div>
            </button>
          </div>

          {/* Sub-Switch: DeArrow Sparkles Badge (only shown when DeArrow is enabled) */}
          {dearrowEnabled && (
            <div className="flex items-center justify-between p-3 pl-8 bg-[#1e1e1e]/60 rounded-xl hover:bg-[#252525]/60 transition-colors ml-4">
              <div className="flex items-center gap-3">
                <WandSparkles  size={16} className="text-primary shrink-0" />
                <div>
                  <h3 className="text-xs font-bold text-neutral-100">Display Override Indicators</h3>
                  <p className="text-[10px] text-neutral-400">Show visual indicators next to titles cleaned by DeArrow</p>
                </div>
              </div>
              <button
                onClick={() => setDeArrowBadgeEnabled(!dearrowBadgeEnabled)}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                  dearrowBadgeEnabled ? "bg-primary justify-end" : "bg-[#2A2A2A] justify-start"
                }`}
              >
                <div className="w-4 h-4 bg-neutral-100 rounded-full shadow-md"></div>
              </button>
            </div>
          )}
        </div>

        {/* Return YouTube Dislike (RYTD) switch */}
        <div className="flex items-center justify-between p-4 bg-[#1E1E1E] rounded-xl hover:bg-[#252525] transition-colors">
          <div className="flex items-center gap-3">
            <ThumbsDown size={18} className="text-primary shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-neutral-100">Return YouTube Dislikes</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">Fetch and display public video dislike statistics bar</p>
            </div>
          </div>
          <button
            onClick={() => setRytdEnabled(!rytdEnabled)}
            className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
              rytdEnabled ? "bg-primary justify-end" : "bg-[#2A2A2A] justify-start"
            }`}
          >
            <div className="w-4 h-4 bg-neutral-100 rounded-full shadow-md"></div>
          </button>
        </div>
      </div>

      {/* SponsorBlock Categories List */}
      {sponsorBlockEnabled && (
        <div className="bg-[#212121] rounded-2xl p-6">
          <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Segment Skip Behaviors</h2>
          <div className="flex flex-col relative">
            {SB_CATEGORIES.map((cat) => {
              const currentColor = sponsorBlockColors[cat.id] || "#ef4444";
              const currentAction = sponsorBlockActions[cat.id] || "skip";

              return (
                <div
                  key={cat.id}
                  className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-[#1E1E1E] hover:bg-[#252525] transition-colors rounded-xl mb-3 relative gap-4"
                >
                  {/* Left Column: Swatch + Title/Desc */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Swatch circle */}
                    <div className="relative shrink-0">
                      <div
                        onClick={() => {
                          setActiveColorPicker(activeColorPicker === cat.id ? null : cat.id);
                          setActiveDropdown(null);
                        }}
                        className="w-8 h-8 rounded-full cursor-pointer hover:scale-105 border border-neutral-700/60 transition-transform flex items-center justify-center"
                        style={{ backgroundColor: currentColor }}
                        title="Customize segment color"
                      />

                      {/* Color Picker Popover */}
                      {activeColorPicker === cat.id && (
                        <div
                          ref={colorPickerRef}
                          className="absolute left-0 mt-2 z-50 w-64 bg-[#2A2A2A] p-4 rounded-xl border border-neutral-700 shadow-2xl"
                        >
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-wide">
                              Select Theme Color
                            </span>
                            <button
                              onClick={() => {
                                const defaults: Record<SponsorBlockCategory, string> = {
                                  sponsor: "#00d400",
                                  intro: "#00ffff",
                                  outro: "#0000ff",
                                  selfpromo: "#ffff00",
                                  interaction: "#ff0000",
                                  music_offtopic: "#ff0584",
                                  filler: "#7300ff",
                                  preview: "#0080c0",
                                  exclusive_access: "#ff7f00",
                                };
                                setCategoryColor(cat.id, defaults[cat.id]);
                                setActiveColorPicker(null);
                              }}
                              className="text-[9px] font-bold text-primary hover:text-red-400 flex items-center gap-1 transition-colors"
                            >
                              <RotateCcw size={10} />
                              Default
                            </button>
                          </div>
                          <div className="grid grid-cols-6 gap-2">
                            {PRESET_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={async () => {
                                  await setCategoryColor(cat.id, color);
                                  setActiveColorPicker(null);
                                }}
                                className="w-7 h-7 rounded-full border border-neutral-800 cursor-pointer hover:scale-110 active:scale-95 transition-transform flex items-center justify-center"
                                style={{ backgroundColor: color }}
                              >
                                {currentColor.toUpperCase() === color.toUpperCase() && (
                                  <Check size={12} className="text-black/80 stroke-[3]" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-neutral-100 truncate">{cat.name}</h4>
                      <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed font-medium">
                        {cat.desc}
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Dropdown */}
                  <div className="relative shrink-0 w-full md:w-auto self-end md:self-auto">
                    <button
                      onClick={() => {
                        setActiveDropdown(activeDropdown === cat.id ? null : cat.id);
                        setActiveColorPicker(null);
                      }}
                      className="w-full md:w-48 bg-[#2A2A2A] hover:bg-[#333] active:bg-[#1e1e1e] text-primary hover:text-red-400 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between gap-2"
                    >
                      <span>{getActionLabel(currentAction)}</span>
                      <ChevronDown size={14} className="opacity-70" />
                    </button>

                    {/* Dropdown Options popover */}
                    {activeDropdown === cat.id && (
                      <div
                        ref={dropdownRef}
                        className="absolute right-0 mt-2 z-50 w-full md:w-48 bg-[#2a2a2a] py-1 rounded-xl border border-neutral-700 shadow-2xl overflow-hidden"
                      >
                        {(["skip", "mute", "notify", "ignore"] as SponsorBlockAction[]).map((action) => (
                          <button
                            key={action}
                            onClick={async () => {
                              await setCategoryAction(cat.id, action);
                              setActiveDropdown(null);
                            }}
                            className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-[#333] transition-colors flex items-center justify-between text-neutral-200"
                          >
                            <span>{getActionLabel(action)}</span>
                            {currentAction === action && (
                              <Check size={12} className="text-primary stroke-[3]" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
