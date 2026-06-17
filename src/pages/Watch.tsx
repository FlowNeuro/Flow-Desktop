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
import { setSetting } from "../lib/api/db";
import { seekToTime } from "../lib/linkify";
import { getString } from "../lib/i18n/index";
import { Chapters } from "../components/player/chapters";
import {
  WatchLayout,
  FlowPlayerCore,
  WatchMetadata,
  DescriptionCard,
  RelatedVideos,
  LiveChat,
  WatchPageSkeleton,
  WatchErrorState,
} from "../components/watch";
import type { RelatedContentItem, VideoSummary } from "../types/video";
import { SETTINGS } from "../lib/settings/schema";

const CommentsSection = lazy(() => import("../components/watch/CommentsSection"));

export function Watch() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

  const { loadSettings } = useSettingsStore();

  const currentVideo = usePlayerStore((s) => s.currentVideo);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const dearrowData = usePlayerStore((s) => s.dearrowData);
  const rydData = usePlayerStore((s) => s.rydData);
  const setDearrowData = usePlayerStore((s) => s.setDearrowData);
  const setRydData = usePlayerStore((s) => s.setRydData);
  const setSponsorBlockSegments = usePlayerStore((s) => s.setSponsorBlockSegments);
  const isChaptersPanelOpen = usePlayerStore((s) => s.isChaptersPanelOpen);
  const setIsChaptersPanelOpen = usePlayerStore((s) => s.setIsChaptersPanelOpen);
  const captions = usePlayerStore((s) => s.captions);

  const { loadSubscriptions } = useSubscriptionStore();
  const commentsEnabled = useAppSettingsStore((state) => state.values[SETTINGS.COMMENTS_ENABLED] !== "false");
  const relatedVideosEnabled = useAppSettingsStore((state) => state.values[SETTINGS.SHOW_RELATED_VIDEOS] !== "false");

  const [channelDetails, setChannelDetails] = useState<any>(null);
  const [videoDetails, setVideoDetails] = useState<any>(null);
  const [relatedVideos, setRelatedVideos] = useState<RelatedContentItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    if (!videoId) return;
    if (currentVideo && currentVideo.id === videoId) return;

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
  }, [videoId, currentVideo, setQueue, retryNonce]);

  useEffect(() => {
    if (!videoId) return;

    setChannelDetails(null);
    setVideoDetails(null);
    setRelatedVideos([]);

    const loadVideoMeta = async () => {
      try {
        const detailsRes = await getVideoDetails(videoId);
        setVideoDetails(detailsRes);
        if (detailsRes.channelId) {
          try {
            setChannelDetails(await getChannelDetails(detailsRes.channelId));
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
        setRelatedLoading(false);
        return;
      }

      setRelatedLoading(true);
      try {
        setRelatedVideos(await getRelatedVideos(videoId));
      } catch (err) {
        console.warn("Failed to load related content", err);
        setRelatedVideos([]);
      } finally {
        setRelatedLoading(false);
      }
    };

    void loadVideoMeta();
    void loadFossMetadata();
    void loadRelated();
  }, [videoId, retryNonce, setDearrowData, setRydData, setSponsorBlockSegments, loadSettings, relatedVideosEnabled]);

  const mapRelatedItemToVideoSummary = useCallback(
    (item: RelatedContentItem): VideoSummary => ({
      id: item.videoId || item.id,
      title: item.title,
      channelName: item.channelName,
      channelId: item.channelId,
      thumbnailUrl: item.thumbnailUrl,
      durationSeconds: item.durationSeconds,
      publishedText: item.publishedText,
      viewCountText: item.viewCountText,
    }),
    [],
  );

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
    [mapRelatedItemToVideoSummary, navigate, setQueue],
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
      player={<FlowPlayerCore videoId={videoId} videoDetails={videoDetails} />}
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
      comments={commentsEnabled ? (
        <Suspense fallback={<div className="h-32" />}>
          <CommentsSection videoId={videoId} />
        </Suspense>
      ) : null}
      sidebar={
        <>
          {videoDetails?.isLive && <LiveChat videoId={videoId} />}

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

          {relatedVideosEnabled && <RelatedVideos items={relatedVideos} loading={relatedLoading} onSelect={handleRelatedClick} />}
        </>
      }
    />
  );
}

export default Watch;
