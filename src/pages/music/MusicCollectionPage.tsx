import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { MusicCollectionHeader } from '../../components/music/MusicCollectionHeader';
import { MusicItemCard } from '../../components/music/MusicItemCard';
import { useMusicCollection, type CollectionKind } from '../../lib/useMusicCollection';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import { getString } from '../../lib/i18n/index';
import type { SongItem } from '../../types/music';

const videoIdOf = (t: SongItem) => t.videoId ?? t.id;

function CollectionSkeleton() {
  return (
    <div className="animate-pulse pb-32">
      <div className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-end lg:p-8">
        <div className="h-44 w-44 shrink-0 rounded-2xl bg-surface-container-low lg:h-52 lg:w-52" />
        <div className="flex w-full flex-col items-center gap-3 sm:items-start">
          <div className="h-3 w-16 rounded bg-surface-container-low" />
          <div className="h-9 w-2/3 max-w-md rounded-lg bg-surface-container-low" />
          <div className="h-4 w-40 rounded bg-surface-container-low" />
          <div className="mt-3 h-12 w-56 rounded-full bg-surface-container-low" />
        </div>
      </div>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-1 px-6 pt-6 lg:px-8">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-2">
            <div className="h-12 w-12 shrink-0 rounded-md bg-surface-container-low" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-3.5 w-1/2 rounded bg-surface-container-low" />
              <div className="h-3 w-1/3 rounded bg-surface-container-low" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MusicCollectionPage({ kind }: { kind: CollectionKind }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playQueue = useMusicPlayerStore((s) => s.playQueue);
  const addToQueue = useMusicPlayerStore((s) => s.addToQueue);

  const { meta, songs, loading, loadingMore, error, hasMore, loadMore, reload } = useMusicCollection(
    kind,
    id,
  );
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore || loadingMore || typeof IntersectionObserver === 'undefined') return;
    const target = sentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '0px 0px 800px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  if (loading && !meta) return <CollectionSkeleton />;

  if (error || !meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <AlertTriangle className="h-8 w-8 text-neutral-500" />
        <p className="text-sm text-neutral-400">{getString('music_collection_unavailable')}</p>
        <div className="flex items-center gap-3">
          <Button variant="tonal" onClick={() => navigate(-1)}>
            {getString('music_artist_back')}
          </Button>
          <Button variant="primary" onClick={() => void reload()}>
            {getString('music_retry')}
          </Button>
        </div>
      </div>
    );
  }

  const playFrom = (track: SongItem) => {
    const start = Math.max(0, songs.findIndex((t) => videoIdOf(t) === videoIdOf(track)));
    void playQueue(songs, start);
  };
  const playAll = (shuffle: boolean) => {
    if (!songs.length) return;
    void playQueue(shuffle ? [...songs].sort(() => Math.random() - 0.5) : songs, 0);
  };
  const openArtist = meta.artistId
    ? () => navigate(`/music/artist/${meta.artistId}`)
    : undefined;

  return (
    <div className="pb-32">
      <MusicCollectionHeader
        meta={meta}
        canPlay={songs.length > 0}
        onPlay={() => playAll(false)}
        onShuffle={() => playAll(true)}
        onArtistClick={openArtist}
      />

      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-6 pt-6 lg:px-8">
        {meta.description && (
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p
              className={`whitespace-pre-line text-sm leading-relaxed text-neutral-300 ${
                aboutExpanded ? '' : 'line-clamp-4'
              }`}
            >
              {meta.description}
            </p>
            {meta.description.length > 240 && (
              <button
                type="button"
                onClick={() => setAboutExpanded((v) => !v)}
                className="mt-3 text-sm font-medium text-neutral-400 transition-colors duration-200 ease-out hover:text-neutral-100"
              >
                {aboutExpanded
                  ? getString('music_artist_read_less')
                  : getString('music_artist_read_more')}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col">
          {songs.map((song, i) => (
            <div key={`${videoIdOf(song)}-${i}`} className="flex items-center gap-1">
              <span className="w-7 shrink-0 text-center font-mono text-sm text-neutral-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <MusicItemCard
                  variant="track-list"
                  item={song}
                  onPlay={() => playFrom(song)}
                  onMenu={() => addToQueue(song)}
                />
              </div>
            </div>
          ))}
        </div>

        {hasMore && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div ref={sentinelRef} className="h-px w-full" />
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors duration-200 ease-out hover:bg-surface-container-highest disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              {getString('music_load_more')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
