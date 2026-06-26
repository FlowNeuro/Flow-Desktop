import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useAppSettingsStore } from "../store/useAppSettingsStore";
import {
  getVideoDetails,
  getChannelDetails,
  getPlaylistDetails,
  getRelatedVideos,
} from "../lib/api/youtube";
import { getSponsorBlockSegments, getReturnYouTubeDislike, getDeArrowOverride } from "../lib/api/foss";
import { useDownloadedVideoRecord, downloadRecordToVideo } from "../lib/useDownloads";
import { setSetting } from "../lib/api/db";
import { seekToTime } from "../lib/linkify";
import { getString } from "../lib/i18n/index";
import { Chapters } from "../components/player/chapters";
import { QueuePanel } from "../components/player/QueuePanel";
import {
  WatchLayout,
  WatchMetadata,
  DescriptionCard,
  RelatedVideos,
  LiveChat,
  WatchPageSkeleton,
  WatchErrorState,
} from "../components/watch";
import { WatchPlayerSlot } from "../components/watch/WatchPlayerSlot";
import type { RelatedContentItem, VideoSummary } from "../types/video";
import { SETTINGS } from "../lib/settings/schema";

const CommentsSection = lazy(() => import("../components/watch/CommentsSection"));

function mapRelatedItemToVideoSummary(item: RelatedContentItem): VideoSummary {
  return {
    id: item.videoId || item.id,
    title: item.title,
    channelName: item.channelName,
    channelId: item.channelId,
    thumbnailUrl: item.thumbnailUrl,
    durationSeconds: item.durationSeconds,
    publishedText: item.publishedText,
    viewCountText: item.viewCountText,
    isLive: item.isLive,
  };
}

