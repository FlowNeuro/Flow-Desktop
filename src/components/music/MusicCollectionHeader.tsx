import { useState } from 'react';
import { Music2, Play, Shuffle } from 'lucide-react';

import { Button } from '../ui/Button';
import { getString } from '../../lib/i18n/index';
import type { CollectionMeta } from '../../lib/useMusicCollection';

interface MusicCollectionHeaderProps {
  meta: CollectionMeta;
  canPlay: boolean;
  onPlay: () => void;
  onShuffle: () => void;
  onArtistClick?: () => void;
}

function Cover({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="grid h-full w-full place-items-center bg-surface-container-high text-neutral-500">
        <Music2 className="h-12 w-12" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

export function MusicCollectionHeader({
  meta,
  canPlay,
  onPlay,
  onShuffle,
  onArtistClick,
}: MusicCollectionHeaderProps) {
  return (
    <header className="relative w-full overflow-hidden rounded-b-3xl p-6 lg:p-8">
      {meta.thumbnail ? (
        <img
          src={meta.thumbnail}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-surface-container" />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)]/80 to-transparent"
      />

      <div className="relative z-10 flex flex-col items-center gap-6 pt-12 sm:flex-row sm:items-end sm:pt-8">
        <div className="h-44 w-44 shrink-0 overflow-hidden rounded-2xl ring-1 ring-neutral-800/50 lg:h-52 lg:w-52">
          <Cover src={meta.thumbnail} alt={meta.title} />
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            {meta.typeLabel}
          </span>
          <h1 className="line-clamp-2 text-3xl font-bold tracking-tight text-neutral-100 lg:text-5xl">
            {meta.title}
          </h1>
          {(meta.artistName || meta.stats) && (
            <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm sm:justify-start">
              {meta.artistName &&
                (onArtistClick ? (
                  <button
                    type="button"
                    onClick={onArtistClick}
                    className="font-medium text-neutral-200 transition-colors duration-200 ease-out hover:text-neutral-100"
                  >
                    {meta.artistName}
                  </button>
                ) : (
                  <span className="font-medium text-neutral-200">{meta.artistName}</span>
                ))}
              {meta.artistName && meta.stats && <span className="text-neutral-600">•</span>}
              {meta.stats && <span className="text-neutral-400">{meta.stats}</span>}
            </p>
          )}

          <div className="mt-3 flex items-center gap-3">
            <Button variant="primary" size="lg" disabled={!canPlay} onClick={onPlay}>
              <Play size={18} fill="currentColor" />
              {getString('music_play')}
            </Button>
            <Button variant="tonal" size="lg" disabled={!canPlay} onClick={onShuffle}>
              <Shuffle size={18} />
              {getString('music_shuffle')}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default MusicCollectionHeader;
