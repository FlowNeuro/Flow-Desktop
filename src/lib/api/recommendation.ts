import type { VideoSummary } from "../../types/video";
import { isTauriEnv } from "./env";
import { invokeBackend } from "./errors";

export interface PersonaDetails {
  name: string;
  title: string;
  description: string;
  icon: string;
}

export async function rankVideos(
  candidates: VideoSummary[],
  userSubs: string[],
): Promise<VideoSummary[]> {
  if (!(await isTauriEnv())) {
    console.warn("Tauri not detected. Returning candidates with mock ranking.");
    return [...candidates].sort(() => 0.5 - Math.random());
  }
  return invokeBackend<VideoSummary[]>("rank_videos", { candidates, userSubs });
}

export async function logInteraction(
  videoId: string,
  title: string,
  channelName: string,
  channelId: string,
  description: string | null,
  durationSeconds: number | null,
  isLive: boolean,
  isShort: boolean,
  interactionType: string,
  percentWatched: number,
): Promise<void> {
  if (!(await isTauriEnv())) {
    console.log(`[FlowNeuro Mock Log] ${interactionType} - ${title} (${percentWatched * 100}%)`);
    return;
  }
  return invokeBackend<void>("log_interaction", {
    videoId,
    title,
    channelName,
    channelId,
    description,
    durationSeconds,
    isLive,
    isShort,
    interactionType,
    percentWatched,
  });
}

export async function markNotInterested(
  videoId: string,
  title: string,
  channelName: string,
  channelId: string,
  description: string | null,
  durationSeconds: number | null,
  isLive: boolean,
  isShort: boolean,
): Promise<void> {
  if (!(await isTauriEnv())) {
    console.log(`[FlowNeuro Mock] Not interested - ${title}`);
    return;
  }
  return invokeBackend<void>("mark_not_interested", {
    videoId,
    title,
    channelName,
    channelId,
    description,
    durationSeconds,
    isLive,
    isShort,
  });
}

export async function recordFeedImpressions(
  videos: VideoSummary[],
): Promise<void> {
  if (!(await isTauriEnv())) {
    return;
  }
  return invokeBackend<void>("record_feed_impressions", { videos });
}

export async function completeOnboarding(preferred: string[]): Promise<void> {
  if (!(await isTauriEnv())) {
    console.warn("Tauri not detected. Setting onboarding complete in local storage.");
    localStorage.setItem("mock_setting_onboarded", "true");
    localStorage.setItem("mock_setting_preferred_topics", JSON.stringify(preferred));
    return;
  }
  return invokeBackend<void>("complete_onboarding", { preferred });
}

export async function getOnboardingStatus(): Promise<boolean> {
  if (!(await isTauriEnv())) {
    const status = localStorage.getItem("mock_setting_onboarded") === "true";
    console.log("[FlowNeuro Mock Onboarding Status Check]", status);
    return status;
  }
  return invokeBackend<boolean>("get_onboarding_status");
}

export async function generateDiscoveryQueries(): Promise<string[]> {
  if (!(await isTauriEnv())) {
    const preferred = localStorage.getItem("mock_setting_preferred_topics");
    const topics: string[] = preferred ? JSON.parse(preferred) : [];
    if (topics.length > 0) {
      return topics.slice(0, 5).map((topic) => topic.toLowerCase());
    }
    return ["technology", "music", "gaming", "science", "documentary"];
  }
  return invokeBackend<string[]>("generate_discovery_queries");
}

export async function getFlowPersona(): Promise<PersonaDetails> {
  if (!(await isTauriEnv())) {
    const preferred = localStorage.getItem("mock_setting_preferred_topics");
    const topics: string[] = preferred ? JSON.parse(preferred) : [];
    
    if (topics.some((t) => ["Coding", "Technology", "Programming"].includes(t))) {
      return {
        name: "TECH_ENGINEER",
        title: "💻 Silicon Alchemist",
        description: "Your local recommendation brain indicates you are heavily inclined towards software engineering, machine learning, and system structures.",
        icon: "💻",
      };
    }
    return {
      name: "COSMIC_EXPLORER",
      title: "🌌 Cosmic Navigator",
      description: "You exhibit high affinity towards sciences, astrophysics, history, and acoustic ambient music sessions.",
      icon: "🌌",
    };
  }
  return invokeBackend<PersonaDetails>("get_flow_persona");
}
