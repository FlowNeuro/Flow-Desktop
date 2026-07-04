import { useEffect, useMemo, useState } from 'react';
import {
  getChannelDetails,
  getSubscriptionRotationFeed,
  getSubscriptionRssFeed,
  type SubscriptionRssChannel,
} from './api/youtube';
import type { SubscribedChannel } from '../store/useSubscriptionStore';
import type { ChannelDetails, VideoSummary } from '../types/video';
import { mapWithConcurrency } from './concurrency';

export function useSubscriptionFeed(channels: SubscribedChannel[]) {
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [rssChannels, setRssChannels] = useState<SubscriptionRssChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelIds = useMemo(
    () => channels.map((channel) => channel.id).sort().join('|'),
    [channels],
  );

  useEffect(() => {
    let active = true;
    const ids = channelIds.split('|').filter(Boolean);

    const loadFeed = async () => {
      if (ids.length === 0) {
        setVideos([]);
        setRssChannels([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const rssFeed = await getSubscriptionRssFeed(ids);
        if (!active) return;

        if (rssFeed.videos.length > 0) {
          setVideos(rssFeed.videos);
          setRssChannels(rssFeed.channels);
          return;
        }

        const latest = await getSubscriptionRotationFeed();
        if (active) {
          setVideos(latest);
          setRssChannels(rssFeed.channels);
        }
      } catch (err) {
        console.error('Failed to load subscription feed', err);
        try {
          const latest = await getSubscriptionRotationFeed();
          if (active) {
            setVideos(latest);
            setRssChannels([]);
            setError(latest.length > 0 ? null : 'Failed to load latest subscription videos.');
          }
        } catch (fallbackErr) {
          console.error('Failed to load subscription rotation fallback', fallbackErr);
          if (active) {
            setError('Failed to load latest subscription videos.');
          }
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadFeed();

    return () => {
      active = false;
    };
  }, [channelIds]);

  return { videos, rssChannels, loading, error };
}

export function useSubscriptionChannelDetails(channels: SubscribedChannel[]) {
  const [detailsById, setDetailsById] = useState<Record<string, ChannelDetails>>({});

  const channelIds = useMemo(
    () => channels.map((channel) => channel.id).sort().join('|'),
    [channels],
  );

  useEffect(() => {
    if (!channelIds) {
      setDetailsById({});
      return;
    }

    let active = true;
    const ids = channelIds.split('|').filter(Boolean);

    const loadDetails = async () => {
      const entries = await mapWithConcurrency(ids, 6, async (channelId) => {
        try {
          const details = await getChannelDetails(channelId);
          return [channelId, details] as const;
        } catch (err) {
          console.warn('Failed to load subscription channel details', channelId, err);
          return null;
        }
      });

      if (!active) return;

      setDetailsById(
        entries.reduce<Record<string, ChannelDetails>>((acc, entry) => {
          if (entry) {
            acc[entry[0]] = entry[1];
          }
          return acc;
        }, {}),
      );
    };

    loadDetails();

    return () => {
      active = false;
    };
  }, [channelIds]);

  return detailsById;
}
