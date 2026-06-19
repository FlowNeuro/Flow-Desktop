import { useState } from 'react';
import { MoreHorizontal, Music2, Play, Plus, Shuffle } from 'lucide-react';

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
  const metaParts = [
    meta.yearText,
    meta.trackCountText,
    meta.durationText,
  ].filter((part): part is string => Boolean(part?.trim()));

  return (
    <header className="relative flex h-[45vh] min-h-[350px] w-full items-end overflow-hidden bg-surface px-8 pb-8">
      {meta.thumbnail ? (
        <img
          src={meta.thumbnail}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-[80px]"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-surface-container" />
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[var(--color-surface)]/60 to-[var(--color-surface)]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-row items-end gap-8">
        <div className="aspect-square h-48 w-48 shrink-0 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 md:h-56 md:w-56 xl:h-64 xl:w-64">
          <Cover src={meta.thumbnail} alt={meta.title} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-300">
            {meta.typeLabel}
          </span>

          <h1 className="line-clamp-2 text-5xl font-extrabold leading-tight tracking-tighter text-white lg:text-7xl">
            {meta.title}
          </h1>

          {(meta.artistName || metaParts.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-300">
              {meta.artistName ? (
                onArtistClick ? (
                  <button
                    type="button"
                    onClick={onArtistClick}
                    className="font-medium text-white transition-colors duration-200 ease-out hover:underline"
                  >
                    {meta.artistName}
                  </button>
                ) : (
                  <span className="font-medium text-white">{meta.artistName}</span>
                )
              ) : null}

              {meta.artistName && metaParts.length > 0 ? (
                <span className="text-neutral-400">•</span>
              ) : null}

              {metaParts.map((part, index) => (
                <span key={`${part}-${index}`} className="flex items-center gap-2">
                  {index > 0 ? <span className="text-neutral-500">•</span> : null}
                  <span>{part}</span>
                </span>
              ))}
            </div>
          )}

          {meta.description ? (
            <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-neutral-400">
              {meta.description}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canPlay}
              onClick={onPlay}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-neutral-100 px-6 text-base font-medium text-neutral-950 transition-colors duration-200 ease-out hover:bg-white disabled:pointer-events-none disabled:opacity-50"
            >
              <Play className="h-5 w-5" fill="currentColor" />
              {getString('music_play')}
            </button>

            <button
              type="button"
              disabled={!canPlay}
              onClick={onShuffle}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-surface-container-high px-6 text-base font-medium text-neutral-200 transition-colors duration-200 ease-out hover:bg-surface-container-highest disabled:pointer-events-none disabled:opacity-50"
            >
              <Shuffle className="h-5 w-5" />
              {getString('music_shuffle')}
            </button>

            <button
              type="button"
              aria-label={getString('music_save_to_library')}
              className="grid h-12 w-12 place-items-center rounded-full bg-surface-container-high text-neutral-200 transition-colors duration-200 ease-out hover:bg-surface-container-highest"
            >
              <Plus className="h-5 w-5" />
            </button>

            <button
              type="button"
              aria-label={getString('music_more_options')}
              className="grid h-12 w-12 place-items-center rounded-full bg-surface-container-high text-neutral-200 transition-colors duration-200 ease-out hover:bg-surface-container-highest"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default MusicCollectionHeader;
