import { useEffect, useRef, useState } from 'react';
import { Download, Heart, ListMusic, ListPlus, MoreVertical, Music2, Play, Share2, Volume2 } from 'lucide-react';

import { getString } from '../../lib/i18n/index';
import { artistsText, formatTime } from '../../lib/musicFormat';
import { upgradeMusicImageUrl } from '../../lib/thumbnails';
import { extractDominantColorFromImage, useDominantColor } from '../../lib/useDominantColor';
import { useProxiedImageUrl } from '../../lib/useProxiedImageUrl';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import type { SongItem } from '../../types/music';
import { MusicCardMenu, type MusicMenuAction, useMusicContextMenu } from './MusicCardMenu';
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

function videoIdOf(track: SongItem): string {
  return track.videoId ?? track.id;
}

function trackShareUrl(track: SongItem): string {
  return `https://music.youtube.com/watch?v=${encodeURIComponent(videoIdOf(track))}`;
}

async function shareTrack(track: SongItem) {
  try {
    if (navigator.share) {
      await navigator.share({ title: track.title, url: trackShareUrl(track) });
      return;
    }
    await navigator.clipboard?.writeText(trackShareUrl(track));
  } catch {
    // Share/copy can be cancelled by the user; the menu should still close.
  }
}

function logMusicAction(action: string, id: string) {
  console.info(`${action} requested`, id);
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
  const [liked, setLiked] = useState(false);
  const [dominantColor, setDominantColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const artworkRef = useRef<HTMLImageElement | null>(null);
  const colorImageSrc = useProxiedImageUrl(upgradeMusicImageUrl(track.thumbnail, 320));
  const preloadedColor = useDominantColor(colorImageSrc);
  const playNextInQueue = useMusicPlayerStore((s) => s.playNextInQueue);
  const menu = useMusicContextMenu(true);
  const isHighlighted = isHovered || showEq;
  const activeColor = dominantColor ?? preloadedColor;
  const trackId = videoIdOf(track);
  const menuActions: MusicMenuAction[] = [
    {
      id: 'add-to-queue',
      label: getString('music_add_to_queue'),
      icon: <ListPlus size={16} />,
      onSelect: () => {
        if (onMenu) onMenu(track);
        else onAddToQueue(track);
      },
    },
    {
      id: 'play-next',
      label: getString('music_play_next'),
      icon: <Play size={16} />,
      onSelect: () => playNextInQueue(track),
    },
    {
      id: 'add-to-playlist',
      label: getString('music_add_to_playlist'),
      icon: <ListMusic size={16} />,
      onSelect: () => logMusicAction('Add to playlist', trackId),
    },
    {
      id: 'download',
      label: getString('music_download'),
      icon: <Download size={16} />,
      onSelect: () => logMusicAction('Download track', trackId),
    },
    {
      id: 'share',
      label: getString('music_share'),
      icon: <Share2 size={16} />,
      onSelect: () => shareTrack(track),
    },
  ];
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

  return (
    <div
      ref={menu.cardRef}
      role="button"
      tabIndex={0}
      onClick={() => onPlay(track)}
      onContextMenu={menu.openMenuFromContext}
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
      } relative`}
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

      <div className="relative ml-4 h-8 w-20 shrink-0">
        <span
          className={cx(
            'absolute right-0 top-1/2 -translate-y-1/2 font-mono text-sm tabular-nums text-neutral-400 transition-opacity duration-200 ease-out',
            compactActions ? 'xl:group-hover:opacity-0' : 'group-hover:opacity-0',
          )}
        >
          {duration}
        </span>
        <div
          className={cx(
            'absolute right-0 top-0 flex items-center gap-1 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100',
            compactActions ? 'hidden xl:flex' : null,
          )}
        >
          <button
            type="button"
            aria-label={getString('music_like_track')}
            aria-pressed={liked}
            onClick={(event) => {
              event.stopPropagation();
              setLiked((current) => !current);
              onLike?.(track);
            }}
            className={cx(
              'grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors duration-200 ease-out hover:bg-surface-container-high hover:text-neutral-100',
              liked ? 'text-[var(--color-primary)]' : null,
            )}
          >
            <Heart className="h-4 w-4" fill={liked ? 'currentColor' : 'none'} />
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label={getString('music_more_options')}
              onClick={menu.openMenuFromDots}
              className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors duration-200 ease-out hover:bg-surface-container-high hover:text-neutral-100"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {!menu.menuPosition ? (
              <MusicCardMenu
                actions={menuActions}
                menuPosition={menu.menuPosition}
                menuRef={menu.menuRef}
                onClose={menu.closeMenu}
                show={menu.showMenu}
              />
            ) : null}
          </div>
        </div>
      </div>
      {menu.menuPosition ? (
        <MusicCardMenu
          actions={menuActions}
          menuPosition={menu.menuPosition}
          menuRef={menu.menuRef}
          onClose={menu.closeMenu}
          show={menu.showMenu}
        />
      ) : null}
    </div>
  );
}

export default AlbumTrackRow;
