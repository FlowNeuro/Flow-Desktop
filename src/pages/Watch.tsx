import { useState, useEffect, useCallback } from "react";
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
import { Loader2, ThumbsUp, ThumbsDown, Share2, FolderPlus, MoreHorizontal } from "lucide-react";
import Player from "../components/player/Player";
import type { AudioTrack, CaptionTrack, RelatedContentItem, StreamVariant, VideoSummary } from "../types/video";

export function Watch() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

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
    setSponsorBlockSegments
  } = usePlayerStore();

  const { isSubscribed, subscribe, unsubscribe, loadSubscriptions } = useSubscriptionStore();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamVariants, setStreamVariants] = useState<StreamVariant[]>([]);
  const [captions, setCaptions] = useState<CaptionTrack[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [dashManifestUrl, setDashManifestUrl] = useState<string | null>(null);
  const [selectedQualityId, setSelectedQualityId] = useState<string | null>(null);
  const [resumeTime, setResumeTime] = useState(0);
  const [loadingStream, setLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [channelDetails, setChannelDetails] = useState<any>(null);
  const [videoDetails, setVideoDetails] = useState<any>(null);
  const [relatedVideos, setRelatedVideos] = useState<RelatedContentItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  const [interactionState, setInteractionState] = useState<"none" | "liked" | "disliked">("none");

  // Derive a stable channel ID: prefer what we get from the video details response,
  // fall back to what's on the currentVideo summary.
  const resolvedChannelId = videoDetails?.channelId || currentVideo?.channelId || channelDetails?.id || "";
  const displayChannelName = videoDetails?.channelName || currentVideo?.channelName || channelDetails?.name || "Unknown channel";

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  // --- Initialize video from URL param ---
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

  // --- Load stream URL ---
  useEffect(() => {
    if (!currentVideo || currentVideo.id !== videoId) return;

    const loadStream = async () => {
      setLoadingStream(true);
      setStreamError(null);
      try {
        const info = await getStreamInfo(currentVideo.id);
        const canUseAdaptive = (info.audioTracks || []).some((track) => !!track.localUrl);
        const defaultVariant = info.variants?.find((variant) => variant.isDefault && variant.isPlayable && (variant.hasAudio || canUseAdaptive))
          || info.variants?.find((variant) => variant.isPlayable && (variant.hasAudio || canUseAdaptive))
          || null;
        setStreamVariants(info.variants || []);
        setCaptions(info.captions || []);
        setAudioTracks(info.audioTracks || []);
        setDashManifestUrl(info.dashManifestUrl || null);
        setSelectedQualityId(defaultVariant?.id || null);
        setResumeTime(0);
        setStreamUrl(info.dashManifestUrl || defaultVariant?.localUrl || info.localUrl);
        console.log("[Watch] Stream info loaded", {
          videoId: currentVideo.id,
          variantCount: info.variants?.length || 0,
          audioTrackCount: info.audioTracks?.length || 0,
          hasDashManifest: !!info.dashManifestUrl,
          hasHlsManifest: !!info.hlsManifestUrl,
          defaultVariantId: defaultVariant?.id,
          defaultVariantLabel: defaultVariant?.qualityLabel,
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
        setSelectedQualityId(null);
        setStreamError(getYoutubeErrorMessage(err));
        console.error("Failed to load stream URL", err);
      } finally {
        setLoadingStream(false);
      }
    };

    loadStream();
  }, [currentVideo, videoId, setIsPlaying]);

  // --- Load comments, channel details, video details, FOSS metadata ---
  useEffect(() => {
    if (!videoId) return;

    // Reset state for new video
    setComments([]);
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
      } catch (err) {
        console.warn("Failed to load comments", err);
        setComments([]);
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
        const [dearrow, ryd, segments] = await Promise.all([
          getDeArrowOverride(videoId).catch(() => null),
          getReturnYouTubeDislike(videoId).catch(() => null),
          getSponsorBlockSegments(videoId).catch(() => [])
        ]);
        setDearrowData(dearrow);
        setRydData(ryd);
        setSponsorBlockSegments(segments);
        console.log("[Watch] SponsorBlock segments:", segments.length);
      } catch (e) {
        console.warn("Failed FOSS metadata", e);
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

    // Fire all in parallel
    loadComments();
    loadVideoMeta();
    loadFossMetadata();
    loadRelated();
  }, [videoId, setDearrowData, setRydData, setSponsorBlockSegments]);

  const handleTimeUpdate = useCallback((time: number, mediaDuration: number) => {
    setCurrentTime(time);
    setDuration(mediaDuration || currentVideo?.durationSeconds || 1);
  }, [setCurrentTime, setDuration, currentVideo?.durationSeconds]);

  const handleQualitySelect = useCallback((variant: StreamVariant) => {
    if (!variant.isPlayable) return;
    if (!variant.hasAudio && !audioTracks.some((track) => !!track.localUrl)) return;
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
  }, [audioTracks, dashManifestUrl, setIsPlaying]);

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
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0f0f0f] text-white">
        <Loader2 className="animate-spin text-red-500 mb-4" size={32} />
        <span className="text-sm font-bold uppercase tracking-wider text-zinc-500">
          Loading player details... {loadingStream ? "(Resolving stream...)" : ""} {streamError ? `(${streamError})` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white overflow-x-hidden font-sans pb-32">
      <div className={`mx-auto ${isTheaterMode ? 'max-w-[1600px] px-6 py-6 flex flex-col lg:flex-row gap-6 items-start' : 'max-w-[1750px] px-6 py-6 grid grid-cols-1 lg:grid-cols-[73%_27%] gap-6 items-start'}`}>
        
        {/* LEFT COLUMN */}
        <div className={`flex flex-col gap-5 ${isTheaterMode ? 'flex-grow min-w-0' : 'w-full'}`}>
          <div className={isTheaterMode ? "relative left-1/2 h-[min(72vh,56vw)] min-h-[420px] max-h-[820px] w-screen -translate-x-1/2 bg-black" : "w-full aspect-video"}>
            <div className={isTheaterMode ? "mx-auto h-full max-w-[1600px]" : "h-full w-full"}>
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
                onRetry={() => {
                  setStreamUrl(null);
                  setStreamVariants([]);
                  setCaptions([]);
                  setAudioTracks([]);
                  setSelectedQualityId(null);
                  if (currentVideo) {
                    void getStreamInfo(currentVideo.id).then((info) => {
                      const canUseAdaptive = (info.audioTracks || []).some((track) => !!track.localUrl);
                      const defaultVariant = info.variants?.find((variant) => variant.isDefault && variant.isPlayable && (variant.hasAudio || canUseAdaptive))
                        || info.variants?.find((variant) => variant.isPlayable && (variant.hasAudio || canUseAdaptive))
                        || null;
                      setStreamVariants(info.variants || []);
                      setCaptions(info.captions || []);
                      setAudioTracks(info.audioTracks || []);
                      setDashManifestUrl(info.dashManifestUrl || null);
                      setSelectedQualityId(defaultVariant?.id || null);
                      setStreamUrl(info.dashManifestUrl || defaultVariant?.localUrl || info.localUrl);
                      setStreamError(null);
                    }).catch((err) => setStreamError(getYoutubeErrorMessage(err)));
                  }
                }}
              />
            </div>
          </div>

          {/* METADATA SECTION */}
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight leading-snug group relative flex items-center gap-2 cursor-default">
              <span>{dearrowData?.title || currentVideo.title}</span>
              {dearrowData?.title && (
                <span className="text-xs text-yellow-400 opacity-70 cursor-help" title="DeArrow cleaned title">✨</span>
              )}
              {dearrowData?.title && (
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
                <div className="flex items-center bg-[#272727] rounded-full h-9 overflow-hidden hover:bg-[#3f3f3f] transition-colors divide-x divide-[#3f3f3f]">
                  <button 
                    onClick={() => setInteractionState(prev => prev === "liked" ? "none" : "liked")}
                    className={`px-4 h-full flex items-center gap-2 text-sm font-semibold cursor-pointer transition-colors ${interactionState === "liked" ? "text-white bg-[#3f3f3f]" : ""}`}
                  >
                    <ThumbsUp size={18} fill={interactionState === "liked" ? "white" : "none"} />
                    <span>{rydData ? rydData.likes.toLocaleString() : videoDetails?.likeCountText || "Like"}</span>
                  </button>
                  <button 
                    onClick={() => setInteractionState(prev => prev === "disliked" ? "none" : "disliked")}
                    className={`px-4 h-full flex items-center gap-2 justify-center cursor-pointer transition-colors ${interactionState === "disliked" ? "text-white bg-[#3f3f3f]" : ""}`}
                  >
                    <ThumbsDown size={18} fill={interactionState === "disliked" ? "white" : "none"} />
                    {rydData && <span className="text-sm font-semibold">{rydData.dislikes.toLocaleString()}</span>}
                  </button>
                </div>
                <button className="bg-[#272727] hover:bg-[#3f3f3f] rounded-full px-4 h-9 flex items-center gap-2 text-sm font-semibold transition-colors cursor-pointer">
                  <Share2 size={18} />
                  Share
                </button>
                <button className="bg-[#272727] hover:bg-[#3f3f3f] rounded-full px-4 h-9 flex items-center gap-2 text-sm font-semibold transition-colors cursor-pointer">
                  <FolderPlus size={18} />
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
              <span>{videoDetails?.viewCountText || currentVideo.viewCountText || "0 views"}</span>
              <span className="text-[#aaaaaa] font-medium">{videoDetails?.publishedText || currentVideo.publishedText || ""}</span>
            </div>
            <div className={`mt-2 whitespace-pre-wrap ${isDescExpanded ? 'block' : 'line-clamp-2'}`}>
              {videoDetails?.description || ""}
            </div>
          </div>

          {/* COMMENTS */}
          <div className="pt-4 space-y-6">
            <h2 className="text-xl font-bold">{comments.length} Comments</h2>
            {commentsLoading ? (
               <Loader2 className="animate-spin text-zinc-500" size={24} />
            ) : comments.length === 0 ? (
              <p className="text-sm text-zinc-500">No comments available for this video.</p>
            ) : (
              <div className="space-y-4">
                {comments.map((c: any, idx: number) => (
                  <div key={c.id || `comment-${idx}`} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#272727] shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold text-zinc-400">
                      {c.authorThumbnail ? (
                        <img src={c.authorThumbnail} className="w-full h-full object-cover" alt="" />
                      ) : (
                        c.author?.charAt(0)?.toUpperCase() || "?"
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold flex items-baseline gap-2">
                        {c.author} <span className="text-xs text-[#aaaaaa] font-medium">{c.publishedText}</span>
                      </div>
                      <div className="text-sm mt-1 text-zinc-200 whitespace-pre-wrap">{c.text}</div>
                      {(c.likeCount != null && c.likeCount > 0) && (
                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                          <span className="flex items-center gap-1"><ThumbsUp size={12} /> {c.likeCount}</span>
                          {c.replyCount != null && c.replyCount > 0 && (
                            <span className="text-[#3ea6ff] font-semibold cursor-pointer">{c.replyCount} {c.replyCount === 1 ? "reply" : "replies"}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Recommendations */}
        <div className={`flex flex-col gap-3 ${isTheaterMode ? 'w-full lg:w-[400px] shrink-0' : 'w-full'}`}>
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
                  <h4 className="text-sm font-bold text-[#f1f1f1] line-clamp-2 group-hover:text-[#3ea6ff] transition-colors">
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
  );
}

export default Watch;
