import React, { useState, useEffect } from "react";
import { Clock, Trash2, Calendar, Play, Loader2 } from "lucide-react";
import { getWatchHistory, clearWatchHistory, deleteWatchRecord } from "../lib/api/db";
import type { WatchHistoryRecord } from "../types/db";
import type { VideoSummary } from "../types/video";
import { getString } from "../lib/i18n/index";

interface HistoryProps {
  onPlay: (video: VideoSummary) => void;
}

export const History: React.FC<HistoryProps> = ({ onPlay }) => {
  const [history, setHistory] = useState<WatchHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const records = await getWatchHistory(100, 0);
      setHistory(records);
    } catch (e) {
      console.error("Failed to fetch history", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleClearAll = async () => {
    try {
      await clearWatchHistory();
      setHistory([]);
      setShowClearConfirm(false);
    } catch (e) {
      console.error("Failed to clear watch history", e);
    }
  };

  const handleDeleteItem = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteWatchRecord(videoId);
      setHistory((prev) => prev.filter((item) => item.videoId !== videoId));
    } catch (e) {
      console.error("Failed to delete watch history record", e);
    }
  };

  const handlePlayHistory = (item: WatchHistoryRecord) => {
    const summary: VideoSummary = {
      id: item.videoId,
      title: item.title,
      channelName: item.channelName || "Unknown Channel",
      thumbnailUrl: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
      durationSeconds: item.totalDurationSeconds || 0,
      publishedText: "Watched recently",
      viewCountText: "History Item",
    };
    onPlay(summary);
  };

  const formatDate = (timestamp?: string) => {
    if (!timestamp) return "Recently";
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-zinc-400 bg-clip-text text-transparent">
            {getString("library_history_label")}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Revisit your personalized playback history and discover logs
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 border border-primary/20 hover:border-primary/40 bg-red-950/10 text-red-400 hover:text-red-300 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95 shrink-0"
          >
            <Trash2 size={14} />
            {getString("clear_all")}
          </button>
        )}
      </div>

      {/* Main timeline listing */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="animate-spin text-primary" size={36} />
          <p className="text-zinc-500 text-sm font-medium">Restoring your timeline...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-800 rounded-3xl p-8 bg-zinc-900/10">
          <Clock className="text-zinc-700 mb-4" size={48} />
          <h3 className="font-bold text-zinc-300">{getString("empty_watch_history")}</h3>
          <p className="text-zinc-500 text-xs mt-1 max-w-sm">
            {getString("empty_watch_history_body")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-20 max-w-4xl">
          {history.map((item) => (
            <div
              key={item.id}
              onClick={() => handlePlayHistory(item)}
              className="flex items-center gap-4 p-3 bg-zinc-900/20 hover:bg-zinc-900/50 border border-zinc-800/30 hover:border-zinc-700/50 rounded-2xl cursor-pointer group transition-all duration-300"
            >
              {/* Cover thumbnail */}
              <div className="relative w-28 aspect-video rounded-xl overflow-hidden shrink-0 bg-zinc-950">
                <img
                  src={`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=150";
                  }}
                />
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Play size={16} fill="white" className="text-white" />
                </div>
              </div>

              {/* Title & Channel details */}
              <div className="flex-grow min-w-0">
                <h4 className="text-sm font-semibold text-zinc-200 group-hover:text-red-400 transition-colors line-clamp-1">
                  {item.title}
                </h4>
                <p className="text-xs text-zinc-400 mt-1">{item.channelName}</p>

                {/* Watched date tag */}
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase mt-3">
                  <Calendar size={11} />
                  {formatDate(item.watchDate)}
                </div>
              </div>

              {/* Options delete record action */}
              <button
                onClick={(e) => handleDeleteItem(item.videoId, e)}
                title="Remove from history"
                className="p-2 rounded-xl hover:bg-zinc-800/80 text-zinc-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Clear watch history confirmation overlay modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 max-w-sm w-full rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100">
              {getString("clear_watch_history_alert_title")}
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {getString("clear_watch_history_alert_body")}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 border border-zinc-800 hover:bg-zinc-800 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {getString("cancel")}
              </button>
              <button
                onClick={handleClearAll}
                className="px-5 py-2.5 bg-primary hover:bg-primary text-white rounded-xl text-xs font-semibold shadow-lg shadow-primary/10 active:scale-95 transition-all"
              >
                {getString("clear")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
