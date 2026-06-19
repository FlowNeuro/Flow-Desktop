import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical, Music2, Play } from 'lucide-react';
import type { AlbumItem, ArtistItem, EpisodeItem, PlaylistItem, PodcastItem, SongItem } from '../../types/music';
import { getString } from '../../lib/i18n/index';
import { upgradeAvatarUrl, upgradeMusicImageUrl } from '../../lib/thumbnails';
import { extractDominantColorFromImage, useDominantColor } from '../../lib/useDominantColor';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import { useProxiedImageUrl } from '../../lib/useProxiedImageUrl';
import { PlayingWave } from './PlayingWave';

type BaseProps = {
  className?: string;
  onPlay?: () => void;
  onOpen?: () => void;
  fill?: boolean;
};

export type MusicItemCardProps = BaseProps &
  (
    | { variant: 'album'; item: AlbumItem }
    | { variant: 'playlist'; item: PlaylistItem }
    | { variant: 'song'; item: SongItem }
    | { variant: 'video'; item: SongItem }
    | { variant: 'artist'; item: ArtistItem }
    | { variant: 'podcast'; item: PodcastItem }
    | { variant: 'episode'; item: EpisodeItem }
    | {
        variant: 'track-list';
        item: SongItem;
        onMenu?: (e: React.MouseEvent) => void;
      }
  );

// --- helpers --------------------------------------------------------------

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function artistsText(artists?: { name: string }[] | null): string {
  if (!artists?.length) return '';
  return artists.map((a) => a.name).filter(Boolean).join(', ');
}

function videoIdOf(track: SongItem): string {
  return track.videoId ?? track.id;
}

function colorBackground(color: { r: number; g: number; b: number } | null): React.CSSProperties {
  if (!color) return { background: 'rgba(39, 39, 42, 0.5)' };
  return { background: `rgba(${color.r}, ${color.g}, ${color.b}, 0.22)` };
}

function albumSubtitle(item: AlbumItem): string {
  const artists = artistsText(item.artists);
  if (artists && item.year) return `${artists} • ${item.year}`;
  return artists || (item.year ? String(item.year) : '');
}

function playlistSubtitle(item: PlaylistItem): string {
  return item.author?.name || item.songCountText || '';
}

function podcastSubtitle(item: PodcastItem): string {
  return item.author?.name || item.episodeCountText || '';
}

function episodeSubtitle(item: EpisodeItem): string {
  const author = item.author?.name;
  if (author && item.publishDateText) return `${author} • ${item.publishDateText}`;
  return author || item.publishDateText || '';
}

function onKey(handler?: () => void) {
  return (e: React.KeyboardEvent) => {
    if (handler && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handler();
    }
  };
}

// --- shared sub-components ------------------------------------------------

function Artwork({
  src,
  alt,
  rounded,
  className,
  iconSize = 'w-6 h-6',
  onLoad,
  imageRef,
}: {
  src?: string | null;
  alt: string;
  rounded: string;
  className?: string;
  iconSize?: string;
  onLoad?: (img: HTMLImageElement) => void;
  imageRef?: React.Ref<HTMLImageElement>;
}) {
  const [failed, setFailed] = useState(false);
  const upgradedSrc = rounded.includes('full') ? upgradeAvatarUrl(src) : upgradeMusicImageUrl(src);
  const imageSrc = useProxiedImageUrl(upgradedSrc);
  useEffect(() => setFailed(false), [imageSrc]);
  if (!imageSrc || failed) {
    return (
      <div
        className={cx(
          'grid place-items-center bg-surface-container-high text-neutral-500',
          rounded,
          className,
        )}
        aria-hidden
      >
        <Music2 className={iconSize} />
      </div>
    );
  }
  return (
    <img
      ref={imageRef}
      src={imageSrc}
      alt={alt}
      loading="lazy"
      onLoad={(event) => onLoad?.(event.currentTarget)}
      onError={() => setFailed(true)}
      className={cx('object-cover', rounded, className)}
    />
  );
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

// --- variant renderers ----------------------------------------------------

/** Variant A — square card for albums & playlists. */
function SquareCard({
  title,
  subtitle,
  thumbnail,
  onPlay,
  onOpen,
  className,
  fill,
}: {
  title: string;
  subtitle: string;
  thumbnail?: string | null;
  onPlay?: () => void;
  onOpen?: () => void;
  className?: string;
  fill?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKey(onOpen)}
      className={cx(
        'group flex cursor-pointer flex-col gap-3',
        fill ? 'w-full' : 'w-40 md:w-48 lg:w-56',
        'rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
        className,
      )}
    >
      <div className="relative w-full aspect-square">
        <Artwork
          src={thumbnail}
          alt={title}
          rounded="rounded-xl"
          className="h-full w-full ring-1 ring-neutral-800/50"
          iconSize="w-10 h-10"
        />
        <button
          type="button"
          aria-label={getString('music_play')}
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.();
          }}
          className="absolute bottom-2 right-2 grid translate-y-1 place-items-center rounded-full bg-[var(--color-primary)] p-3 text-[var(--color-on-primary)] opacity-0 transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105"
        >
          <Play className="h-5 w-5" fill="currentColor" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="line-clamp-1 font-medium text-neutral-100">{title}</span>
        {subtitle && <span className="line-clamp-1 text-sm text-neutral-400">{subtitle}</span>}
      </div>
    </div>
  );
}

