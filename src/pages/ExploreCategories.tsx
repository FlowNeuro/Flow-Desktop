import { useEffect, useMemo, useRef } from 'react';
import { Loader2, RefreshCcw, RotateCcw } from 'lucide-react';
import { CategoryChips } from '../components/layout/CategoryChips';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Select } from '../components/ui/Select';
import { VideoGrid } from '../components/video/VideoGrid';
import { getString, type StringKey } from '../lib/i18n/index';
import { EXPLORE_CATEGORIES, useExploreCategories } from '../lib/useExploreCategories';
import { REGION_OPTIONS } from '../lib/regionOptions';
import type { VideoSummary } from '../types/video';

type ExploreCategoriesProps = {
  onPlay: (video: VideoSummary) => void;
  onAddToQueue: (video: VideoSummary) => void;
};

export default function ExploreCategories({ onPlay, onAddToQueue }: ExploreCategoriesProps) {
  const {
    selectedCategory,
    selectCategory,
    region,
    setRegion,
    showRegionPicker,
    displayedVideos,
    loading,
    error,
    canLoadMore,
    loadMore,
    refresh,
  } = useExploreCategories();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!canLoadMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, loadMore]);

  const currentRegionLabel = useMemo(
    () => REGION_OPTIONS.find((option) => option.value === region)?.label ?? region,
    [region],
  );

  const categoryLabels = useMemo(
    () => EXPLORE_CATEGORIES.map((category) => getString(category.labelKey)),
    [],
  );

  const activeCategoryLabel = useMemo(
    () => getString(EXPLORE_CATEGORIES.find((category) => category.id === selectedCategory)?.labelKey ?? 'explore_category_all'),
    [selectedCategory],
  );

  return (
    <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-5">
        <div className="flex flex-col gap-4 border-b border-chrome-neutral-800/50 pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-chrome-neutral-500">
                {getString('explore_overline')}
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-chrome-neutral-100">
                {getString('explore_title')}
              </h1>
              <p className="mt-1 text-sm text-chrome-neutral-400">
                {getString('explore_subtitle', currentRegionLabel)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showRegionPicker && (
                <Select
                  value={region}
                  onChange={setRegion}
                  options={REGION_OPTIONS}
                  className="w-48"
                />
              )}
              <IconButton
                aria-label={getString('refresh')}
                title={getString('refresh')}
                onClick={refresh}
                disabled={loading}
                variant="secondary"
                size="sm"
              >
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
              </IconButton>
            </div>
          </div>

          <CategoryChips
            sticky={false}
            categories={categoryLabels}
            activeCategory={activeCategoryLabel}
            className="px-0 py-0"
            onCategoryChange={(label) => {
              const category = EXPLORE_CATEGORIES.find((item) => getString(item.labelKey) === label);
              if (category) selectCategory(category.id);
            }}
          />
        </div>

        {loading ? (
          <VideoGrid loading skeletonCount={12} onPlay={onPlay} onAddToQueue={onAddToQueue} />
        ) : error ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-chrome-neutral-800 bg-surface-container-low p-8 text-center">
            <div>
              <h2 className="text-base font-medium text-chrome-neutral-200">{getString(error as StringKey)}</h2>
              <p className="mt-1 text-sm text-chrome-neutral-400">{getString('explore_error_subtitle')}</p>
            </div>
            <Button type="button" onClick={refresh}>
              <RotateCcw className="h-4 w-4" />
              {getString('retry')}
            </Button>
          </div>
        ) : (
          <VideoGrid videos={displayedVideos} onPlay={onPlay} onAddToQueue={onAddToQueue} />
        )}

        {!loading && !error && canLoadMore && (
          <div ref={sentinelRef} className="flex justify-center pb-12">
            <Button type="button" onClick={loadMore} variant="tonal" size="sm">
              {getString('explore_load_more')}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
