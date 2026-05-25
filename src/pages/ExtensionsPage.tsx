import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useSettingsStore } from "../store/useSettingsStore";
import { SponsorBlockCategoriesList } from "../components/extensions/SponsorBlockCategoriesList";
import { StatsDashboard } from "../components/extensions/StatsDashboard";

export const ExtensionsPage: React.FC = () => {
  const { loadSettings } = useSettingsStore();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleManualSave = () => {
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-20 bg-[var(--color-background)]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-[var(--color-background)] backdrop-blur-sm pb-4 pt-2 border-b border-[var(--color-outline-variant)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-on-surface)]">
            Extensions & Integrations
          </h1>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
            Configure crowdsourced SponsorBlock skips, DeArrow clickbait normalizations, and Return YouTube Dislike telemetry
          </p>
        </div>

        <button
          onClick={handleManualSave}
          className="flex items-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)] active:scale-95 text-[var(--color-on-surface)] font-bold text-xs py-2.5 px-6 rounded-full transition-all shadow-none shrink-0 cursor-pointer"
        >
          {saveStatus === "saved" ? (
            <>
              <Check size={14} />
              Saved Successfully
            </>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>

      {/* Main Responsive Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
        {/* Left Column - Configurations */}
        <div className="space-y-6 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto pr-2 scrollbar-none">
          <SponsorBlockCategoriesList />
        </div>

        {/* Right Column - Stats Dashboard & Endpoint Configurations (Sticky Sidebar) */}
        <div className="lg:sticky lg:top-24 space-y-6">
          <StatsDashboard />
        </div>
      </div>
    </div>
  );
};

export default ExtensionsPage;
