import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTrendingByCategory, type TrendingCategory } from './api/youtube';
import { useBoolPref, usePreference } from './usePreference';
import { SETTINGS } from './settings/schema';
import type { VideoSummary } from '../types/video';

export const EXPLORE_PAGE_SIZE = 20;

export type ExploreCategory = {
  id: TrendingCategory;
  labelKey: 'explore_category_all' | 'explore_category_gaming' | 'explore_category_music' | 'explore_category_movies' | 'explore_category_live';
};

export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  { id: 'all', labelKey: 'explore_category_all' },
  { id: 'gaming', labelKey: 'explore_category_gaming' },
  { id: 'music', labelKey: 'explore_category_music' },
  { id: 'movies', labelKey: 'explore_category_movies' },
  { id: 'live', labelKey: 'explore_category_live' },
];

type ExploreCacheEntry = {
  videos: VideoSummary[];
  timestamp: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;

export function useExploreCategories() {
  const [selectedCategory, setSelectedCategory] = useState<TrendingCategory>('all');
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = usePreference(SETTINGS.TRENDING_REGION, 'US');
  const [showRegionPicker] = useBoolPref(SETTINGS.SHOW_REGION_PICKER_IN_EXPLORE, true);
  const cacheRef = useRef<Map<string, ExploreCacheEntry>>(new Map());
  const requestRef = useRef(0);

  const cacheKey = `${selectedCategory}:${region}`;

  const displayedVideos = useMemo(() => videos.slice(0, page * EXPLORE_PAGE_SIZE), [page, videos]);
  const canLoadMore = displayedVideos.length < videos.length;

  const loadCategory = useCallback(async (category: TrendingCategory, activeRegion: string, force = false) => {
    const key = `${category}:${activeRegion}`;
    const cached = cacheRef.current.get(key);
    const now = Date.now();

    if (!force && cached && now - cached.timestamp < CACHE_TTL_MS) {
      setVideos(cached.videos);
      setPage(1);
      setError(cached.videos.length === 0 ? 'explore_empty_category' : null);
      setLoading(false);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const nextVideos = await getTrendingByCategory(category, activeRegion);
      if (requestRef.current !== requestId) return;
      cacheRef.current.set(key, { videos: nextVideos, timestamp: Date.now() });
      setVideos(nextVideos);
      setPage(1);
      setError(nextVideos.length === 0 ? 'explore_empty_category' : null);
    } catch (err) {
      if (requestRef.current !== requestId) return;
      console.warn('Failed to load Explore category', err);
      setVideos([]);
      setPage(1);
      setError('explore_load_error');
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategory(selectedCategory, region);
  }, [cacheKey, loadCategory, region, selectedCategory]);

  const refresh = useCallback(() => {
    cacheRef.current.delete(cacheKey);
    void loadCategory(selectedCategory, region, true);
  }, [cacheKey, loadCategory, region, selectedCategory]);

  const loadMore = useCallback(() => {
    setPage((current) => current + 1);
  }, []);

  const selectCategory = useCallback((category: TrendingCategory) => {
    setSelectedCategory(category);
  }, []);

  return {
    selectedCategory,
    selectCategory,
    region,
    setRegion,
    showRegionPicker,
    videos,
    displayedVideos,
    loading,
    error,
    canLoadMore,
    loadMore,
    refresh,
  };
}
