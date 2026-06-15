import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Play, Plus, Shuffle } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { ArtistSkeleton } from '../../components/music/ArtistSkeleton';
import { useArtistPage } from '../../lib/useArtistPage';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import { getString } from '../../lib/i18n/index';
import type { SongItem } from '../../types/music';

export default function ArtistPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const navigate = useNavigate();
  const playQueue = useMusicPlayerStore((s) => s.playQueue);
  const { data, loading, error, reload } = useArtistPage(artistId);

  const [following, setFollowing] = useState(false);

  if (loading && !data) return <ArtistSkeleton />;

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <AlertTriangle className="h-8 w-8 text-neutral-500" />
        <p className="text-sm text-neutral-400">{getString('music_artist_unavailable')}</p>
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

  const { header, topSongs } = data;
  const subtitle = [header.subscriberCountText, header.monthlyListenerCount]
    .filter((p): p is string => Boolean(p?.trim()))
    .join('  •  ');

  const startPlayback = (shuffle: boolean) => {
    if (!topSongs.length) return;
    const queue: SongItem[] = shuffle ? [...topSongs].sort(() => Math.random() - 0.5) : topSongs;
    void playQueue(queue, 0);
  };

  return (
    <div className="pb-32">
      {/* Hero — the sanctioned gradient/blur exception (see Design.md §1) */}
      <header className="relative flex h-[40vh] min-h-[300px] w-full flex-col justify-end overflow-hidden rounded-b-3xl p-8">
        {header.thumbnail ? (
          <img
            src={header.thumbnail}
            alt=""
            aria-hidden="true"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-3xl"
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 bg-surface-container" />
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)]/80 to-transparent"
        />

        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={getString('music_artist_back')}
          className="absolute left-6 top-6 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/30 text-white transition-colors duration-200 ease-out hover:bg-black/50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="relative z-10 flex flex-col">
          <h1 className="text-5xl font-bold tracking-tighter text-white lg:text-7xl">
            {header.title}
          </h1>
          {subtitle && <p className="mt-2 text-neutral-400">{subtitle}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              disabled={!topSongs.length}
              onClick={() => startPlayback(false)}
            >
              <Play size={18} fill="currentColor" />
              {getString('music_play')}
            </Button>
            <Button
              variant="tonal"
              size="lg"
              disabled={!topSongs.length}
              onClick={() => startPlayback(true)}
            >
              <Shuffle size={18} />
              {getString('music_shuffle')}
            </Button>
            <Button variant="outline" size="lg" onClick={() => setFollowing((v) => !v)}>
              {following ? <Check size={18} /> : <Plus size={18} />}
              {following ? getString('music_artist_following') : getString('music_artist_follow')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] flex-col gap-10 p-8" />
    </div>
  );
}
