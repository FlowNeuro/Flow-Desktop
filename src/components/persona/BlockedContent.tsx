import { useState, useEffect } from "react";
import type { UserBrain } from "../../lib/api/recommendation";
import { getChannelDetails } from "../../lib/api/youtube";
import { Ban, Trash2, Globe, EyeOff } from "lucide-react";

interface BlockedContentProps {
  brain: UserBrain;
  onUnblockTopic: (topic: string) => void;
  onUnblockChannel: (channelId: string) => void;
}

export function BlockedContent({ brain, onUnblockTopic, onUnblockChannel }: BlockedContentProps) {
  const [channelNames, setChannelNames] = useState<Record<string, string>>({});
  const blockedTopics = brain.blocked_topics || [];
  const blockedChannels = brain.blocked_channels || [];

  useEffect(() => {
    const fetchNames = async () => {
      const pendingIds = blockedChannels.filter(id => id.startsWith("UC") && !channelNames[id]);
      if (pendingIds.length === 0) return;

      const resolved: Record<string, string> = {};
      for (const id of pendingIds) {
        try {
          const details = await getChannelDetails(id);
          if (details && details.name) {
            resolved[id] = details.name;
          }
        } catch (e) {
          console.warn("Failed to fetch channel details for blocked channel", id, e);
        }
      }
      if (Object.keys(resolved).length > 0) {
        setChannelNames(prev => ({ ...prev, ...resolved }));
      }
    };
    fetchNames();
  }, [brain.blocked_channels]);

  if (blockedTopics.length === 0 && blockedChannels.length === 0) {
    return null;
  }

  return (
    <div className="w-full rounded-2xl bg-zinc-950 border border-zinc-900 p-6 flex flex-col gap-6 shadow-lg shadow-black/30">
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-400">
          <Ban className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-black text-white">Blocked Content Filters</h3>
          <p className="text-xs text-zinc-400 font-semibold">
            Suppressed streams that are completely filtered out of your recommendations
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Blocked Topics */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Blocked Topics ({blockedTopics.length})</span>
          </div>

          {blockedTopics.length === 0 ? (
            <div className="h-20 flex items-center justify-center rounded-xl bg-zinc-900/20 border border-zinc-900 border-dashed text-zinc-600 text-xs font-semibold">
              No topics blocked
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {blockedTopics.map((topic) => (
                <div
                  key={topic}
                  className="group flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-zinc-900/30 border border-zinc-900 hover:border-red-900/30 hover:bg-red-950/5 transition-all duration-300"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Globe className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                    <span className="text-xs font-bold text-zinc-300 truncate capitalize">{topic}</span>
                  </div>
                  <button
                    onClick={() => onUnblockTopic(topic)}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/40 text-zinc-500 hover:text-primary transition-all duration-200 cursor-pointer active:scale-90"
                    title={`Unblock ${topic}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Blocked Channels */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Blocked Creators ({blockedChannels.length})</span>
          </div>

          {blockedChannels.length === 0 ? (
            <div className="h-20 flex items-center justify-center rounded-xl bg-zinc-900/20 border border-zinc-900 border-dashed text-zinc-600 text-xs font-semibold">
              No channels blocked
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {blockedChannels.map((id) => {
                const name = channelNames[id] || (id.startsWith("UC") ? `Channel (${id.slice(0, 8)}...)` : id);
                return (
                  <div
                    key={id}
                    className="group flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-zinc-900/30 border border-zinc-900 hover:border-red-900/30 hover:bg-red-950/5 transition-all duration-300"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <EyeOff className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                      <span className="text-xs font-bold text-zinc-300 truncate">{name}</span>
                    </div>
                    <button
                      onClick={() => onUnblockChannel(id)}
                      className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/40 text-zinc-500 hover:text-primary transition-all duration-200 cursor-pointer active:scale-90"
                      title={`Unblock ${name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