/** Variant D — 16:9 card for music videos (distinct from square album art). */
function VideoCard16x9({
  title,
  subtitle,
  thumbnail,
  onPlay,
  onOpen,
  className,
  fill,
}: {
  title: string;
  subtitle: string;
  thumbnail?: string | null;
  onPlay?: () => void;
  onOpen?: () => void;
  className?: string;
  fill?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen ?? onPlay}
      onKeyDown={onKey(onOpen ?? onPlay)}
      className={cx(
        'group flex cursor-pointer flex-col gap-3',
        fill ? 'w-full' : 'w-[260px] md:w-[300px]',
        'rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
        className,
      )}
    >
      <div className="relative aspect-video w-full">
        <Artwork
          src={thumbnail}
          alt={title}
          rounded="rounded-xl"
          className="h-full w-full ring-1 ring-neutral-800/50"
          iconSize="w-10 h-10"
        />
        <button
          type="button"
          aria-label={getString('music_play')}
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.();
          }}
          className="absolute bottom-2 right-2 grid translate-y-1 place-items-center rounded-full bg-[var(--color-primary)] p-3 text-[var(--color-on-primary)] opacity-0 transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105"
        >
          <Play className="h-5 w-5" fill="currentColor" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="line-clamp-2 font-medium text-neutral-100">{title}</span>
        {subtitle && <span className="line-clamp-1 text-sm text-neutral-400">{subtitle}</span>}
      </div>
    </div>
  );
}

/** Variant B — circular card for artists. */
function CircleCard({
  title,
  thumbnail,
  onOpen,
  className,
  fill,
}: {
  title: string;
  thumbnail?: string | null;
  onOpen?: () => void;
  className?: string;
  fill?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKey(onOpen)}
      className={cx(
        'group flex cursor-pointer flex-col items-center gap-3 text-center',
        fill ? 'w-full' : 'w-32 md:w-40',
        'rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
        className,
      )}
    >
      <div className={cx('aspect-square shrink-0', fill ? 'w-full' : 'w-32 md:w-40')}>
        <Artwork
          src={thumbnail}
          alt={title}
          rounded="rounded-full"
          className="h-full w-full ring-1 ring-neutral-800/50 transition-transform duration-200 ease-out group-hover:scale-[1.02]"
          iconSize="w-10 h-10"
        />
      </div>
      <span className="line-clamp-2 text-center font-medium text-neutral-100">{title}</span>
    </div>
  );
}

