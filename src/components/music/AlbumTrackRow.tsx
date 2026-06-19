import { Heart, MoreHorizontal, Play, Volume2 } from 'lucide-react';

import { getString } from '../../lib/i18n/index';
import { artistsText, formatTime } from '../../lib/musicFormat';
import type { SongItem } from '../../types/music';

interface AlbumTrackRowProps {
  track: SongItem;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  streamsText?: string | null;
  onPlay: (track: SongItem) => void;
  onAddToQueue: (track: SongItem) => void;
  onLike?: (track: SongItem) => void;
  onMenu?: (track: SongItem) => void;
}

function ExplicitBadge() {
  const label = getString('music_explicit');
  return (
    <span
      title={label}
      aria-label={label}
      className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px] bg-neutral-700 text-[10px] font-bold leading-none text-neutral-300"
    >
      E
    </span>
  );
}

function EqualizerGlyph() {
  return (
    <span className="flex h-4 w-4 items-end justify-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full bg-[var(--color-primary)] animate-pulse"
          style={{
            height: `${8 + bar * 3}px`,
            animationDelay: `${bar * 120}ms`,
            animationDuration: '700ms',
          }}
        />
      ))}
    </span>
  );
}

export function AlbumTrackRow({
  track,
  index,
  isCurrent,
  isPlaying,
  streamsText,
  onPlay,
  onAddToQueue,
  onLike,
  onMenu,
}: AlbumTrackRowProps) {
  const artistLabel = artistsText(track.artists);
  const duration = track.duration == null ? '' : formatTime(track.duration);
  const showEq = isCurrent && isPlaying;

  const handleMenu = () => {
    if (onMenu) onMenu(track);
    else onAddToQueue(track);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPlay(track)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPlay(track);
        }
      }}
      className={`group flex cursor-pointer items-center rounded-lg px-4 py-2 transition-colors duration-200 ease-out hover:bg-surface-container-low ${
        isCurrent ? 'bg-surface-container-low' : ''
      }`}
    >
      <div className="relative grid w-12 shrink-0 place-items-center">
        {showEq ? (
          <EqualizerGlyph />
        ) : isCurrent ? (
          <Volume2 className="h-4 w-4 text-[var(--color-primary)]" />
        ) : (
          <>
            <span className="font-mono text-sm text-neutral-500 transition-opacity duration-200 ease-out group-hover:opacity-0">
              {index + 1}
            </span>
            <Play
              className="absolute h-4 w-4 text-white opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100"
              fill="currentColor"
            />
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`line-clamp-1 font-medium ${isCurrent ? 'text-[var(--color-primary)]' : 'text-neutral-100'}`}>
          {track.title}
        </span>
        {(artistLabel || track.explicit) && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-neutral-400 transition-colors duration-200 ease-out group-hover:text-neutral-300">
            {track.explicit ? <ExplicitBadge /> : null}
            {artistLabel ? <span className="line-clamp-1">{artistLabel}</span> : null}
          </span>
        )}
      </div>

      <span className="hidden w-32 shrink-0 text-right font-mono text-sm tabular-nums text-neutral-500 lg:block">
        {streamsText ?? ''}
      </span>

      <div className="ml-4 flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
        <button
          type="button"
          aria-label={getString('music_like_track')}
          onClick={(event) => {
            event.stopPropagation();
            onLike?.(track);
          }}
          className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors duration-200 ease-out hover:bg-surface-container-high hover:text-neutral-100"
        >
          <Heart className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={getString('music_more_options')}
          onClick={(event) => {
            event.stopPropagation();
            handleMenu();
          }}
          className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors duration-200 ease-out hover:bg-surface-container-high hover:text-neutral-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums text-neutral-400">
        {duration}
      </span>
    </div>
  );
}

export default AlbumTrackRow;
