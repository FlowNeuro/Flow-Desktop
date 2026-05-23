import type { UserBrain } from "../../lib/api/recommendation";
import {
  BarChart2,
  BookOpen,
  FileText,
  History,
  Layers,
  ShieldAlert,
  ThumbsDown,
  Tv,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface LearningStatsProps {
  brain: UserBrain;
}

interface StatItem {
  label: string;
  value: number;
  icon: LucideIcon;
}

function formatStat(value: number) {
  return value.toLocaleString();
}

export function LearningStats({ brain }: LearningStatsProps) {
  const stats: StatItem[] = [
    {
      label: "Global Interactions",
      value: brain.total_interactions || 0,
      icon: BarChart2,
    },
    {
      label: "Semantic Topics",
      value: Object.keys(brain.topic_evidence || {}).length,
      icon: BookOpen,
    },
    {
      label: "Evidence Profiles",
      value: Object.values(brain.topic_evidence || {}).filter((topic) => topic.positive_score >= 1).length,
      icon: Layers,
    },
    {
      label: "Channel Memories",
      value: Object.keys(brain.channel_scores || {}).length,
      icon: Tv,
    },
    {
      label: "Watch Sessions",
      value: Object.keys(brain.watch_history_map || {}).length,
      icon: History,
    },
    {
      label: "Feed Impressions",
      value: Object.keys(brain.feed_history || {}).length,
      icon: FileText,
    },
    {
      label: "Suppression Locks",
      value:
        Object.keys(brain.suppressed_video_ids || {}).length +
        Object.keys(brain.suppressed_channels || {}).length,
      icon: ShieldAlert,
    },
    {
      label: "Rejection Patterns",
      value: Object.keys(brain.rejection_patterns || {}).length,
      icon: ThumbsDown,
    },
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <div
            key={stat.label}
            className="relative min-h-28 rounded-2xl bg-[var(--color-surface-container-low)] border border-[var(--color-outline-variant)] p-4"
          >
            <Icon className="absolute right-4 top-4 h-5 w-5 text-[var(--color-on-surface-variant)] opacity-70" />
            <div className="pr-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-on-surface-variant)]">
                {stat.label}
              </p>
              <p className="mt-5 font-mono text-3xl leading-none text-[var(--color-on-surface)]">
                {formatStat(stat.value)}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
