import { useState, useEffect } from "react";
import { 
  getBrainSnapshot, 
  getFlowPersona, 
  unblockTopic, 
  unblockChannel, 
  resetBrain,
  type UserBrain,
  type PersonaDetails
} from "../lib/api/recommendation";
import { setSetting } from "../lib/api/db";

import { SkeletonLoader } from "../components/persona/SkeletonLoader";
import { PersonaOverview } from "../components/persona/PersonaOverview";
import { LearningStats } from "../components/persona/LearningStats";
import { TasteShape } from "../components/persona/TasteShape";
import { InterestWeights } from "../components/persona/InterestWeights";
import { TimePatterns } from "../components/persona/TimePatterns";
import { ChannelMemory } from "../components/persona/ChannelMemory";
import { BlockedContent } from "../components/persona/BlockedContent";
import { LearningActivity } from "../components/persona/LearningActivity";
import { ProfileData } from "../components/persona/ProfileData";

import { RefreshCw, BrainCog  } from "lucide-react";

export function FlowNeuroPersona() {
  const [brain, setBrain] = useState<UserBrain | null>(null);
  const [persona, setPersona] = useState<PersonaDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBrainData = async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const snapshot = await getBrainSnapshot(force);
      setBrain(snapshot);

      const personaDetails = await getFlowPersona();
      setPersona(personaDetails);
    } catch (e) {
      console.error("Failed to load recommendation telemetry:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBrainData();
  }, []);

  const handleUnblockTopic = async (topic: string) => {
    try {
      await unblockTopic(topic);
      await fetchBrainData(true);
    } catch (e) {
      console.error("Failed to unblock topic:", e);
    }
  };

  const handleUnblockChannel = async (channelId: string) => {
    try {
      await unblockChannel(channelId);
      await fetchBrainData(true);
    } catch (e) {
      console.error("Failed to unblock channel:", e);
    }
  };

  const handleImportBrain = async (importedBrain: UserBrain) => {
    try {
      await setSetting("user_neuro_brain", JSON.stringify(importedBrain));
      await fetchBrainData(true);
    } catch (e) {
      console.error("Failed to import brain:", e);
      throw e;
    }
  };

  const handleResetBrain = async () => {
    try {
      await resetBrain();
      await fetchBrainData(true);
    } catch (e) {
      console.error("Failed to reset brain:", e);
      throw e;
    }
  };

  if (loading && !brain) {
    return (
      <div className="flex-grow h-full overflow-y-auto bg-[var(--color-background)]">
        <div className="grid grid-cols-12 gap-6 mx-auto p-8">
          <div className="col-span-12 flex items-center justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-on-surface)] flex items-center gap-3">
              <BrainCog className="h-7 w-7 text-[var(--color-primary)] animate-pulse" />
               Control Center
            </h1>
          </div>
          <div className="col-span-12">
            <SkeletonLoader />
          </div>
        </div>
      </div>
    );
  }

  const activeBrain = brain!;

  return (
    <div className="flex-grow h-full overflow-y-auto">
      <div className="grid grid-cols-12 gap-6 mx-auto p-8 animate-pane-in">
        {/* Page Header */}
        <div className="col-span-12 flex items-center justify-between gap-4 border-b border-[var(--color-outline-variant)] pb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-on-surface)] flex items-center gap-3">
              Control Center
            </h1>
            <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">
              Analyze and manage local recommendation signals, memory, and sync controls.
            </p>
          </div>

          <button
            onClick={() => fetchBrainData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] disabled:opacity-50 text-[var(--color-on-surface)] py-2.5 px-4 rounded-full text-xs font-semibold border border-[var(--color-outline-variant)] transition-colors active:scale-95 cursor-pointer shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[var(--color-primary)]" : ""}`} />
            {refreshing ? "Refreshing..." : "Sync"}
          </button>
        </div>

        {/* Top Overview Card */}
        <div className="col-span-12">
          <PersonaOverview brain={activeBrain} persona={persona} />
        </div>

        {/* Counter Telemetry Grid */}
        <div className="col-span-12">
          <LearningStats brain={activeBrain} />
        </div>

        {/* Two Columns for Complex Analytics Charts */}
        <div className="col-span-12 md:col-span-5">
          <TasteShape brain={activeBrain} />
        </div>
        <div className="col-span-12 md:col-span-7">
          <InterestWeights brain={activeBrain} />
        </div>

        {/* Hourly Context Patterns */}
        <div className="col-span-12">
          <TimePatterns brain={activeBrain} />
        </div>

        {/* Creator Memories & Blocked Filters */}
        <div className="col-span-12 lg:col-span-6">
          <ChannelMemory brain={activeBrain} />
        </div>

        {/* Blocked Filters Section (rendered conditionally if blocks exist) */}
        {(activeBrain.blocked_topics?.length > 0 || activeBrain.blocked_channels?.length > 0) && (
          <div className="col-span-12 lg:col-span-6">
            <BlockedContent 
              brain={activeBrain} 
              onUnblockTopic={handleUnblockTopic} 
              onUnblockChannel={handleUnblockChannel} 
            />
          </div>
        )}

        <div className="col-span-12">
          <LearningActivity />
        </div>

        <div className="col-span-12">
          <ProfileData
            brain={activeBrain}
            onImport={handleImportBrain}
            onReset={handleResetBrain}
          />
        </div>

      </div>
    </div>
  );
}

export default FlowNeuroPersona;
