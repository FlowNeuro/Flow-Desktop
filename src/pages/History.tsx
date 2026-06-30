import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Loader2, Trash2 } from "lucide-react";
import type { VideoSummary } from "../types/video";
import { getString } from "../lib/i18n/index";
import { HistoryDateGroup } from "../components/history/HistoryDateGroup";
import { MusicHistoryGroup } from "../components/history/MusicHistoryGroup";
import { Button } from "../components/ui/Button";
import { SearchInput } from "../components/ui/SearchInput";
import { CategoryChips } from "../components/layout/CategoryChips";
import { useHistory, groupHistoryByDate } from "../lib/useHistory";

type HistoryFilter = "all" | "videos" | "music";

interface HistoryProps {
  onPlay: (video: VideoSummary) => void;
}

export const History: React.FC<HistoryProps> = ({ onPlay }) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const {
    history,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    removeHistoryItem,
    clearHistory,
  } = useHistory();

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  const filters = useMemo(
    () => [
      { key: "all" as const, label: getString("history_filter_all") },
      { key: "videos" as const, label: getString("history_filter_videos") },
      { key: "music" as const, label: getString("history_filter_music") },
    ],
    [],
  );
  const activeLabel = filters.find((f) => f.key === filter)?.label ?? filters[0]?.label ?? "";

  const visibleGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = history.filter((record) => {
      if (filter === "music" && !record.isMusic) return false;
      if (filter === "videos" && record.isMusic) return false;
      if (query) {
        const haystack = `${record.title ?? ""} ${record.channelName ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    return groupHistoryByDate(filtered);
  }, [history, filter, searchQuery]);

  const handleClearAll = async () => {
    try {
      await clearHistory();
      setShowClearConfirm(false);
    } catch (e) {
      console.error("Failed to clear watch history", e);
    }
  };

  const handleDeleteItem = async (videoId: string) => {
    try {
      await removeHistoryItem(videoId);
    } catch (e) {
      console.error("Failed to delete watch history record", e);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full pb-20">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-neutral-100 lg:text-4xl">
              {getString("watch_history_title")}
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              {getString("watch_history_subtitle")}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
            <SearchInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={getString("search_history_placeholder")}
              containerClassName="w-full sm:w-72"
              disabled={loading || history.length === 0}
            />

            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowClearConfirm(true)}
              disabled={loading || history.length === 0}
              className="shrink-0"
            >
              <Trash2 size={16} />
              {getString("clear_all")}
            </Button>
          </div>
        </header>

        <CategoryChips
          categories={filters.map((f) => f.label)}
          activeCategory={activeLabel}
          onCategoryChange={(label) =>
            setFilter(filters.find((f) => f.label === label)?.key ?? "all")
          }
          sticky={false}
          className="mt-2"
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="h-9 w-9 animate-spin text-[var(--color-primary)]" />
            <p className="mt-4 text-sm font-medium text-neutral-500">
              {getString("history_loading")}
            </p>
          </div>
        ) : history.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-surface-container-low p-10 text-center">
            <Clock className="mb-4 h-12 w-12 text-neutral-700" />
            <h3 className="font-bold text-neutral-300">{getString("empty_watch_history")}</h3>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              {getString("empty_watch_history_body")}
            </p>
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-neutral-800 bg-surface-container-low p-8 text-center">
            <p className="text-sm font-medium text-neutral-300">
              No history results match your search.
            </p>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            {visibleGroups.map((group) =>
              filter === "music" ? (
                <MusicHistoryGroup
                  key={group.dateLabel}
                  group={group}
                  onRemoveFromHistory={handleDeleteItem}
                />
              ) : (
                <HistoryDateGroup
                  key={group.dateLabel}
                  group={group}
                  onPlay={onPlay}
                  onRemoveFromHistory={handleDeleteItem}
                />
              ),
            )}

            {hasMore && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-6"
              >
                {loadingMore && (
                  <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clear watch history confirmation overlay modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-800 bg-surface-container p-6">
            <h3 className="text-lg font-bold text-neutral-100">
              {getString("clear_watch_history_alert_title")}
            </h3>
            <p className="text-sm leading-relaxed text-neutral-400">
              {getString("clear_watch_history_alert_body")}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowClearConfirm(false)}
              >
                {getString("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleClearAll}
              >
                {getString("clear")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
