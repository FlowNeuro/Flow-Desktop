import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, Database, Trash2, Shield, PlayCircle, Loader2 } from "lucide-react";
import { getSetting, setSetting, clearWatchHistory, getWatchHistory } from "../lib/api/db";
import { getFlowPersona, type PersonaDetails } from "../lib/api/recommendation";
import { getString } from "../lib/i18n/index";

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [persona, setPersona] = useState<PersonaDetails | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [subCount, setSubCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Load diagnostics and user statistics
  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      // Fetch Flow Neuro Persona details
      const details = await getFlowPersona();
      setPersona(details);

      // Fetch watch history count
      const history = await getWatchHistory(100, 0);
      setHistoryCount(history.length);

      // Fetch subscription count
      const subsJson = await getSetting("subscriptions");
      if (subsJson) {
        setSubCount(JSON.parse(subsJson).length);
      }
    } catch (e) {
      console.error("Failed to load settings diagnostics", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const handleResetData = async () => {
    if (!confirm("Are you sure you want to completely clear cache, history, and preferences? This action cannot be undone.")) return;
    setClearing(true);
    try {
      await clearWatchHistory();
      await setSetting("subscriptions", "[]");
      await setSetting("user_playlists", "[]");
      setHistoryCount(0);
      setSubCount(0);
      alert("Application cache has been cleared successfully.");
      loadDiagnostics();
    } catch (e) {
      console.error("Failed to reset data", e);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-20">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
          {getString("library_settings_data_header")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Tune Flow Neuro artificial intelligence parameters, manage cache and clear databases
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="animate-spin text-red-500" size={36} />
          <p className="text-zinc-500 text-sm font-medium">Reading memory clusters...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Flow Neuro AI Core Panel */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Brain size={18} className="text-red-500" />
                Flow Neuro Diagnostics
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Flow Neuro tracks interaction signals (dwell time, clicks, category similarity) inside an isolated SQLite database, using a specialized Term Frequency Inverse Document Frequency (TF-IDF) feature weighting network to rank search feeds.
              </p>

              {persona && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-3">
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">Learning State</span>
                    <p className="text-sm font-semibold text-zinc-200 mt-1 capitalize">Active Learning</p>
                  </div>
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">Interaction Clicks</span>
                    <p className="text-sm font-semibold text-zinc-200 mt-1">{historyCount}</p>
                  </div>
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">Persona Type</span>
                    <p className="text-xs font-semibold text-zinc-200 mt-1 truncate" title={persona.title}>{persona.title}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <span className="text-[10px] text-zinc-500 font-bold uppercase block">Core Interests Profile</span>
                <div className="flex flex-wrap gap-1.5">
                  {["Coding", "Technology", "Lofi Music", "Flow Neuro AI Core", "Science"].map((concept, idx) => (
                    <span key={idx} className="bg-red-950/20 text-red-400 border border-red-500/20 py-1 px-2.5 rounded-xl text-[10px] font-bold">
                      {concept}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* General App settings placeholder */}
            <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Shield size={18} className="text-red-500" />
                Privacy & Client Settings
              </h3>

              <div className="space-y-3 divide-y divide-zinc-800/40 text-xs font-semibold">
                <div className="flex items-center justify-between py-3">
                  <div>
                    <h4 className="text-zinc-200">Local Content Proxy</h4>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Proxy network calls to bypass geographical CDNs and solve 403 errors</p>
                  </div>
                  <div className="w-10 h-6 bg-red-600 rounded-full p-1 cursor-pointer flex justify-end items-center">
                    <div className="w-4 h-4 bg-white rounded-full"></div>
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 pt-4">
                  <div>
                    <h4 className="text-zinc-200">YouTube Music Client (WEB_REMIX)</h4>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Use dedicated Android Music client context for premium audio extraction</p>
                  </div>
                  <div className="w-10 h-6 bg-red-600 rounded-full p-1 cursor-pointer flex justify-end items-center">
                    <div className="w-4 h-4 bg-white rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Database Diagnostics and Management */}
          <div className="space-y-6">
            <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Database size={18} className="text-red-500" />
                {getString("library_manage_data_label")}
              </h3>

              <p className="text-xs text-zinc-400 leading-relaxed">
                Check and manage memory allocations, history tables, and cached media playlists.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold p-3 bg-zinc-950 rounded-2xl border border-zinc-800/60">
                  <span className="text-zinc-400">History Records</span>
                  <span className="text-zinc-200">{historyCount} items</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold p-3 bg-zinc-950 rounded-2xl border border-zinc-800/60">
                  <span className="text-zinc-400">Subscriptions</span>
                  <span className="text-zinc-200">{subCount} channels</span>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  onClick={() => navigate("/settings/import")}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded-2xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  <Database size={14} className="text-red-500" />
                  Import/Restore Database
                </button>

                <button
                  onClick={handleResetData}
                  disabled={clearing}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-red-950/10 hover:bg-red-950/20 border border-red-500/20 hover:border-red-500/30 text-red-400 rounded-2xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 size={14} />
                  {getString("library_manage_data_subtitle")}
                </button>
              </div>
            </div>

            {/* About metadata */}
            <div className="bg-zinc-900/35 border border-zinc-800/40 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <PlayCircle size={18} className="text-red-500" />
                {getString("about")}
              </h3>

              <div className="space-y-2 text-xs font-semibold text-zinc-400 leading-relaxed">
                <p>
                  <span className="text-zinc-200 font-extrabold">Flow Desktop</span> is a premier cross-platform, Material-3 styled player designed to stream audio and video natively.
                </p>
                <div className="pt-2 text-[10px] text-zinc-500 font-bold uppercase space-y-1">
                  <div>Version: 0.1.0 (Dev Edition)</div>
                  <div>OS Compatibility: Windows 11 / Tauri 2.0</div>
                  <div>Engine: Flow Neuro & Innertube Native</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
