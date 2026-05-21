import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { 
  getStreamInfo, 
  getYoutubeErrorMessage, 
  getComments, 
  getVideoDetails, 
  getChannelDetails,
  getPlaylistDetails,
  getRelatedVideos
} from "../lib/api/youtube";
import { getSponsorBlockSegments, getReturnYouTubeDislike, getDeArrowOverride } from "../lib/api/foss";
import { addWatchRecord } from "../lib/api/db";
import { Loader2, ThumbsUp, ThumbsDown, Share2, Bookmark, MoreHorizontal,WandSparkles } from "lucide-react";
import Player from "../components/player/Player";
import { Chapters } from "../components/player/chapters";
import { SkeletonLoader } from "../components/ui/SkeletonLoader";
import type { AudioTrack, CaptionTrack, RelatedContentItem, StreamVariant, VideoSummary } from "../types/video";

import { useSettingsStore } from "../store/useSettingsStore";
import { formatCount } from "../lib/utils";

const parseTimestampToSeconds = (ts: string): number => {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  } else if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return 0;
};

const seekToTime = (seconds: number) => {
  window.dispatchEvent(new CustomEvent("flow-player-seek", { detail: { time: seconds } }));
};

const selectVariantByBandwidth = (variants: StreamVariant[], canUseAdaptive: boolean): StreamVariant | null => {
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  const downlink = connection && typeof connection.downlink === "number" ? connection.downlink : 10; // Default to 10 Mbps if not available

  let targetHeight = 240;
  if (downlink > 25) targetHeight = 2160;
  else if (downlink > 15) targetHeight = 1440;
  else if (downlink > 8) targetHeight = 1080;
  else if (downlink > 4) targetHeight = 720;
  else if (downlink > 2) targetHeight = 480;
  else if (downlink > 0.8) targetHeight = 360;

  const playable = variants.filter(v => v.isPlayable && (v.hasAudio || canUseAdaptive));
  if (playable.length === 0) return null;

  let best: StreamVariant | null = null;
  let minDiff = Infinity;
  for (const variant of playable) {
    const h = variant.height || 0;
    const diff = Math.abs(h - targetHeight);
    if (diff < minDiff) {
      minDiff = diff;
      best = variant;
    }
  }
  return best;
};

const renderTextWithLinks = (text: string) => {
  if (!text) return "";
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const timestampRegex = /\b((?:[0-9]{1,2}:)?[0-9]{1,2}:[0-9]{2})\b/g;

  const urlParts = text.split(urlRegex);
  return urlParts.map((urlPart, i) => {
    if (urlPart.match(urlRegex)) {
      return (
        <a 
          key={`url-${i}`} 
          href={urlPart} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-primary hover:underline cursor-pointer font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          {urlPart}
        </a>
      );
    }

    const tsParts = urlPart.split(timestampRegex);
    return tsParts.map((tsPart, j) => {
      if (tsPart.match(timestampRegex)) {
        const seconds = parseTimestampToSeconds(tsPart);
        return (
          <span
            key={`ts-${i}-${j}`}
            className="text-primary hover:underline cursor-pointer font-medium"
            onClick={(e) => {
              e.stopPropagation();
              seekToTime(seconds);
            }}
          >
            {tsPart}
          </span>
        );
      }
      return tsPart;
    });
  });
};

interface CommentTextProps {
  text: string;
  className?: string;
}

function CommentText({ text, className = "text-sm mt-1 text-zinc-200 whitespace-pre-wrap" }: CommentTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const maxLength = 280;

  if (!text) return null;

  if (text.length <= maxLength) {
    return <div className={className}>{renderTextWithLinks(text)}</div>;
  }

  const displayedText = isExpanded ? text : text.slice(0, maxLength) + "...";

  return (
    <div className={className}>
      {renderTextWithLinks(displayedText)}{" "}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="text-primary hover:underline ml-1 font-semibold focus:outline-none cursor-pointer"
      >
        {isExpanded ? "Read less" : "Read more"}
      </button>
    </div>
  );
}

const formatViews = (views: string | number | undefined | null) => {
  if (!views) return "0 views";
  const formatted = formatCount(views);
  return `${formatted} views`;
};

