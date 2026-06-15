import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Check, ChevronRight, Play, Plus, Shuffle } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { ArtistCard } from '../../components/music/ArtistCard';
import { ArtistSkeleton } from '../../components/music/ArtistSkeleton';
import { MusicItemCard } from '../../components/music/MusicItemCard';
import { MusicShelf } from '../../components/music/MusicShelf';
import { useArtistPage, type ArtistMoreEndpoint } from '../../lib/useArtistPage';
import { useMusicPlayerStore } from '../../store/useMusicPlayerStore';
import { getString } from '../../lib/i18n/index';
import type { SongItem } from '../../types/music';

const videoIdOf = (t: SongItem) => t.videoId ?? t.id;

function SectionTitle({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between px-1">
      <h2 className="text-xl font-bold tracking-tight text-neutral-100">{title}</h2>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="group flex items-center gap-0.5 text-sm font-medium text-neutral-400 transition-colors duration-200 ease-out hover:text-neutral-100"
        >
          {getString('music_show_all')}
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}

export default function ArtistPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const navigate = useNavigate();
  const playQueue = useMusicPlayerStore((s) => s.playQueue);
  const addToQueue = useMusicPlayerStore((s) => s.addToQueue);
  const { data, loading, error, reload } = useArtistPage(artistId);

  const [following, setFollowing] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);

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

  const {
    header,
    topSongs,
    topSongsMore,
    albums,
    albumsMore,
    singles,
    singlesMore,
    videos,
    related,
    featuredOn,
    about,
  } = data;
  const subtitle = [header.subscriberCountText, header.monthlyListenerCount]
    .filter((p): p is string => Boolean(p?.trim()))
    .join('  •  ');

  const startPlayback = (shuffle: boolean) => {
    if (!topSongs.length) return;
    const queue: SongItem[] = shuffle ? [...topSongs].sort(() => Math.random() - 0.5) : topSongs;
    void playQueue(queue, 0);
  };

  const playFrom = (list: SongItem[], track: SongItem) => {
    const start = Math.max(0, list.findIndex((t) => videoIdOf(t) === videoIdOf(track)));
    void playQueue(list, start);
  };

  const openAlbum = (browseId: string) => navigate(`/music/album/${browseId}`);
  const openArtist = (id: string) => navigate(`/music/artist/${id}`);
  const openPlaylist = (id: string) => navigate(`/music/playlist/${id}`);

  const seeAll = (kind: 'songs' | 'albums', more: ArtistMoreEndpoint | null, sectionTitle: string) => {
    if (!more?.browseId) return;
    const q = new URLSearchParams({ browseId: more.browseId, kind, title: sectionTitle });
    if (more.params) q.set('params', more.params);
    navigate(`/music/artist/${header.id}/items?${q.toString()}`);
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

      <div className="mx-auto flex max-w-[1600px] flex-col gap-10 px-8 pt-8">
        {/* Top Songs — dense two-column list */}
        {topSongs.length > 0 && (
          <section>
            <SectionTitle
              title={getString('music_artist_popular')}
              onSeeAll={
                topSongsMore?.browseId
                  ? () => seeAll('songs', topSongsMore, getString('music_artist_popular'))
                  : undefined
              }
            />
            <div className="grid gap-x-8 gap-y-1 lg:grid-cols-2">
              {topSongs.slice(0, 10).map((song) => (
                <MusicItemCard
                  key={videoIdOf(song)}
                  variant="track-list"
                  item={song}
                  onPlay={() => playFrom(topSongs, song)}
                  onMenu={() => addToQueue(song)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Albums */}
        <MusicShelf
          title={getString('music_artist_albums')}
          items={albums}
          onSeeAll={
            albumsMore?.browseId
              ? () => seeAll('albums', albumsMore, getString('music_artist_albums'))
              : undefined
          }
          renderItem={(album) => (
            <MusicItemCard
              variant="album"
              item={album}
              onPlay={() => openAlbum(album.browseId)}
              onOpen={() => openAlbum(album.browseId)}
            />
          )}
        />

        {/* Singles & EPs */}
        <MusicShelf
          title={getString('music_artist_singles')}
          items={singles}
          onSeeAll={
            singlesMore?.browseId
              ? () => seeAll('albums', singlesMore, getString('music_artist_singles'))
              : undefined
          }
          renderItem={(single) => (
            <MusicItemCard
              variant="album"
              item={single}
              onPlay={() => openAlbum(single.browseId)}
              onOpen={() => openAlbum(single.browseId)}
            />
          )}
        />

        {/* Music Videos — 16:9 */}
        <MusicShelf
          title={getString('music_artist_videos')}
          items={videos}
          renderItem={(video) => (
            <MusicItemCard variant="video" item={video} onPlay={() => playFrom(videos, video)} />
          )}
        />

        {/* Featured On */}
        <MusicShelf
          title={getString('music_artist_featured_on')}
          items={featuredOn}
          renderItem={(playlist) => (
            <MusicItemCard
              variant="playlist"
              item={playlist}
              onPlay={() => openPlaylist(playlist.id)}
              onOpen={() => openPlaylist(playlist.id)}
            />
          )}
        />

        {/* Fans might also like */}
        <MusicShelf
          title={getString('music_artist_related')}
          items={related}
          skeletonShape="circle"
          renderItem={(artist) => <ArtistCard artist={artist} onOpen={() => openArtist(artist.id)} />}
        />

        {/* About */}
        {about && (
          <section>
            <SectionTitle title={getString('music_artist_about')} />
            <div className="rounded-2xl bg-surface-container-low p-6">
              <p
                className={`whitespace-pre-line text-sm leading-relaxed text-neutral-300 ${
                  aboutExpanded ? '' : 'line-clamp-4'
                }`}
              >
                {about}
              </p>
              {about.length > 240 && (
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
          </section>
        )}
      </div>
    </div>
  );
}
