import { describe, expect, it } from 'vitest';

import type { WatchHistoryRecord } from '../types/db';
import type { SongItem } from '../types/music';
import { interleaveQuickPickLanes, selectQuickPickSeeds } from './musicQuickPicks';

const song = (id: string, artist = id): SongItem => ({
  id,
  title: id,
  artists: [{ id: artist, name: artist }],
  album: null,
  duration: 180,
  musicVideoType: 'MUSIC_VIDEO_TYPE_ATV',
  thumbnail: '',
  explicit: false,
  videoId: id,
  playlistId: null,
  params: null,
});

const history = (videoId: string, channelId: string): WatchHistoryRecord => ({
  videoId,
  title: videoId,
  channelId,
  channelName: channelId,
  watchDate: '2026-01-01',
  watchDurationSeconds: 120,
  isMusic: true,
});

describe('selectQuickPickSeeds', () => {
  it('keeps the current track first and prefers distinct recent artists', () => {
    const seeds = selectQuickPickSeeds(
      [
        history('recent-same-artist', 'artist-a'),
        history('artist-b-song', 'artist-b'),
        history('artist-c-song', 'artist-c'),
      ],
      song('current', 'artist-a'),
      3,
    );

    expect(seeds.map((seed) => seed.videoId)).toEqual(['current', 'artist-b-song', 'artist-c-song']);
  });

  it('fills remaining lanes from repeated artists when taste history is narrow', () => {
    const seeds = selectQuickPickSeeds(
      [history('one', 'artist-a'), history('two', 'artist-a'), history('three', 'artist-a')],
      null,
      3,
    );

    expect(seeds.map((seed) => seed.videoId)).toEqual(['one', 'two', 'three']);
  });
});

describe('interleaveQuickPickLanes', () => {
  it('mixes lanes, excludes seeds, and deduplicates globally', () => {
    const mixed = interleaveQuickPickLanes(
      [
        [song('seed'), song('radio-1'), song('shared'), song('radio-2')],
        [song('related-1'), song('shared'), song('related-2')],
        [song('chart-1'), song('chart-2')],
      ],
      6,
      ['seed'],
    );

    expect(mixed.map((item) => item.id)).toEqual([
      'radio-1',
      'related-1',
      'chart-1',
      'shared',
      'related-2',
      'chart-2',
    ]);
  });
});
