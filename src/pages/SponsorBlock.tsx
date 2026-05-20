import { useState, useEffect } from "react";
import { Shield, Activity, Server, HelpCircle, Heart, RefreshCw, Check } from "lucide-react";
import { getSetting, setSetting } from "../lib/api/db";

interface CategoryOption {
  id: string;
  name: string;
  desc: string;
  color: string;
}

const CATEGORIES: CategoryOption[] = [
  { id: "sponsor", name: "Sponsors", desc: "Paid advertisements or direct sponsorships.", color: "border-teal-500/30 text-teal-400 bg-teal-950/10" },
  { id: "intro", name: "Intros & Intermissions", desc: "Opening credits, card details, or intro sequences.", color: "border-indigo-500/30 text-indigo-400 bg-indigo-950/10" },
  { id: "outro", name: "Outros & Credits", desc: "End cards, patron lists, and end screens.", color: "border-purple-500/30 text-purple-400 bg-purple-950/10" },
  { id: "selfpromo", name: "Self-Promotion", desc: "Promoting secondary channels, merchandise, or social handles.", color: "border-amber-500/30 text-amber-400 bg-amber-950/10" },
  { id: "interaction", name: "Interaction Reminders", desc: "Requests to like, subscribe, hit the bell, or donate.", color: "border-blue-500/30 text-blue-400 bg-blue-950/10" },
  { id: "filler", name: "Non-Music Section / Filler", desc: "Silence, banter, or unrelated clips inside music feeds.", color: "border-emerald-500/30 text-emerald-400 bg-emerald-950/10" }
];