export function Watch() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const {
    dearrowEnabled,
    dearrowBadgeEnabled,
    rytdEnabled,
    loadSettings
  } = useSettingsStore();

  const {
    currentVideo,
    setIsPlaying,
    setQueue,
    setCurrentTime,
    setDuration,
    playNext,
    isTheaterMode,
    dearrowData,
    rydData,
    setDearrowData,
    setRydData,
    setSponsorBlockSegments,
    isChaptersPanelOpen,
    setIsChaptersPanelOpen
  } = usePlayerStore();

  const { isSubscribed, subscribe, unsubscribe, loadSubscriptions } = useSubscriptionStore();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamVariants, setStreamVariants] = useState<StreamVariant[]>([]);
  const [captions, setCaptions] = useState<CaptionTrack[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [dashManifestUrl, setDashManifestUrl] = useState<string | null>(null);
  const [selectedQualityId, setSelectedQualityId] = useState<string>("auto");
  const [resumeTime, setResumeTime] = useState(0);
  const [loadingStream, setLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsNextPageToken, setCommentsNextPageToken] = useState<string | null>(null);
  const [commentCountText, setCommentCountText] = useState<string | null>(null);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [commentReplies, setCommentReplies] = useState<Record<string, any[]>>({});
  const [repliesLoading, setRepliesLoading] = useState<Record<string, boolean>>({});
  const [repliesNextPageToken, setRepliesNextPageToken] = useState<Record<string, string | null>>({});
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [channelDetails, setChannelDetails] = useState<any>(null);
  const [videoDetails, setVideoDetails] = useState<any>(null);
  const [relatedVideos, setRelatedVideos] = useState<RelatedContentItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [interactionState, setInteractionState] = useState<"none" | "liked" | "disliked">("none");

  const resolvedChannelId = videoDetails?.channelId || currentVideo?.channelId || channelDetails?.id || "";
  const displayChannelName = videoDetails?.channelName || currentVideo?.channelName || channelDetails?.name || "Unknown channel";

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    if (!videoId) return;

    const initializeVideo = async () => {
      if (!currentVideo || currentVideo.id !== videoId) {
        setLoadingStream(true);
        setStreamError(null);
        try {
          const details = await getVideoDetails(videoId);
          const summary = {
            id: details.id,
            title: details.title,
            channelName: details.channelName,
            thumbnailUrl: details.thumbnailUrl,
            durationSeconds: details.durationSeconds,
            channelId: details.channelId
          };
          setQueue([summary], 0);
        } catch (e) {
          console.error("Failed to load details on watch page initialization", e);
          setStreamError("Failed to resolve secure streaming CDN");
          setLoadingStream(false);
        }
      }
    };

    initializeVideo();
  }, [videoId, currentVideo, setQueue]);

  useEffect(() => {
    if (!currentVideo || currentVideo.id !== videoId) return;

    const loadStream = async () => {
      setLoadingStream(true);
      setStreamError(null);
      try {
        const info = await getStreamInfo(currentVideo.id);
        setStreamVariants(info.variants || []);
        setCaptions(info.captions || []);
        setAudioTracks(info.audioTracks || []);

        const supportsVP9 = typeof MediaSource !== "undefined" && typeof MediaSource.isTypeSupported === "function" && MediaSource.isTypeSupported('video/webm; codecs="vp9"');
        const hasDashUrl = !!(info.dashManifestUrl && supportsVP9);
        setDashManifestUrl(hasDashUrl ? (info.dashManifestUrl || null) : null);
        
        let initialQualityId = selectedQualityId || "auto";
        if (initialQualityId === "null" || !initialQualityId) {
          initialQualityId = "auto";
        }
        setSelectedQualityId(initialQualityId);
        setResumeTime(0);

        if (hasDashUrl) {
          setStreamUrl(info.dashManifestUrl || null);
        } else {
          const canUseAdaptive = (info.audioTracks || []).some((track) => !!track.localUrl);
          let chosenVariant: StreamVariant | null = null;
          if (initialQualityId === "auto") {
            chosenVariant = selectVariantByBandwidth(info.variants || [], canUseAdaptive);
          } else {
            chosenVariant = info.variants?.find(v => v.id === initialQualityId) || null;
          }
          if (!chosenVariant) {
            chosenVariant = info.variants?.find((variant) => variant.isDefault && variant.isPlayable && (variant.hasAudio || canUseAdaptive))
              || info.variants?.find((variant) => variant.isPlayable && (variant.hasAudio || canUseAdaptive))
              || null;
          }
          setStreamUrl(chosenVariant?.localUrl || info.localUrl || null);
        }

        console.log("[Watch] Stream info loaded", {
          videoId: currentVideo.id,
          variantCount: info.variants?.length || 0,
          audioTrackCount: info.audioTracks?.length || 0,
          hasDashManifest: !!hasDashUrl,
          hasHlsManifest: !!info.hlsManifestUrl,
          selectedQualityId: initialQualityId,
        });
        setIsPlaying(true);

        await addWatchRecord({
          videoId: currentVideo.id,
          title: currentVideo.title,
          channelName: currentVideo.channelName,
          watchDate: new Date().toISOString(),
          watchDurationSeconds: 0,
          totalDurationSeconds: currentVideo.durationSeconds ?? 0,
        });
      } catch (err) {
        setStreamUrl(null);
        setStreamVariants([]);
        setCaptions([]);
        setAudioTracks([]);
        setDashManifestUrl(null);
        setSelectedQualityId("auto");
        setStreamError(getYoutubeErrorMessage(err));
        console.error("Failed to load stream URL", err);
      } finally {
        setLoadingStream(false);
      }
    };

    loadStream();
  }, [currentVideo, videoId, setIsPlaying]);

  useEffect(() => {
    if (!videoId) return;

    setComments([]);
    setCommentsNextPageToken(null);
    setCommentCountText(null);
    setCommentReplies({});
    setRepliesLoading({});
    setRepliesNextPageToken({});
    setExpandedReplies({});
    setChannelDetails(null);
    setVideoDetails(null);
    setRelatedVideos([]);
    setCaptions([]);
    setAudioTracks([]);
    setDashManifestUrl(null);
    setResumeTime(0);
    setInteractionState("none");
    setIsDescExpanded(false);

    const loadComments = async () => {
      setCommentsLoading(true);
      try {
        const commentsRes = await getComments(videoId);
        console.log("[Watch] Comments loaded:", commentsRes.comments.length);
        setComments(commentsRes.comments || []);
        setCommentsNextPageToken(commentsRes.nextPageToken || null);
        setCommentCountText(commentsRes.commentCountText || null);
      } catch (err) {
        console.warn("Failed to load comments", err);
        setComments([]);
        setCommentsNextPageToken(null);
        setCommentCountText(null);
      } finally {
        setCommentsLoading(false);
      }
    };

    const loadVideoMeta = async () => {
      try {
        const detailsRes = await getVideoDetails(videoId);
        setVideoDetails(detailsRes);

        if (detailsRes.channelId) {
          try {
            const chanRes = await getChannelDetails(detailsRes.channelId);
            setChannelDetails(chanRes);
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
          settings.sponsorBlockEnabled ? getSponsorBlockSegments(videoId).catch(() => []) : Promise.resolve([])
        ]);
        setDearrowData(dearrow);
        setRydData(ryd);
        setSponsorBlockSegments(segments);
        console.log("[Watch] FOSS metadata loaded. SB segments:", segments.length, "DeArrow override:", !!dearrow, "RYTD ratios:", !!ryd);
      } catch (e) {
        console.warn("Failed FOSS metadata loading process", e);
      }
    };

    const loadRelated = async () => {
      setRelatedLoading(true);
      try {
        const related = await getRelatedVideos(videoId);
        console.log("[Watch] Related content loaded:", related.length);
        setRelatedVideos(related);
      } catch (err) {
        console.warn("Failed to load related content", err);
        setRelatedVideos([]);
      } finally {
        setRelatedLoading(false);
      }
    };

    loadComments();
    loadVideoMeta();
    loadFossMetadata();
    loadRelated();
  }, [videoId, setDearrowData, setRydData, setSponsorBlockSegments, loadSettings]);

  const loadMoreComments = async () => {
    if (!videoId || !commentsNextPageToken || loadingMoreComments) return;
    setLoadingMoreComments(true);
    try {
      const commentsRes = await getComments(videoId, commentsNextPageToken);
      setComments(prev => [...prev, ...(commentsRes.comments || [])]);
      setCommentsNextPageToken(commentsRes.nextPageToken || null);
      if (commentsRes.commentCountText) {
        setCommentCountText(commentsRes.commentCountText);
      }
    } catch (err) {
      console.error("Failed to load more comments", err);
    } finally {
      setLoadingMoreComments(false);
    }
  };

  const loadReplies = async (commentId: string, replyToken: string) => {
    if (!videoId || repliesLoading[commentId]) return;
    
    setRepliesLoading(prev => ({ ...prev, [commentId]: true }));
    try {
      const response = await getComments(videoId, replyToken);
      
      setCommentReplies(prev => ({
        ...prev,
        [commentId]: [...(prev[commentId] || []), ...(response.comments || [])]
      }));
      
      setRepliesNextPageToken(prev => ({
        ...prev,
        [commentId]: response.nextPageToken || null
      }));
    } catch (err) {
      console.error(`Failed to load replies for comment ${commentId}`, err);
    } finally {
      setRepliesLoading(prev => ({ ...prev, [commentId]: false }));
    }
  };

  const toggleReplies = async (commentId: string, replyToken: string | null | undefined) => {
    if (expandedReplies[commentId]) {
      setExpandedReplies(prev => ({ ...prev, [commentId]: false }));
      return;
    }

    setExpandedReplies(prev => ({ ...prev, [commentId]: true }));

    if (!commentReplies[commentId] && replyToken) {
      await loadReplies(commentId, replyToken);
    }
  };

  const handleTimeUpdate = useCallback((time: number, mediaDuration: number) => {
    setCurrentTime(time);
    setDuration(mediaDuration || currentVideo?.durationSeconds || 1);
  }, [setCurrentTime, setDuration, currentVideo?.durationSeconds]);

  const handleQualitySelect = useCallback((variant: StreamVariant | "auto") => {
    if (variant === "auto") {
      setSelectedQualityId("auto");
      setIsPlaying(true);
      if (dashManifestUrl) {
        return;
      }
      const canUseAdaptive = audioTracks.some((track) => !!track.localUrl);
      const chosenVariant = selectVariantByBandwidth(streamVariants, canUseAdaptive);
      if (chosenVariant) {
        setResumeTime(usePlayerStore.getState().currentTime);
        setStreamUrl(chosenVariant.localUrl);
      }
      return;
    }

    if (!variant.isPlayable) return;
    if (!dashManifestUrl && !variant.hasAudio && !audioTracks.some((track) => !!track.localUrl)) return;
    console.log("[Watch] Quality selected", {
      qualityId: variant.id,
      qualityLabel: variant.qualityLabel,
      hasAudio: variant.hasAudio,
      isVideoOnly: variant.isVideoOnly,
      dashActive: !!dashManifestUrl,
    });
    if (dashManifestUrl) {
      setSelectedQualityId(variant.id);
      setIsPlaying(true);
      return;
    }
    setResumeTime(usePlayerStore.getState().currentTime);
    setSelectedQualityId(variant.id);
    setStreamUrl(variant.localUrl);
    setIsPlaying(true);
  }, [audioTracks, dashManifestUrl, setIsPlaying, streamVariants]);

  const playerLayoutVariant = useMemo(() => {
    const variantWithDimensions = (variant: StreamVariant | null | undefined) => {
      if (!variant) return null;
      return variant.width && variant.height ? variant : null;
    };

    const selectedVariant = variantWithDimensions(
      streamVariants.find((variant) => variant.id === selectedQualityId)
    );
    if (selectedVariant) return selectedVariant;

    if (selectedQualityId === "auto") {
      const canUseAdaptive = audioTracks.some((track) => !!track.localUrl);
      const autoVariant = variantWithDimensions(selectVariantByBandwidth(streamVariants, canUseAdaptive));
      if (autoVariant) return autoVariant;
    }

    return (
      variantWithDimensions(streamVariants.find((variant) => variant.isDefault))
      || variantWithDimensions(streamVariants.find((variant) => variant.isPlayable))
      || variantWithDimensions(streamVariants[0])
      || null
    );
  }, [audioTracks, selectedQualityId, streamVariants]);

  const playerAspectRatio = useMemo(() => {
    const width = playerLayoutVariant?.width;
    const height = playerLayoutVariant?.height;
    if (width && height && width > 0 && height > 0) {
      return `${width} / ${height}`;
    }
    return "16 / 9";
  }, [playerLayoutVariant]);

  const mapRelatedItemToVideoSummary = useCallback((item: RelatedContentItem): VideoSummary => ({
    id: item.videoId || item.id,
    title: item.title,
    channelName: item.channelName,
    channelId: item.channelId,
    thumbnailUrl: item.thumbnailUrl,
    durationSeconds: item.durationSeconds,
    publishedText: item.publishedText,
    viewCountText: item.viewCountText,
  }), []);

  const handleRelatedClick = useCallback(async (item: RelatedContentItem) => {
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
        const summary = mapRelatedItemToVideoSummary(item);
        setQueue([summary], 0);
        navigate(`/watch/${item.videoId}`);
      }
      return;
    }

    const targetVideoId = item.videoId || item.id;
    const summary = mapRelatedItemToVideoSummary(item);
    setQueue([summary], 0);
    navigate(`/watch/${targetVideoId}`);
  }, [mapRelatedItemToVideoSummary, navigate, setQueue]);

  if (!currentVideo) {
    if (streamError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#0f0f0f] text-white p-6">
          <div className="max-w-md w-full text-center space-y-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
            <div className="w-16 h-16 bg-red-950/40 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-900/30">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Failed to Load Video</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {streamError}
            </p>
            <button
              onClick={() => navigate("/")}
              className="w-full py-2.5 rounded-full bg-primary hover:bg-primary/95 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Back to Home
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white overflow-x-hidden font-sans pb-32">
        <div className="mx-auto max-w-[1750px] px-6 py-6 grid grid-cols-1 lg:grid-cols-[73%_27%] gap-x-6 gap-y-5 items-start">
          
          {/* LEFT COLUMN SKELETON */}
          <div className="flex flex-col gap-5 w-full">
            {/* Player aspect ratio block */}
            <div className="w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 animate-pulse">
              <SkeletonLoader type="thumbnail" className="w-full h-full" />
            </div>

            {/* Video Title Skeleton */}
            <div className="space-y-2 mt-2">
              <SkeletonLoader type="title" className="h-6 w-3/4 bg-zinc-850" />
              <SkeletonLoader type="title" className="h-4 w-1/2 bg-zinc-850/60" />
            </div>

            {/* Channel Info & Actions Row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-3 border-b border-zinc-800/40 pb-4">
              <div className="flex items-center gap-3">
                <SkeletonLoader type="avatar" className="w-10 h-10 bg-zinc-800" />
                <div className="space-y-2">
                  <SkeletonLoader type="text" className="w-28 h-3 bg-zinc-800" />
                  <SkeletonLoader type="text" className="w-16 h-2 bg-zinc-800/60" />
                </div>
                <div className="w-24 h-9 rounded-full bg-zinc-800/80 animate-pulse ml-2" />
              </div>

              {/* Action buttons skeletons */}
              <div className="flex items-center gap-2">
                <div className="w-32 h-9 rounded-full bg-zinc-800/60 animate-pulse" />
                <div className="w-20 h-9 rounded-full bg-zinc-800/60 animate-pulse" />
                <div className="w-20 h-9 rounded-full bg-zinc-800/60 animate-pulse" />
                <div className="w-9 h-9 rounded-full bg-zinc-800/60 animate-pulse" />
              </div>
            </div>

            {/* Description Box Skeleton */}
            <div className="bg-[#272727]/30 rounded-xl p-4 space-y-3">
              <div className="flex gap-3">
                <SkeletonLoader type="text" className="w-24 h-3 bg-zinc-800" />
                <SkeletonLoader type="text" className="w-24 h-3 bg-zinc-800/60" />
              </div>
              <SkeletonLoader type="text" className="w-full h-3 bg-zinc-800/40" />
              <SkeletonLoader type="text" className="w-5/6 h-3 bg-zinc-800/40" />
            </div>

            {/* Comments Skeleton */}
            <div className="space-y-6 pt-4">
              <SkeletonLoader type="title" className="h-5 w-36 bg-zinc-800" />
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={`comment-sk-${i}`} className="flex gap-4">
                    <SkeletonLoader type="avatar" className="w-10 h-10 bg-zinc-800" />
                    <div className="flex-1 space-y-2">
                      <SkeletonLoader type="text" className="w-32 h-3 bg-zinc-800" />
                      <SkeletonLoader type="text" className="w-full h-3 bg-zinc-800/50" />
                      <SkeletonLoader type="text" className="w-4/5 h-3 bg-zinc-800/50" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN SKELETON */}
          <div className="flex flex-col gap-3 w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={`related-sk-${i}`} className="flex gap-2 w-full">
                <div className="w-40 aspect-video rounded-lg bg-zinc-900 shrink-0 overflow-hidden">
                  <SkeletonLoader type="thumbnail" className="w-full h-full" />
                </div>
                <div className="flex flex-col flex-1 gap-2 py-1">
                  <SkeletonLoader type="text" className="w-8 h-2 bg-zinc-800/50" />
                  <SkeletonLoader type="text" className="w-full h-3 bg-zinc-800" />
                  <SkeletonLoader type="text" className="w-5/6 h-3 bg-zinc-800" />
                  <SkeletonLoader type="text" className="w-20 h-2 bg-zinc-800/60" />
                  <SkeletonLoader type="text" className="w-24 h-2 bg-zinc-800/60" />
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-white overflow-x-hidden font-sans pb-32">
      <div className={`mx-auto w-full grid grid-cols-1 lg:grid-cols-[73%_27%] gap-x-6 gap-y-5 items-start transition-all duration-500 ease-in-out ${
        isTheaterMode ? 'max-w-full px-0 pt-0 pb-6' : 'max-w-[1750px] px-6 pt-6 pb-6'
      }`}>
        
        {/* PLAYER CARD */}
        <div
          className={`transition-all duration-500 ease-in-out ${
          isTheaterMode
            ? "col-span-1 lg:col-span-2 w-full flex-none z-10 overflow-hidden"
            : "col-span-1 lg:col-span-1 w-full z-10"
        }`}
          style={isTheaterMode ? undefined : { aspectRatio: playerAspectRatio }}
        >
          <div className="h-full w-full transition-all duration-500 ease-in-out">

              <Player
                src={streamUrl}
                title={dearrowData?.title || currentVideo.title}
                poster={dearrowData?.thumbnailUrl || currentVideo.thumbnailUrl || videoDetails?.thumbnailUrl}
                isLoading={loadingStream}
                error={streamError}
                qualities={streamVariants}
                captions={captions}
                audioTracks={audioTracks}
                dashManifestUrl={dashManifestUrl}
                selectedQualityId={selectedQualityId}
                resumeTime={resumeTime}
                onSelectQuality={handleQualitySelect}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => playNext()}
                chapters={videoDetails?.chapters}
                onRetry={() => {
                  setStreamUrl(null);
                  setStreamVariants([]);
                  setCaptions([]);
                  setAudioTracks([]);
                  setSelectedQualityId("auto");
                  if (currentVideo) {
                    void getStreamInfo(currentVideo.id).then((info) => {
                      const canUseAdaptive = (info.audioTracks || []).some((track) => !!track.localUrl);
                      const supportsVP9 = typeof MediaSource !== "undefined" && typeof MediaSource.isTypeSupported === "function" && MediaSource.isTypeSupported('video/webm; codecs="vp9"');
                      const hasDashUrl = !!(info.dashManifestUrl && supportsVP9);
                      const defaultVariant = info.variants?.find((variant) => variant.isDefault && variant.isPlayable && (variant.hasAudio || canUseAdaptive))
                        || info.variants?.find((variant) => variant.isPlayable && (variant.hasAudio || canUseAdaptive))
                        || null;
                      setStreamVariants(info.variants || []);
                      setCaptions(info.captions || []);
                      setAudioTracks(info.audioTracks || []);
                      setDashManifestUrl(hasDashUrl ? (info.dashManifestUrl || null) : null);
                      setSelectedQualityId("auto");
                      setStreamUrl(hasDashUrl ? (info.dashManifestUrl || null) : (defaultVariant?.localUrl || info.localUrl || null));
                      setStreamError(null);
                    }).catch((err) => setStreamError(getYoutubeErrorMessage(err)));
                  }
                }}
              />
          </div>
        </div>

        {/* LEFT COLUMN: METADATA, DESCRIPTION, COMMENTS */}
        <div className={`col-span-1 lg:col-span-1 lg:row-start-2 w-full flex flex-col gap-5 transition-all duration-500 ease-in-out ${
          isTheaterMode ? "max-w-[1277px] ml-auto pl-6 lg:pl-12 pr-6 lg:pr-4" : ""
        }`}>
          {/* METADATA SECTION */}
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight leading-snug group relative flex items-center gap-2 cursor-default">
              <span>{dearrowEnabled && dearrowData?.title ? dearrowData.title : currentVideo.title}</span>
              {dearrowEnabled && dearrowBadgeEnabled && dearrowData?.title && (
                <span className="text-xs text-primary opacity-70 cursor-help" title="DeArrow cleaned title"><WandSparkles  /></span>
              )}
              {dearrowEnabled && dearrowData?.title && (
                <div className="absolute left-0 top-full mt-1 hidden group-hover:block bg-[#272727] border border-[#3f3f3f] p-2 rounded-lg text-xs text-zinc-300 z-50 shadow-2xl whitespace-nowrap">
                  <span className="font-bold text-white mb-1 block">Original title:</span>
                  {currentVideo.title}
                </div>
              )}
            </h1>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-3">
              {/* Channel Info + Subscribe */}
              <div className="flex items-center gap-3 shrink-0">
                <div 
                  className="w-10 h-10 rounded-full bg-[#272727] shrink-0 overflow-hidden flex items-center justify-center font-bold text-zinc-400 cursor-pointer"
                  onClick={() => {
                    if (resolvedChannelId) navigate(`/channel/${resolvedChannelId}`);
                  }}
                >
                  {channelDetails?.avatarUrl ? (
                    <img src={channelDetails.avatarUrl} alt={displayChannelName} className="w-full h-full object-cover" />
                  ) : (
                    displayChannelName.charAt(0).toUpperCase()
                  )}
                </div>
                <div 
                  className="min-w-0 pr-4 cursor-pointer"
                  onClick={() => {
                    if (resolvedChannelId) navigate(`/channel/${resolvedChannelId}`);
                  }}
                >
                  <h3 className="font-bold text-white text-[15px] leading-tight truncate hover:text-primary transition-colors">
                    {displayChannelName}
                  </h3>
                  <p className="text-[12px] text-[#aaaaaa]">
                    {channelDetails?.subscriberCountText || ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!resolvedChannelId) return;
                    if (isSubscribed(resolvedChannelId)) {
                      unsubscribe(resolvedChannelId);
                    } else {
                      subscribe(resolvedChannelId, displayChannelName, channelDetails?.avatarUrl || undefined);
                    }
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${
                    isSubscribed(resolvedChannelId)
                      ? "bg-[#272727] text-white hover:bg-[#3f3f3f]"
                      : "bg-white text-black hover:bg-[#e6e6e6]"
                  }`}
                >
                  {isSubscribed(resolvedChannelId) ? "Subscribed" : "Subscribe"}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-[#272727] rounded-full h-9 overflow-hidden transition-colors divide-x divide-[#3f3f3f]">
                  <button 
                    onClick={() => setInteractionState(prev => prev === "liked" ? "none" : "liked")}
                    className={`px-4 h-full flex items-center gap-2 text-sm hover:bg-[#3f3f3f] font-semibold cursor-pointer transition-colors ${interactionState === "liked" ? "text-white bg-[#3f3f3f]" : ""}`}
                  >
                    <ThumbsUp size={18} fill={interactionState === "liked" ? "white" : "none"} />
                    <span>{rytdEnabled && rydData ? formatCount(rydData.likes) : (videoDetails?.likeCountText ? formatCount(videoDetails.likeCountText) : "Like")}</span>
                  </button>
                  <button 
                    onClick={() => setInteractionState(prev => prev === "disliked" ? "none" : "disliked")}
                    className={`px-4 h-full flex items-center gap-2 justify-center hover:bg-[#3f3f3f] cursor-pointer transition-colors ${interactionState === "disliked" ? "text-white bg-[#3f3f3f]" : ""}`}
                  >
                    <ThumbsDown size={18} fill={interactionState === "disliked" ? "white" : "none"} />
                    {rytdEnabled && rydData ? (
                      <span className="text-sm font-semibold">{formatCount(rydData.dislikes)}</span>
                    ) : (
                      <span className="text-sm font-semibold">Dislike</span>
                    )}
                  </button>
                </div>
                <button className="bg-[#272727] hover:bg-[#3f3f3f] rounded-full px-4 h-9 flex items-center gap-2 text-sm font-semibold transition-colors cursor-pointer">
                  <Share2 size={18} />
                  Share
                </button>
                <button className="bg-[#272727] hover:bg-[#3f3f3f] rounded-full px-4 h-9 flex items-center gap-2 text-sm font-semibold transition-colors cursor-pointer">
                  <Bookmark size={18} />
                  Save
                </button>
                <button className="bg-[#272727] hover:bg-[#3f3f3f] rounded-full w-9 h-9 flex items-center justify-center shrink-0 transition-colors cursor-pointer">
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* DESCRIPTION CARD */}
          <div 
            onClick={() => setIsDescExpanded(!isDescExpanded)}
            className="bg-[#272727] hover:bg-[#3f3f3f] rounded-xl p-3.5 cursor-pointer transition-colors text-sm"
          >
            <div className="font-bold flex items-center gap-2">
              <span>{formatViews(videoDetails?.viewCountText || currentVideo.viewCountText || "0 views")}</span>
              <span className="text-[#aaaaaa] font-medium">{videoDetails?.publishedText || currentVideo.publishedText || ""}</span>
            </div>
            <div className={`mt-2 whitespace-pre-wrap ${isDescExpanded ? 'block' : 'line-clamp-2'}`}>
              {renderTextWithLinks(videoDetails?.description || "")}
            </div>
          </div>

          {/* COMMENTS */}
          <div className="pt-4 space-y-6">
            <h2 className="text-xl font-bold">
              {commentCountText || `${comments.length}`} comments
            </h2>
            {commentsLoading ? (
               <Loader2 className="animate-spin text-zinc-500" size={24} />
            ) : comments.length === 0 ? (
               <p className="text-sm text-zinc-500">No comments available for this video.</p>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4">
                  {comments.map((c: any, idx: number) => (
                    <div key={c.id || `comment-${idx}`} className="flex gap-4">
                      <div 
                        className={`w-10 h-10 rounded-full bg-[#272727] shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold text-zinc-400 ${c.authorChannelId ? "cursor-pointer" : ""}`}
                        onClick={() => {
                          if (c.authorChannelId) navigate(`/channel/${c.authorChannelId}`);
                        }}
                      >
                        {c.authorThumbnail ? (
                          <img src={c.authorThumbnail} className="w-full h-full object-cover" alt="" />
                        ) : (
                          c.author?.charAt(0)?.toUpperCase() || "?"
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold flex items-baseline gap-2">
                          <span 
                            className={c.authorChannelId ? "cursor-pointer hover:text-primary transition-colors" : ""}
                            onClick={() => {
                              if (c.authorChannelId) navigate(`/channel/${c.authorChannelId}`);
                            }}
                          >
                            {c.author}
                          </span>{" "}
                          <span className="text-xs text-[#aaaaaa] font-medium">{c.publishedText}</span>
                        </div>
                        <CommentText text={c.text} />
                        
                        <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                          {c.likeCount != null && c.likeCount > 0 && (
                            <span className="flex items-center gap-1 hover:text-zinc-200 transition-colors">
                              <ThumbsUp size={12} /> {formatCount(c.likeCount)}
                            </span>
                          )}
                          {(c.continuationToken || (c.replyCount != null && c.replyCount > 0)) && (
                            <button
                               onClick={() => toggleReplies(c.id, c.continuationToken)}
                              className="text-primary hover:underline font-semibold cursor-pointer border-none bg-transparent p-0 text-xs flex items-center gap-1"
                            >
                              {expandedReplies[c.id] ? "Hide replies" : `Show ${c.replyCount || ""} replies`}
                            </button>
                          )}
                        </div>

                        {/* Nested Replies */}
                        {expandedReplies[c.id] && (
                          <div className="mt-4 pl-4 border-l-2 border-[#3f3f3f] space-y-4">
                            {commentReplies[c.id]?.map((reply: any, rIdx: number) => (
                              <div key={reply.id || `reply-${rIdx}`} className="flex gap-3 text-xs">
                                <div 
                                  className={`w-8 h-8 rounded-full bg-[#272727] shrink-0 overflow-hidden flex items-center justify-center font-bold text-zinc-400 ${reply.authorChannelId ? "cursor-pointer" : ""}`}
                                  onClick={() => {
                                    if (reply.authorChannelId) navigate(`/channel/${reply.authorChannelId}`);
                                  }}
                                >
                                  {reply.authorThumbnail ? (
                                    <img src={reply.authorThumbnail} className="w-full h-full object-cover" alt="" />
                                  ) : (
                                    reply.author?.charAt(0)?.toUpperCase() || "?"
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold flex items-baseline gap-2">
                                    <span 
                                      className={reply.authorChannelId ? "cursor-pointer hover:text-primary transition-colors" : ""}
                                      onClick={() => {
                                        if (reply.authorChannelId) navigate(`/channel/${reply.authorChannelId}`);
                                      }}
                                    >
                                      {reply.author}
                                    </span>{" "}
                                    <span className="text-[10px] text-[#aaaaaa] font-medium">{reply.publishedText}</span>
                                  </div>
                                  <CommentText text={reply.text} className="mt-1 text-zinc-200 whitespace-pre-wrap font-normal" />
                                  {reply.likeCount != null && reply.likeCount > 0 && (
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-400">
                                      <ThumbsUp size={10} /> {formatCount(reply.likeCount)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                            
                            {repliesLoading[c.id] && (
                              <div className="flex items-center gap-2 text-xs text-zinc-400 py-1">
                                <Loader2 className="animate-spin text-[#aaaaaa]" size={14} />
                                <span>Loading replies...</span>
                              </div>
                            )}

                            {/* Replies Pagination */}
                            {(!repliesLoading[c.id] && repliesNextPageToken[c.id]) && (
                              <button
                                onClick={() => loadReplies(c.id, repliesNextPageToken[c.id]!)}
                                className="text-primary hover:underline font-bold text-[11px] cursor-pointer block mt-2 border-none bg-transparent p-0"
                              >
                                Show more replies
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Primary Comments Pagination */}
                {commentsNextPageToken && (
                  <div className="pt-4 flex justify-center">
                    <button
                      onClick={loadMoreComments}
                      disabled={loadingMoreComments}
                      className="px-6 py-2 rounded-full border border-[#3f3f3f] hover:bg-[#3f3f3f] text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer bg-transparent"
                    >
                      {loadingMoreComments ? (
                        <>
                          <Loader2 className="animate-spin text-[#aaaaaa]" size={16} />
                          <span>Loading more comments...</span>
                        </>
                      ) : (
                        "Load More Comments"
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR: Recommendations / Chapters Panel */}
        <div className={`w-full flex flex-col gap-5 transition-all duration-500 ease-in-out lg:sticky lg:top-6 ${
          isTheaterMode 
            ? "col-span-1 lg:col-start-2 lg:row-start-2 lg:row-span-1 max-w-[472px] mr-auto pl-6 lg:pl-4 pr-6 lg:pr-12" 
            : "col-span-1 lg:col-start-2 lg:row-start-1 lg:row-span-2"
        }`}>
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

          <div className="flex flex-col gap-3">
            {relatedLoading ? (
              <Loader2 className="animate-spin text-zinc-500 mx-auto mt-10" size={24} />
            ) : relatedVideos.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center mt-6">No related content found.</p>
            ) : (
              relatedVideos.map((item) => (
                <div 
                  key={`${item.itemType}-${item.id}`}
                  onClick={() => {
                    void handleRelatedClick(item);
                  }}
                  className="flex gap-2 cursor-pointer group"
                >
                  <div className="relative w-40 aspect-video rounded-lg bg-[#272727] shrink-0 overflow-hidden">
                    <img 
                      src={item.thumbnailUrl || ""} 
                      className="w-full h-full object-cover"
                      alt=""
                    />
                    {item.durationSeconds && (
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-bold px-1 py-0.5 rounded">
                        {Math.floor(item.durationSeconds / 60)}:{(item.durationSeconds % 60).toString().padStart(2, "0")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold">
                        {item.itemType === "mix" ? "Mix" : item.itemType === "playlist" ? "Playlist" : "Video"}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-[#f1f1f1] line-clamp-2 group-hover:text-primary transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-xs text-[#aaaaaa] mt-1">{item.channelName}</p>
                    <p className="text-xs text-[#aaaaaa]">
                      {item.viewCountText}{item.publishedText ? ` • ${item.publishedText}` : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default Watch;
