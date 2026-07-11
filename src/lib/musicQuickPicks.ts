import type { WatchHistoryRecord } from '../types/db';
import type { SongItem } from '../types/music';

export interface QuickPickSeed {
  videoId: string;
  artistKey: string;
}

const normalizedArtistKey = (channelId?: string | null, channelName?: string | null): string =>
  (channelId ?? '').trim() || (channelName ?? '').trim().toLowerCase();

/** Select recent seeds while preferring a different artist for every lane. */
export function selectQuickPickSeeds(
  history: WatchHistoryRecord[],
  currentTrack: SongItem | null,
  limit: number,
): QuickPickSeed[] {
  const candidates: QuickPickSeed[] = [];
  const seenTracks = new Set<string>();

  if (currentTrack) {
    const videoId = currentTrack.videoId ?? currentTrack.id;
    if (videoId) {
      candidates.push({
        videoId,
        artistKey: normalizedArtistKey(
          currentTrack.artists[0]?.id,
          currentTrack.artists[0]?.name,
        ),
      });
      seenTracks.add(videoId);
    }
  }

  for (const record of history) {
    if (!record.videoId || seenTracks.has(record.videoId)) continue;
    seenTracks.add(record.videoId);
    candidates.push({
      videoId: record.videoId,
      artistKey: normalizedArtistKey(record.channelId, record.channelName),
    });
  }

  const selected: QuickPickSeed[] = [];
  const selectedArtists = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.artistKey && selectedArtists.has(candidate.artistKey)) continue;
    selected.push(candidate);
    if (candidate.artistKey) selectedArtists.add(candidate.artistKey);
    if (selected.length >= limit) return selected;
  }

  for (const candidate of candidates) {
    if (selected.some((seed) => seed.videoId === candidate.videoId)) continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

/** Round-robin independent recall lanes so no single station can own the shelf. */
export function interleaveQuickPickLanes(
  lanes: SongItem[][],
  limit: number,
  excludedIds: Iterable<string> = [],
): SongItem[] {
  const seen = new Set(excludedIds);
  const positions = lanes.map(() => 0);
  const mixed: SongItem[] = [];
  let madeProgress = true;

  while (mixed.length < limit && madeProgress) {
    madeProgress = false;
    for (let laneIndex = 0; laneIndex < lanes.length && mixed.length < limit; laneIndex += 1) {
      const lane = lanes[laneIndex];
      if (!lane) continue;
      let position = positions[laneIndex] ?? 0;
      while (position < lane.length) {
        const song = lane[position];
        position += 1;
        positions[laneIndex] = position;
        if (!song) continue;
        const id = song.videoId ?? song.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        mixed.push(song);
        madeProgress = true;
        break;
      }
    }
  }

  return mixed;
}