export function SponsorBlock() {
  const [enabled, setEnabled] = useState(true);
  const [serverUrl, setServerUrl] = useState("https://sponsor.ajay.app");
  const [selectedCategories, setSelectedCategories] = useState<Record<string, "skip" | "ignore">>({
    sponsor: "skip",
    intro: "skip",
    outro: "skip",
    selfpromo: "skip",
    interaction: "ignore",
    filler: "ignore"
  });
  
  const [savedMinutes, setSavedMinutes] = useState(142);
  const [segmentsSkipped, setSegmentsSkipped] = useState(418);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const dbEnabled = await getSetting("sponsorblock_enabled");
        if (dbEnabled !== null) {
          setEnabled(dbEnabled === "true");
        }
        
        const dbServer = await getSetting("sponsorblock_server");
        if (dbServer !== null) {
          setServerUrl(dbServer);
        }

        const dbCategories = await getSetting("sponsorblock_categories");
        if (dbCategories !== null) {
          setSelectedCategories(JSON.parse(dbCategories));
        }

        const dbMinutes = await getSetting("sponsorblock_saved_minutes");
        if (dbMinutes !== null) {
          setSavedMinutes(parseInt(dbMinutes, 10));
        }

        const dbSegments = await getSetting("sponsorblock_skipped_segments");
        if (dbSegments !== null) {
          setSegmentsSkipped(parseInt(dbSegments, 10));
        }
      } catch (e) {
        console.warn("Failed to load SponsorBlock settings from DB", e);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setSetting("sponsorblock_enabled", String(enabled));
      await setSetting("sponsorblock_server", serverUrl);
      await setSetting("sponsorblock_categories", JSON.stringify(selectedCategories));
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      console.error("Failed to save SponsorBlock configurations", e);
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => {
      const next = { ...prev };
      next[id] = prev[id] === "skip" ? "ignore" : "skip";
      return next;
    });
  };

  const handleResetStats = async () => {
    if (!confirm("Are you sure you want to clear skipped segment statistics?")) return;
    setSavedMinutes(0);
    setSegmentsSkipped(0);
    try {
      await setSetting("sponsorblock_saved_minutes", "0");
      await setSetting("sponsorblock_skipped_segments", "0");
    } catch (e) {
      console.warn("Failed to reset SponsorBlock stats in DB", e);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
            SponsorBlock Config
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Crowdsourced sponsorship skip system to instantly skip promotional segments and intros
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-primary hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-xs py-2.5 px-5 rounded-xl transition-all shadow-none active:scale-95 shrink-0"
        >
          {success ? (
            <>
              <Check size={14} />
              Saved Successfully
            </>
          ) : saving ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              Saving Configurations...
            </>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left main configurations column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Activation Panel */}
          <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield size={20} className="text-primary" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-200">SponsorBlock Skip Integration</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Toggle local client skipped player integration</p>
                </div>
              </div>
              
              <button
                onClick={() => setEnabled(!enabled)}
                className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer flex ${
                  enabled ? "bg-primary justify-end" : "bg-zinc-800 justify-start"
                }`}
              >
                <div className="w-4 h-4 bg-white rounded-full transition-transform duration-200"></div>
              </button>
            </div>

            {enabled && (
              <div className="pt-4 border-t border-zinc-800/40 space-y-4">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Skip Options by Category</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CATEGORIES.map((cat) => {
                    const isSkipping = selectedCategories[cat.id] === "skip";
                    return (
                      <div
                        key={cat.id}
                        onClick={() => toggleCategory(cat.id)}
                        className={`flex items-start gap-3 p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                          isSkipping
                            ? `border-primary/40 bg-zinc-900/45`
                            : "border-zinc-800/60 bg-zinc-950/20 hover:border-zinc-700/60"
                        }`}
                      >
                        <button
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors border ${
                            isSkipping ? "bg-primary border-primary text-white" : "border-zinc-700 text-transparent"
                          }`}
                        >
                          <Check size={12} strokeWidth={3} />
                        </button>

                        <div className="space-y-1">
                          <span className="text-xs font-bold text-zinc-200">{cat.name}</span>
                          <p className="text-[10px] text-zinc-550 leading-relaxed font-medium">{cat.desc}</p>
                          {isSkipping && (
                            <span className={`inline-block border px-1.5 py-0.5 rounded text-[9px] font-bold uppercase mt-2 ${cat.color}`}>
                              Skip Segment
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* API Server Configuration */}
          <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Server size={18} className="text-primary" />
              API Server Endpoint
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Define the backend API instance serving SponsorBlock segments. We highly recommend using the default Ajay instance for complete databases.
            </p>

            <div className="space-y-1 pt-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">SponsorBlock API URL</label>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="e.g. https://sponsor.ajay.app"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-primary/50 px-4 py-2.5 rounded-xl text-xs font-semibold outline-none transition-all text-zinc-100"
              />
            </div>
          </div>
        </div>

        {/* Right side stats column */}
        <div className="space-y-6">
          {/* Telemetry analytics skipped time saved */}
          <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Activity size={18} className="text-primary" />
              Flow Skip Telemetry
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Track how much of your watch duration has been recovered by skipping unnecessary fillers.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center bg-zinc-950 p-4 rounded-2xl border border-zinc-800/60">
                <div>
                  <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Recovered Time</span>
                  <p className="text-lg font-bold text-zinc-200 mt-1">{savedMinutes} minutes</p>
                </div>
              </div>

              <div className="flex justify-between items-center bg-zinc-950 p-4 rounded-2xl border border-zinc-800/60">
                <div>
                  <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Skipped Segments</span>
                  <p className="text-lg font-bold text-zinc-200 mt-1">{segmentsSkipped} clips</p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleResetStats}
                className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-950 hover:bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-2xl text-xs font-bold transition-all active:scale-95"
              >
                Reset Telemetry Stats
              </button>
            </div>
          </div>

          {/* Core Info / Learn More */}
          <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <HelpCircle size={18} className="text-primary" />
              SponsorBlock Info
            </h3>

            <div className="space-y-3 text-xs font-semibold text-zinc-400 leading-relaxed">
              <p>
                <span className="text-zinc-200 font-extrabold">SponsorBlock</span> is a crowdsourced API system where community members submit timecoded timestamps highlighting sponsor sections, intros, outros, or call-to-actions.
              </p>
              <p>
                When you play a matching video, Flow's media engine instantly skips past the submitted clips, saving your bandwidth and time.
              </p>

              <div className="pt-2 border-t border-zinc-800/40 flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase">
                <Heart size={12} className="text-primary" fill="currentColor" />
                Crowdsourced by Ajay
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SponsorBlock;