/** Variant C — dense list row for tracks (Spotify "Top Tracks" style). */
function ListRow({
  trackId,
  title,
  subtitle,
  thumbnail,
  duration,
  explicit,
  onPlay,
  onMenu,
  className,
}: {
  trackId: string;
  title: string;
  subtitle: string;
  thumbnail?: string | null;
  duration: string;
  explicit: boolean;
  onPlay?: () => void;
  onMenu?: (e: React.MouseEvent) => void;
  className?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [dominantColor, setDominantColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const artworkRef = useRef<HTMLImageElement | null>(null);
  const colorImageSrc = useProxiedImageUrl(upgradeMusicImageUrl(thumbnail, 320));
  const preloadedColor = useDominantColor(colorImageSrc);
  const currentTrack = useMusicPlayerStore((s) => s.currentTrack);
  const playerIsPlaying = useMusicPlayerStore((s) => s.isPlaying);
  const isPlayingTrack = !!currentTrack && videoIdOf(currentTrack) === trackId && playerIsPlaying;
  const isHighlighted = isHovered || isPlayingTrack;
  const activeColor = dominantColor ?? preloadedColor;
  const resolveColor = (img?: HTMLImageElement) => {
    const source = img ?? artworkRef.current;
    if (!source || !source.complete || source.naturalWidth === 0) {
      return;
    }
    const extracted = extractDominantColorFromImage(source);
    setDominantColor(extracted ?? preloadedColor);
  };

  useEffect(() => {
    if (isPlayingTrack) resolveColor();
  }, [isPlayingTrack]);

  useEffect(() => {
    setDominantColor(null);
  }, [colorImageSrc]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={onKey(onPlay)}
      onMouseEnter={() => {
        setIsHovered(true);
        resolveColor();
      }}
      onMouseLeave={() => setIsHovered(false)}
      style={isHighlighted ? colorBackground(activeColor) : undefined}
      className={cx(
        'group flex w-full cursor-pointer items-center gap-4 rounded-lg p-2 transition-colors duration-200 ease-out',
        'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
        className,
      )}
    >
      <div className="relative h-12 w-12 shrink-0">
        <Artwork
          src={thumbnail}
          alt={title}
          rounded="rounded-md"
          className="h-full w-full"
          iconSize="w-5 h-5"
          imageRef={artworkRef}
          onLoad={(img) => {
            if (isHighlighted) resolveColor(img);
          }}
        />
        <div
          className={cx(
            'absolute inset-0 grid place-items-center rounded-md bg-black/50 transition-opacity duration-200 ease-out',
            isPlayingTrack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {isPlayingTrack ? (
            <PlayingWave className="text-white" />
          ) : (
            <Play className="h-5 w-5 text-white" fill="currentColor" />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className={cx('line-clamp-1 font-medium', isPlayingTrack ? 'text-neutral-50' : 'text-neutral-100')}>
          {title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {explicit && <ExplicitBadge />}
          {subtitle && <span className="line-clamp-1 text-sm text-neutral-400">{subtitle}</span>}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {duration && (
          <span className="font-mono text-sm tabular-nums text-neutral-400">{duration}</span>
        )}
        {onMenu && (
          <button
            type="button"
            aria-label={getString('music_more_options')}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e);
            }}
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 opacity-0 transition-all duration-200 ease-out hover:bg-surface-container-high hover:text-neutral-100 group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// --- public component -----------------------------------------------------

export function MusicItemCard(props: MusicItemCardProps) {
  const { className, onPlay, onOpen, fill } = props;

  switch (props.variant) {
    case 'album':
      return (
        <SquareCard
          title={props.item.title}
          subtitle={albumSubtitle(props.item)}
          thumbnail={props.item.thumbnail}
          onPlay={onPlay}
          onOpen={onOpen}
          className={className}
          fill={fill}
        />
      );
    case 'playlist':
      return (
        <SquareCard
          title={props.item.title}
          subtitle={playlistSubtitle(props.item)}
          thumbnail={props.item.thumbnail}
          onPlay={onPlay}
          onOpen={onOpen}
          className={className}
          fill={fill}
        />
      );
    case 'song':
      return (
        <SquareCard
          title={props.item.title}
          subtitle={artistsText(props.item.artists)}
          thumbnail={props.item.thumbnail}
          onPlay={onPlay}
          onOpen={onOpen ?? onPlay}
          className={className}
          fill={fill}
        />
      );
    case 'video':
      return (
        <VideoCard16x9
          title={props.item.title}
          subtitle={artistsText(props.item.artists)}
          thumbnail={props.item.thumbnail}
          onPlay={onPlay}
          onOpen={onOpen}
          className={className}
          fill={fill}
        />
      );
    case 'artist':
      return (
        <CircleCard
          title={props.item.title}
          thumbnail={props.item.thumbnail}
          onOpen={onOpen}
          className={className}
          fill={fill}
        />
      );
    case 'podcast':
      return (
        <SquareCard
          title={props.item.title}
          subtitle={podcastSubtitle(props.item)}
          thumbnail={props.item.thumbnail}
          onPlay={onPlay}
          onOpen={onOpen}
          className={className}
          fill={fill}
        />
      );
    case 'episode':
      return (
        <SquareCard
          title={props.item.title}
          subtitle={episodeSubtitle(props.item)}
          thumbnail={props.item.thumbnail}
          onPlay={onPlay}
          onOpen={onOpen ?? onPlay}
          className={className}
          fill={fill}
        />
      );
    case 'track-list':
      return (
        <ListRow
          trackId={videoIdOf(props.item)}
          title={props.item.title}
          subtitle={artistsText(props.item.artists)}
          thumbnail={props.item.thumbnail}
          duration={formatDuration(props.item.duration)}
          explicit={props.item.explicit}
          onPlay={onPlay}
          onMenu={props.onMenu}
          className={className}
        />
      );
  }
}

export default MusicItemCard;
