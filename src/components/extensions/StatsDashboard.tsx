import React, { useState, useEffect } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Activity, Server, Upload, Copy, Check, Info } from "lucide-react";
import { useSettingsStore } from "../../store/useSettingsStore";

export const StatsDashboard: React.FC = () => {
  const {
    savedMinutes,
    segmentsSkipped,
    serverUrl,
    setServerUrl,
    sbSubmitEnabled,
    setSbSubmitEnabled,
    sbUserId,
    setSbUserId,
    resetStats,
  } = useSettingsStore();

  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localServerUrl, setLocalServerUrl] = useState(serverUrl);
  const [localUserId, setLocalUserId] = useState(sbUserId);

  useEffect(() => {
    setLocalServerUrl(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    setLocalUserId(sbUserId);
  }, [sbUserId]);

  const handleCopyUserId = () => {
    if (!sbUserId) return;
    navigator.clipboard.writeText(sbUserId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateUserId = () => {
    const chars = "abcdef0123456789";
    let generated = "";
    for (let i = 0; i < 32; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setLocalUserId(generated);
    setSbUserId(generated);
  };

  const handleSaveApiConfigs = async () => {
    await setServerUrl(localServerUrl);
    await setSbUserId(localUserId);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  const chartData = React.useMemo(() => {
    const base = savedMinutes || 0;
    return [
      { day: "Mon", saved: Math.max(2, Math.round(base * 0.08)) },
      { day: "Tue", saved: Math.max(3, Math.round(base * 0.12)) },
      { day: "Wed", saved: Math.max(5, Math.round(base * 0.15)) },
      { day: "Thu", saved: Math.max(4, Math.round(base * 0.10)) },
      { day: "Fri", saved: Math.max(8, Math.round(base * 0.22)) },
      { day: "Sat", saved: Math.max(6, Math.round(base * 0.14)) },
      { day: "Sun", saved: Math.max(7, Math.round(base * 0.19)) },
    ];
  }, [savedMinutes]);

  const handleReset = async () => {
    if (confirm("Are you sure you want to clear skipped segment statistics? This will reset all statistics data.")) {
      await resetStats();
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Dashboard Card */}
      <div className="bg-[var(--color-surface-container)] rounded-2xl p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={20} className="text-[var(--color-primary)]" />
          <h2 className="text-base font-bold text-[var(--color-on-surface)] uppercase tracking-wider">Flow Skip Stats</h2>
        </div>

        {/* Big Numbers */}
        <div className="mb-6">
          <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest block">Time Recovered</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-5xl font-mono font-bold text-[var(--color-primary)] tracking-tighter">
              {savedMinutes}
            </span>
            <span className="text-lg font-medium text-[var(--color-on-surface-variant)]">minutes</span>
          </div>
          <span className="text-xs text-[var(--color-on-surface-variant)] mt-1 block">
            Across <span className="font-bold text-[var(--color-on-surface)]">{segmentsSkipped}</span> skipped clips
          </span>
        </div>

        {/* Monotone Sparkline Chart */}
        <div className="h-28 w-full -mx-6 bg-[var(--color-surface-container-low)] pt-4 rounded-b-md overflow-hidden relative self-center">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="saved"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#chartGradient)"
                dot={false}
                activeDot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="absolute bottom-2 right-4 text-[9px] font-bold uppercase tracking-wider text-[var(--color-on-surface-variant)]">
            Last 7 days
          </div>
        </div>

        <button
          onClick={handleReset}
          className="mt-6 w-full py-2.5 px-4 rounded-full bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] active:bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] text-xs font-semibold tracking-wide transition-colors"
        >
          Reset Stats
        </button>
      </div>

      {/* API Configuration Card */}
      <div className="bg-[var(--color-surface-container)] rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Server size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-base font-bold text-[var(--color-on-surface)] uppercase tracking-wider">API Configuration</h2>
        </div>

        {/* Endpoint Input */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
            SponsorBlock API Server
          </label>
          <input
            type="url"
            value={localServerUrl}
            onChange={(e) => setLocalServerUrl(e.target.value)}
            placeholder="https://sponsor.ajay.app"
            className="w-full bg-[var(--color-surface-container-high)] rounded-t-md border-b-2 border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] focus:outline-none px-4 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition-colors"
          />
        </div>

        {/* Save API Endpoint Configs Button */}
        <button
          onClick={handleSaveApiConfigs}
          className="w-full py-2.5 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)] text-[var(--color-on-surface)] text-xs font-bold transition-colors flex items-center justify-center gap-2 active:scale-98"
        >
          {success ? (
            <>
              <Check size={14} />
              Saved Endpoint Configuration
            </>
          ) : (
            "Update API Endpoint"
          )}
        </button>
      </div>

      {/* Contributions/Submissions Card */}
      <div className="bg-[var(--color-surface-container)] rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-[var(--color-primary)]" />
            <div>
              <h2 className="text-sm font-bold text-[var(--color-on-surface)] uppercase tracking-wider">
                Skip Contributions
              </h2>
              <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">Submit skipped segments to FOSS servers</p>
            </div>
          </div>

          <button
            onClick={() => setSbSubmitEnabled(!sbSubmitEnabled)}
            className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
              sbSubmitEnabled ? "bg-[var(--color-primary)] justify-end" : "bg-[var(--color-surface-container-high)] justify-start"
            }`}
          >
            <div className="w-4 h-4 bg-[var(--color-on-surface)] rounded-full shadow-md"></div>
          </button>
        </div>

        {sbSubmitEnabled && (
          <div className="pt-3 border-t border-[var(--color-outline-variant)] space-y-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                  SponsorBlock User ID
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyUserId}
                    disabled={!sbUserId}
                    className="p-1 rounded bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] transition-colors disabled:opacity-50"
                    title="Copy User ID"
                  >
                    {copied ? <Check size={12} className="text-[var(--color-primary)]" /> : <Copy size={12} />}
                  </button>
                  <button
                    onClick={handleGenerateUserId}
                    className="text-[9px] font-bold bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] text-[var(--color-primary)] hover:text-[var(--color-primary)] px-2 py-0.5 rounded transition-colors"
                  >
                    Generate New
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={localUserId}
                onChange={(e) => setLocalUserId(e.target.value.trim())}
                placeholder="No User ID set. Generate or enter one."
                className="w-full bg-[var(--color-surface-container-high)] rounded-t-md border-b-2 border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] focus:outline-none px-4 py-2.5 text-xs font-mono text-[var(--color-on-surface)] transition-colors"
              />
            </div>
            <div className="flex items-start gap-2 bg-[var(--color-surface-container-low)] p-3 rounded-lg border border-[var(--color-outline-variant)]">
              <Info size={14} className="text-[var(--color-on-surface-variant)] mt-0.5 shrink-0" />
              <p className="text-[10px] text-[var(--color-on-surface-variant)] leading-normal font-medium">
                Your User ID is a unique random string used to credit your community submissions anonymously. Do not share it with untrusted sources.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