export function Watch() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

  const { loadSettings } = useSettingsStore();

  const currentVideo = usePlayerStore((s) => s.currentVideo);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const playQueueItem = usePlayerStore((s) => s.playQueueItem);
  const dearrowData = usePlayerStore((s) => s.dearrowData);
  const rydData = usePlayerStore((s) => s.rydData);
  const setDearrowData = usePlayerStore((s) => s.setDearrowData);
  const setRydData = usePlayerStore((s) => s.setRydData);
  const setSponsorBlockSegments = usePlayerStore((s) => s.setSponsorBlockSegments);
  const isChaptersPanelOpen = usePlayerStore((s) => s.isChaptersPanelOpen);
  const setIsChaptersPanelOpen = usePlayerStore((s) => s.setIsChaptersPanelOpen);
  const isQueuePanelOpen = usePlayerStore((s) => s.isQueuePanelOpen);
  const setAutoplayCandidates = usePlayerStore((s) => s.setAutoplayCandidates);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const captions = usePlayerStore((s) => s.captions);
  const setWatchPageCache = usePlayerStore((s) => s.setWatchPageCache);

  const { loadSubscriptions } = useSubscriptionStore();
  const commentsEnabled = useAppSettingsStore((state) => state.values[SETTINGS.COMMENTS_ENABLED] !== "false");
  const relatedVideosEnabled = useAppSettingsStore((state) => state.values[SETTINGS.SHOW_RELATED_VIDEOS] !== "false");

  const [channelDetails, setChannelDetails] = useState<any>(null);
  const [videoDetails, setVideoDetails] = useState<any>(null);
  const [relatedVideos, setRelatedVideos] = useState<RelatedContentItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const offlineRecord = useDownloadedVideoRecord(videoId);
  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    if (!videoId) return;
    if (currentVideo && currentVideo.id === videoId) return;

    const queuedIndex = usePlayerStore.getState().queue.findIndex((item) => item.id === videoId);
    if (queuedIndex >= 0) {
      playQueueItem(queuedIndex);
      return;
    }

    if (offlineRecord) {
      setPageError(null);
      setQueue([downloadRecordToVideo(offlineRecord)], 0);
      return;
    }

    let cancelled = false;
    setPageError(null);
    void (async () => {
      try {
        const details = await getVideoDetails(videoId);
        if (cancelled) return;
        setQueue(
          [
            {
              id: details.id,
              title: details.title,
              channelName: details.channelName,
              thumbnailUrl: details.thumbnailUrl,
              durationSeconds: details.durationSeconds,
              channelId: details.channelId,
            },
          ],
          0,
        );
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to load details on watch page initialization", e);
        setPageError(getString("watch_error_body"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoId, currentVideo, playQueueItem, setQueue, retryNonce, offlineRecord]);

  useEffect(() => {
    if (!videoId) return;
    const currentCache = usePlayerStore.getState().watchPageCache;
    const cachedWatchPage = currentCache?.videoId === videoId ? currentCache : null;

    setChannelDetails(cachedWatchPage?.channelDetails ?? null);
    setVideoDetails(cachedWatchPage?.videoDetails ?? null);
    setRelatedVideos(cachedWatchPage?.relatedVideos ?? []);

    if (offlineRecord) {
      setAutoplayCandidates([]);
      setRelatedLoading(false);
      return;
    }

    const loadVideoMeta = async () => {
      try {
        const detailsRes = cachedWatchPage?.videoDetails ?? await getVideoDetails(videoId);
        setVideoDetails(detailsRes);
        setWatchPageCache(videoId, { videoDetails: detailsRes });
        if (detailsRes.channelId) {
          if (cachedWatchPage?.channelDetails) {
            setChannelDetails(cachedWatchPage.channelDetails);
            return;
          }
          try {
            const channel = await getChannelDetails(detailsRes.channelId);
            setChannelDetails(channel);
            setWatchPageCache(videoId, { channelDetails: channel });
          } catch (err) {
            console.warn("Failed to load channel details", err);
          }
        }
      } catch (err) {
        console.warn("Failed to load extra details", err);
      }
    };

    const loadFossMetadata = async () => {
      try {
        await loadSettings();
        const settings = useSettingsStore.getState();
        const [dearrow, ryd, segments] = await Promise.all([
          settings.dearrowEnabled ? getDeArrowOverride(videoId).catch(() => null) : Promise.resolve(null),
          settings.rytdEnabled ? getReturnYouTubeDislike(videoId).catch(() => null) : Promise.resolve(null),
          settings.sponsorBlockEnabled ? getSponsorBlockSegments(videoId, settings.serverUrl).catch(() => []) : Promise.resolve([]),
        ]);
        setDearrowData(dearrow);
        setRydData(ryd);
        setSponsorBlockSegments(segments);
      } catch (e) {
        console.warn("Failed FOSS metadata loading process", e);
      }
    };

    const loadRelated = async () => {
      if (!relatedVideosEnabled) {
        setRelatedVideos([]);
        setAutoplayCandidates([]);
        setRelatedLoading(false);
        return;
      }

      if (cachedWatchPage?.relatedVideos && cachedWatchPage.relatedVideos.length > 0) {
        setRelatedVideos(cachedWatchPage.relatedVideos);
        setAutoplayCandidates(cachedWatchPage.relatedVideos.map(mapRelatedItemToVideoSummary));
        setRelatedLoading(false);
        return;
      }

      setRelatedLoading(true);
      try {
        const related = await getRelatedVideos(videoId);
        setRelatedVideos(related);
        setAutoplayCandidates(related.map(mapRelatedItemToVideoSummary));
        setWatchPageCache(videoId, { relatedVideos: related });
      } catch (err) {
        console.warn("Failed to load related content", err);
        setRelatedVideos([]);
        setAutoplayCandidates([]);
      } finally {
        setRelatedLoading(false);
      }
    };

    void loadVideoMeta();
    void loadFossMetadata();
    void loadRelated();
  }, [
    videoId,
    retryNonce,
    setDearrowData,
    setRydData,
    setSponsorBlockSegments,
    setAutoplayCandidates,
    setWatchPageCache,
    loadSettings,
    relatedVideosEnabled,
    offlineRecord,
  ]);

  const handleRelatedClick = useCallback(
    async (item: RelatedContentItem) => {
      if (item.itemType === "playlist" || item.itemType === "mix") {
        if (item.playlistId) {
          try {
            const playlist = await getPlaylistDetails(item.playlistId);
            if (playlist.videos.length > 0) {
              const fallbackVideoId = item.videoId || playlist.videos[0]?.id;
              const startIndex = fallbackVideoId
                ? playlist.videos.findIndex((video) => video.id === fallbackVideoId)
                : 0;
              const safeIndex = startIndex >= 0 ? startIndex : 0;
              const startVideo = playlist.videos[safeIndex];
              if (startVideo) {
                setQueue(playlist.videos, safeIndex);
                navigate(`/watch/${startVideo.id}`);
                return;
              }
            }
          } catch (error) {
            console.warn("Failed to resolve related playlist", error);
          }
        }
        if (item.videoId) {
          setQueue([mapRelatedItemToVideoSummary(item)], 0);
          navigate(`/watch/${item.videoId}`);
        }
        return;
      }

      const targetVideoId = item.videoId || item.id;
      setQueue([mapRelatedItemToVideoSummary(item)], 0);
      navigate(`/watch/${targetVideoId}`);
    },
    [navigate, setQueue],
  );

  const retryWithProxy = useCallback(() => {
    void setSetting("proxy_enabled", "true").catch(() => {});
    setPageError(null);
    setRetryNonce((n) => n + 1);
  }, []);

  if (!currentVideo) {
    if (pageError) {
      return <WatchErrorState message={pageError} onRetryWithProxy={retryWithProxy} onGoBack={() => navigate(-1)} />;
    }
    return <WatchPageSkeleton />;
  }

  if (!videoId) return null;

  return (
    <WatchLayout
      player={<WatchPlayerSlot />}
      metadata={
        <WatchMetadata
          currentVideo={currentVideo}
          videoData={videoDetails}
          channelDetails={channelDetails}
          dearrowData={dearrowData}
          rydData={rydData}
        />
      }
      description={<DescriptionCard currentVideo={currentVideo} videoData={videoDetails} />}
      comments={commentsEnabled && !offlineRecord ? (
        <Suspense fallback={<div className="h-32" />}>
          <CommentsSection videoId={videoId} />
        </Suspense>
      ) : null}
      sidebar={
        <>
          {videoDetails?.isLive && <LiveChat videoId={videoId} />}

          {isQueuePanelOpen && (
            <div className="h-[min(720px,calc(100vh-140px))] min-h-[450px] w-full shrink-0">
              <QueuePanel />
            </div>
          )}

          {isChaptersPanelOpen && (
            <div className="h-[min(720px,calc(100vh-140px))] min-h-[450px] w-full shrink-0">
              <Chapters
                chapters={videoDetails?.chapters || []}
                captions={captions}
                videoId={videoId}
                onClose={() => setIsChaptersPanelOpen(false)}
                videoThumbnail={dearrowData?.thumbnailUrl || currentVideo?.thumbnailUrl || videoDetails?.thumbnailUrl}
                seekTo={seekToTime}
              />
            </div>
          )}

          {relatedVideosEnabled && (
            <RelatedVideos
              items={relatedVideos}
              loading={relatedLoading}
              onSelect={handleRelatedClick}
              onAddToQueue={addToQueue}
            />
          )}
        </>
      }
    />
  );
}

export default Watch;
