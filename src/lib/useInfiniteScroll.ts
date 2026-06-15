import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  hasNextPage: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
}

export function useInfiniteScroll<T extends HTMLElement = HTMLDivElement>({
  hasNextPage,
  isLoading,
  onLoadMore,
  rootMargin = '600px',
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<T | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoading) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isLoading, rootMargin]);

  return sentinelRef;
}

export default useInfiniteScroll;
