import { useEffect, useRef, useState } from 'react';
import { Heart, MoreHorizontal, Music2, Play, Volume2 } from 'lucide-react';

import { getString } from '../../lib/i18n/index';
import { artistsText, formatTime } from '../../lib/musicFormat';
import { upgradeMusicImageUrl } from '../../lib/thumbnails';
import { extractDominantColorFromImage, useDominantColor } from '../../lib/useDominantColor';
import { useProxiedImageUrl } from '../../lib/useProxiedImageUrl';
import type { SongItem } from '../../types/music';
import { PlayingWave } from './PlayingWave';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

interface AlbumTrackRowProps {
  track: SongItem;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  streamsText?: string | null;
  showArtwork?: boolean;
  showStreamsColumn?: boolean;
  compactActions?: boolean;
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

function colorBackground(color: { r: number; g: number; b: number } | null): React.CSSProperties {
  if (!color) return { background: 'rgba(39, 39, 42, 0.5)' };
  return { background: `rgba(${color.r}, ${color.g}, ${color.b}, 0.22)` };
}

function TrackArtwork({
  track,
  onLoad,
  imageRef,
}: {
  track: SongItem;
  onLoad?: (img: HTMLImageElement) => void;
  imageRef?: React.Ref<HTMLImageElement>;
}) {
  const [failed, setFailed] = useState(false);
  const src = upgradeMusicImageUrl(track.thumbnail, 120);
  const imageSrc = useProxiedImageUrl(src);

  useEffect(() => setFailed(false), [imageSrc]);

  if (!imageSrc || failed) {
    return (
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-surface-container-high text-neutral-500">
        <Music2 className="h-4 w-4" />
      </div>
    );
  }

  return (
    <img
      ref={imageRef}
      src={imageSrc}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onLoad={(event) => onLoad?.(event.currentTarget)}
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded object-cover"
    />
  );
}

export function AlbumTrackRow({
  track,
  index,
  isCurrent,
  isPlaying,
  streamsText,
  showArtwork = false,
  showStreamsColumn = true,
  compactActions = false,
  onPlay,
  onAddToQueue,
  onLike,
  onMenu,
}: AlbumTrackRowProps) {
  const artistLabel = artistsText(track.artists);
  const duration = track.duration == null ? '' : formatTime(track.duration);
  const showEq = isCurrent && isPlaying;
  const [isHovered, setIsHovered] = useState(false);
  const [dominantColor, setDominantColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const artworkRef = useRef<HTMLImageElement | null>(null);
  const colorImageSrc = useProxiedImageUrl(upgradeMusicImageUrl(track.thumbnail, 320));
  const preloadedColor = useDominantColor(colorImageSrc);
  const isHighlighted = isHovered || showEq;
  const activeColor = dominantColor ?? preloadedColor;
  const resolveColor = (img?: HTMLImageElement) => {
    const source = img ?? artworkRef.current;
    if (!source || !source.complete || source.naturalWidth === 0) {
      if (preloadedColor) setDominantColor(preloadedColor);
      return;
    }
    const extracted = extractDominantColorFromImage(source);
    setDominantColor(extracted ?? preloadedColor);
  };

  useEffect(() => {
    if (showEq) resolveColor();
  }, [showEq]);

  useEffect(() => {
    setDominantColor(null);
  }, [colorImageSrc]);

  useEffect(() => {
    if (isHighlighted && preloadedColor && !dominantColor) {
      setDominantColor(preloadedColor);
    }
  }, [dominantColor, isHighlighted, preloadedColor]);

  const handleMenu = () => {
    if (onMenu) onMenu(track);
    else onAddToQueue(track);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPlay(track)}
      onMouseEnter={() => {
        setIsHovered(true);
        resolveColor();
      }}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPlay(track);
        }
      }}
      style={isHighlighted ? colorBackground(activeColor) : undefined}
      className={`group flex cursor-pointer items-center rounded-lg px-4 py-2 transition-colors duration-200 ease-out ${
        isCurrent ? 'bg-surface-container-low' : ''
      }`}
    >
      <div className="relative grid w-12 shrink-0 place-items-center">
        {showEq ? (
          <PlayingWave className="text-[var(--color-primary)]" />
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

      {showArtwork ? (
        <div className="mr-3 shrink-0">
          <TrackArtwork
            track={track}
            imageRef={artworkRef}
            onLoad={(img) => {
              if (isHighlighted) resolveColor(img);
            }}
          />
        </div>
      ) : null}

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

      {showStreamsColumn ? (
        <span className="hidden w-32 shrink-0 text-right font-mono text-sm tabular-nums text-neutral-500 lg:block">
          {streamsText ?? ''}
        </span>
      ) : null}

      <div
        className={cx(
          'ml-4 flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100',
          compactActions ? 'hidden xl:flex' : null,
        )}
      >
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
