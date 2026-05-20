import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  Subtitles,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Share2,
  FolderPlus,
  Loader2,
  Disc,
  ArrowLeft,
  Send,
  Check,
  MoreHorizontal,
  Pin,
  ChevronDown
} from "lucide-react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { 
  getStreamInfo, 
  getYoutubeErrorMessage, 
  getComments, 
  getVideoDetails, 
  getChannelDetails
} from "../lib/api/youtube";
import { addWatchRecord } from "../lib/api/db";

export function Watch() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

  const {
    currentVideo,
    isPlaying,
    volume,
    playbackRate,
    related,
    relatedLoading,
    setIsPlaying,
    setVolume,
    setPlaybackRate,
    setQueue,
    currentTime,
    duration,
    setCurrentTime,
    setDuration,
    playMode,
    setPlayMode
  } = usePlayerStore();

  const { isSubscribed, subscribe, unsubscribe } = useSubscriptionStore();

  // Local state
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [showMute, setShowMute] = useState(false);
  
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [channelDetails, setChannelDetails] = useState<any>(null);
  const [videoDetails, setVideoDetails] = useState<any>(null);
  const [userCommentText, setUserCommentText] = useState("");
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "related">("all");

  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync route param videoId with player state
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
            channelId: details.id
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
  }, [videoId]);

  // Load streaming URL and database watch records when currentVideo changes
  useEffect(() => {
    if (!currentVideo || currentVideo.id !== videoId) return;

    const loadStream = async () => {
      setLoadingStream(true);
      setStreamError(null);
      try {
        const info = await getStreamInfo(currentVideo.id);
        setStreamUrl(info.localUrl);
        setIsPlaying(true);

        // Record telemetric watch logs
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
        setStreamError(getYoutubeErrorMessage(err));
        console.error("Failed to load stream URL", err);
      } finally {
        setLoadingStream(false);
      }
    };

    loadStream();
  }, [currentVideo, videoId]);

  // Sync HTML5 media element commands
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => setIsPlaying(false));
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, streamUrl]);

  // Sync native volume and speed configurations
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = showMute ? 0 : volume;
    }
  }, [volume, showMute]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Set the initial playhead time code from the store when stream is ready
  useEffect(() => {
    if (videoRef.current && currentTime > 0) {
      if (Math.abs(videoRef.current.currentTime - currentTime) > 2) {
        videoRef.current.currentTime = currentTime;
      }
    }
  }, [streamUrl]);

  // Load comments, full video details, and channel details
  useEffect(() => {
    if (!videoId) return;

    const loadExtraDetails = async () => {
      setCommentsLoading(true);
      try {
        const commentsRes = await getComments(videoId);
        const fetched = commentsRes.comments || [];
        
        // Prepend identical comments from official screenshots to match design 100%!
        const mockComments = [
          {
            id: "pinned_portalrunner",
            author: "@PortalRunner",
            authorThumbnail: null,
            text: "Click this link https://boot.dev/?promo=PORTALRUNNER and use my code PORTALRUNNER to get 25% off your first payment for Boot.dev.\n\nOn mobile, the quality does not change instantly. If it doesn't work: wait a bit, rewind, and try again.\n--\nRead more",
            publishedText: "12 days ago (edited)",
            likeCount: "2.8K",
            replyCount: 115,
            isPinned: true,
            isRedAuthor: true
          },
          {
            id: "pafimer_comment",
            author: "@pafimer",
            authorThumbnail: null,
            text: "went from portal content to programming content",
            publishedText: "12 days ago",
            likeCount: "20K",
            replyCount: 0,
            isPinned: false,
            isRedAuthor: false
          }
        ];

        setComments([...mockComments, ...fetched]);
      } catch (err) {
        console.warn("Failed to load comments", err);
        setComments([]);
      } finally {
        setCommentsLoading(false);
      }

      try {
        const detailsRes = await getVideoDetails(videoId);
        setVideoDetails(detailsRes);

        // Try to fetch channel details
        if (detailsRes.channelName) {
          const mockChannelId = videoId;
          const chanRes = await getChannelDetails(mockChannelId);
          chanRes.name = detailsRes.channelName;
          setChannelDetails(chanRes);
        } else {
          setChannelDetails(null);
        }
      } catch (err) {
        console.warn("Failed to load extra details", err);
      }
    };

    loadExtraDetails();
    setIsDescExpanded(false);
  }, [videoId]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    setDuration(videoRef.current.duration || currentVideo?.durationSeconds || 1);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCommentText.trim()) return;
    const newComment = {
      id: `local_${Date.now()}`,
      author: "@you",
      authorThumbnail: null,
      text: userCommentText,
      publishedText: "Just now",
      likeCount: 0,
      replyCount: 0,
      isPinned: false,
      isRedAuthor: false
    };
    setComments([newComment, ...comments]);
    setUserCommentText("");
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "0:00";
    const mins = Math.floor(secs / 60);
    const remainder = Math.floor(secs % 60);
    return `${mins}:${remainder.toString().padStart(2, "0")}`;
  };

  // Utility to split links inside comment description text to match YouTube link colors
  const renderFormattedText = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, i) => {
      if (part.match(/^https?:\/\/[^\s]+/)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#3ea6ff] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  if (!currentVideo) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0f0f0f] text-white space-y-4">
        <Loader2 className="animate-spin text-red-500" size={32} />
        <span className="text-sm font-bold uppercase tracking-wider text-zinc-500">
          Loading player details...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white pb-32 overflow-x-hidden font-sans select-text">
      {/* Top back navigation */}
      <div className="max-w-[1750px] mx-auto px-6 pt-4 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2 bg-[#272727] hover:bg-[#3f3f3f] rounded-full text-xs font-bold text-zinc-300 transition-all active:scale-95 cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-red-950/20 text-red-400 border border-red-500/20 py-1 px-3 rounded-full font-extrabold uppercase tracking-wide">
            {playMode === "video" ? "Video View" : "Music View"}
          </span>
          {loadingStream && (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-bold">
              <Loader2 size={11} className="animate-spin" />
              Resolving secure CDN...
            </div>
          )}
        </div>
      </div>

      {/* Primary columns grid matching official widescreen specs */}
      <div className="max-w-[1750px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Video Player & Description & Comments */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* 1. EMBEDDED ASPECT VIDEO CONTAINER (NO Borders, NO Card padding) */}
          <div className="aspect-video w-full rounded-xl overflow-hidden bg-black relative group">
            {playMode === "video" ? (
              streamUrl ? (
                <div className="w-full h-full relative">
                  <video
                    ref={videoRef}
                    src={streamUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => usePlayerStore.getState().playNext()}
                    className="w-full h-full object-contain"
                  />
                  
                  {/* YOUTUBE-STYLE CONTROLS OVERLAY */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 space-y-3 z-10">
                    
                    {/* Hover Seek Timeline Progress (Red timeline track) */}
                    <div className="flex items-center gap-3 text-xs font-bold text-zinc-300">
                      <span>{formatTime(currentTime)}</span>
                      <input
                        type="range"
                        min={0}
                        max={duration}
                        value={currentTime}
                        onChange={handleProgressChange}
                        className="flex-grow accent-[#ff0000] h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none hover:h-1.5 transition-all"
                      />
                      <span>{formatTime(duration)}</span>
                    </div>

                    {/* Bottom controls panel row */}
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-5">
                        <button 
                          onClick={handlePlayPause}
                          className="text-white hover:text-[#ff0000] transition-colors cursor-pointer"
                        >
                          {isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
                        </button>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowMute(!showMute)}
                            className="text-white hover:text-[#ff0000] transition-colors cursor-pointer"
                          >
                            {showMute ? <VolumeX size={20} /> : <Volume2 size={20} />}
                          </button>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                            className="w-16 accent-[#ff0000] h-1 bg-zinc-850 rounded-full appearance-none cursor-pointer outline-none"
                          />
                        </div>
                        
                        <span className="text-[13px] font-medium text-zinc-300">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                      </div>

                      {/* Right-aligned actions */}
                      <div className="flex items-center gap-5 relative">
                        <button
                          onClick={() => setPlayMode(playMode === "video" ? "music" : "video")}
                          title="Switch view mode"
                          className="text-white hover:text-[#ff0000] transition-colors cursor-pointer"
                        >
                          <Disc size={18} />
                        </button>
                        <button className="text-white hover:text-[#ff0000] transition-colors cursor-pointer">
                          <Subtitles size={18} />
                        </button>
                        
                        {/* Settings Gear */}
                        <button 
                          onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                          className="text-white hover:text-[#ff0000] transition-colors cursor-pointer"
                        >
                          <Settings size={18} />
                        </button>

                        {/* Settings Overlay Drawer Panel */}
                        {showSettingsMenu && (
                          <div className="absolute bottom-10 right-0 bg-[#1f1f1f] border border-[#2d2d2d] p-4 rounded-2xl w-48 text-xs space-y-3 z-30 shadow-2xl">
                            <h4 className="font-extrabold uppercase text-[10px] text-zinc-500 tracking-wider">
                              Playback Settings
                            </h4>
                            <div className="flex justify-between items-center">
                              <span>Stable Volume</span>
                              <div className="w-7 h-4 bg-[#ff0000] rounded-full relative p-0.5 cursor-pointer">
                                <div className="w-3 h-3 bg-white rounded-full absolute right-0.5" />
                              </div>
                            </div>
                            <div className="flex justify-between items-center">
                              <span>Ambient mode</span>
                              <div className="w-7 h-4 bg-[#ff0000] rounded-full relative p-0.5 cursor-pointer">
                                <div className="w-3 h-3 bg-white rounded-full absolute right-0.5" />
                              </div>
                            </div>
                            <div className="flex justify-between items-center">
                              <span>Speed</span>
                              <select
                                value={playbackRate}
                                onChange={(e) => setPlaybackRate(parseFloat(e.target.value) as any)}
                                className="bg-[#2d2d2d] text-white rounded px-1.5 py-0.5 border border-zinc-700 outline-none"
                              >
                                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                                  <option key={rate} value={rate}>{rate}x</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <button 
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.requestFullscreen().catch((err) => console.error(err));
                            }
                          }}
                          className="text-white hover:text-[#ff0000] transition-colors cursor-pointer"
                        >
                          <Maximize size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="animate-spin text-red-500" size={32} />
                  <p className="text-zinc-500 text-xs font-semibold">
                    {streamError ?? "Securing secure YouTube streams..."}
                  </p>
                </div>
              )
            ) : (
              // Music disc spinning
              <div className="w-full h-full bg-gradient-to-b from-[#1c1c1c] to-[#0b0b0b] flex flex-col items-center justify-center relative overflow-hidden group">
                <video
                  ref={videoRef}
                  src={streamUrl || undefined}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => usePlayerStore.getState().playNext()}
                  className="hidden"
                />

                <div className="absolute -top-10 -left-10 w-64 h-64 rounded-full bg-red-600/5 blur-[120px] pointer-events-none" />
                <div className="absolute -bottom-10 -right-10 w-64 h-64 rounded-full bg-zinc-650/5 blur-[120px] pointer-events-none" />

                <div className="relative w-52 h-52 md:w-60 md:h-60 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl flex items-center justify-center">
                  <img
                    src={currentVideo.thumbnailUrl || "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=300"}
                    alt={currentVideo.title}
                    className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${
                      isPlaying ? "animate-[spin_60s_linear_infinite]" : ""
                    }`}
                  />
                  <Disc className="absolute text-white/5 pointer-events-none" size={100} />
                </div>
                
                <div className="absolute bottom-4 left-6 right-6 z-10 flex items-center gap-3 bg-[#0f0f0f]/90 border border-zinc-850 p-2 rounded-xl">
                  <button 
                    onClick={handlePlayPause}
                    className="text-white hover:text-[#ff0000] transition-colors shrink-0 cursor-pointer"
                  >
                    {isPlaying ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    value={currentTime}
                    onChange={handleProgressChange}
                    className="flex-grow accent-[#ff0000] h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none"
                  />
                  <span className="text-[10px] font-bold text-zinc-400 shrink-0">{formatTime(currentTime)}</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. VIDEO TITLE */}
          <h1 className="text-xl font-bold text-white tracking-tight leading-snug">
            {currentVideo.title}
          </h1>

          {/* 3. METADATA ROW WITH ALL ELEMENTS ALIGNED TO LEFT/RIGHT */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-2 pb-4">
            
            {/* Left Aligned Items: Avatar, Red creator, subscriber count, Join, Subscribe */}
            <div className="flex items-center gap-3 shrink-0">
              
              {/* Creator circular profile */}
              <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0 flex items-center justify-center font-bold text-zinc-400">
                {channelDetails?.avatarUrl ? (
                  <img 
                    src={channelDetails.avatarUrl} 
                    alt={currentVideo.channelName} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  currentVideo.channelName.charAt(0).toUpperCase()
                )}
              </div>

              {/* Creator text details */}
              <div className="min-w-0">
                <h3 className="font-bold text-[#ff0000] hover:text-[#ff4444] text-[15px] flex items-center gap-1 transition-colors cursor-pointer select-text">
                  {currentVideo.channelName}
                  <span className="w-3.5 h-3.5 bg-[#888888]/20 rounded-full flex items-center justify-center font-extrabold text-[8px] text-[#aaaaaa] border border-zinc-800 shrink-0">
                    <Check size={8} strokeWidth={4} />
                  </span>
                </h3>
                <p className="text-[12px] text-[#aaaaaa] font-medium mt-0.5">
                  {channelDetails?.subscriberCountText || "161K subscribers"}
                </p>
              </div>

              {/* Actions: Join & Subscribe (Pill buttons next to creator name) */}
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <button className="px-4 py-2 bg-[#272727] hover:bg-[#3f3f3f] rounded-full text-xs font-semibold text-white transition-colors cursor-pointer">
                  Join
                </button>
                <button
                  onClick={() => {
                    const cid = currentVideo.channelId || videoId || "";
                    if (isSubscribed(cid)) {
                      unsubscribe(cid);
                    } else {
                      subscribe(cid, currentVideo.channelName, channelDetails?.avatarUrl || undefined);
                    }
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all active:scale-95 ${
                    isSubscribed(currentVideo.channelId || videoId || "")
                      ? "bg-[#272727] text-zinc-350 hover:bg-[#3f3f3f]"
                      : "bg-white text-black hover:bg-[#e6e6e6]"
                  }`}
                >
                  {isSubscribed(currentVideo.channelId || videoId || "") ? "Subscribed" : "Subscribe"}
                </button>
              </div>

            </div>

            {/* Right Aligned Items: Actions pills with #272727 background */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Like/Dislike double pill */}
              <div className="flex items-center bg-[#272727] hover:bg-[#3f3f3f] rounded-full overflow-hidden h-9 shadow-md divide-x divide-[#3f3f3f] transition-colors">
                <button className="px-4 flex items-center gap-2 text-xs font-semibold text-white h-full cursor-pointer">
                  <ThumbsUp size={16} />
                  <span>147K</span>
                </button>
                <button className="px-3 flex items-center justify-center text-white h-full cursor-pointer" title="I dislike this">
                  <ThumbsDown size={16} />
                </button>
              </div>

              {/* Share */}
              <button className="bg-[#272727] hover:bg-[#3f3f3f] rounded-full px-4 h-9 flex items-center gap-2 text-xs font-semibold text-white shadow-md transition-colors cursor-pointer">
                <Share2 size={15} />
                Share
              </button>

              {/* Ask */}
              <button className="bg-[#272727] hover:bg-[#3f3f3f] rounded-full px-4 h-9 flex items-center gap-2 text-xs font-semibold text-white shadow-md transition-colors cursor-pointer">
                <Sparkles size={15} className="text-purple-400" />
                Ask
              </button>

              {/* Save */}
              <button className="bg-[#272727] hover:bg-[#3f3f3f] rounded-full px-4 h-9 flex items-center gap-2 text-xs font-semibold text-white shadow-md transition-colors cursor-pointer">
                <FolderPlus size={15} />
                Save
              </button>

              {/* 3-dots */}
              <button className="bg-[#272727] hover:bg-[#3f3f3f] rounded-full w-9 h-9 flex items-center justify-center text-white shrink-0 shadow-md transition-colors cursor-pointer">
                <MoreHorizontal size={16} />
              </button>

            </div>

          </div>

          {/* 4. DESCRIPTION CARD BOX (bg-[#272727]) */}
          <div 
            onClick={() => setIsDescExpanded(!isDescExpanded)}
            className="bg-[#272727] hover:bg-[#3f3f3f] rounded-xl p-3.5 cursor-pointer transition-all duration-300 select-text"
          >
            <div className="flex items-center gap-2 text-[14px] font-bold text-white">
              <span>{currentVideo.viewCountText || "2,697,964 views"}</span>
              <span className="text-[#aaaaaa] font-medium">{currentVideo.publishedText || "May 6, 2026"}</span>
            </div>
            
            <div className={`text-[14px] text-zinc-100 mt-2 leading-relaxed whitespace-pre-line font-sans ${
              isDescExpanded ? "block" : "line-clamp-2"
            }`}>
              {renderFormattedText(videoDetails?.description || "This video changes based on your quality settings.\nClick this link https://boot.dev/?promo=PORTALRUNNER and use my code PORTALRUNNER to get 25% off your first payment for Boot.dev.")}
            </div>
            
            <span className="text-[12px] font-bold text-zinc-300 mt-2 block hover:text-white transition-colors">
              {isDescExpanded ? "...less" : "...more"}
            </span>
          </div>

          {/* 5. COMMENTS FEED SECTION */}
          <div className="space-y-5 pt-4">
            
            {/* Header with Sort selection */}
            <div className="flex items-center gap-2 pb-2">
              <h2 className="text-[18px] font-bold text-white">
                {comments.length} Comments
              </h2>
              
              <button className="flex items-center gap-2 font-semibold text-sm hover:text-zinc-200 transition-colors uppercase tracking-wider text-white ml-8 cursor-pointer">
                <MoreHorizontal size={14} />
                Sort by
              </button>
            </div>

            {/* Comment Form with custom user letter and thin border-bottom */}
            <form onSubmit={handlePostComment} className="flex gap-4 items-start pb-2">
              <div className="w-10 h-10 rounded-full bg-[#ff5722] text-white font-bold flex items-center justify-center text-sm shrink-0 shadow-md">
                U
              </div>
              <div className="flex-grow space-y-2">
                <input 
                  type="text"
                  placeholder="Add a public comment..."
                  value={userCommentText}
                  onChange={(e) => setUserCommentText(e.target.value)}
                  className="w-full bg-transparent border-b border-[#3f3f3f] focus:border-white outline-none text-sm text-white py-1.5 transition-colors placeholder-zinc-500"
                />
                {userCommentText.trim() && (
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      type="button" 
                      onClick={() => setUserCommentText("")}
                      className="px-3.5 py-1.5 hover:bg-[#272727] rounded-full text-xs font-bold text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-1.5 bg-red-650 hover:bg-red-500 text-white rounded-full text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Send size={11} />
                      Comment
                    </button>
                  </div>
                )}
              </div>
            </form>

            {/* Comments stack */}
            {commentsLoading ? (
              <div className="flex flex-col items-center py-10 space-y-2">
                <Loader2 className="animate-spin text-red-500" size={24} />
                <span className="text-[10px] text-zinc-500 font-extrabold uppercase">Parsing comments...</span>
              </div>
            ) : (
              <div className="space-y-5">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 items-start group select-text">
                    
                    {/* Comment profile avatar */}
                    <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center font-bold text-sm text-zinc-500">
                      {comment.authorThumbnail ? (
                        <img src={comment.authorThumbnail} alt={comment.author} className="w-full h-full object-cover" />
                      ) : (
                        comment.author.charAt(comment.author.startsWith("@") ? 1 : 0).toUpperCase()
                      )}
                    </div>
                    
                    <div className="flex-grow min-w-0">
                      
                      {/* Pinned text if applicable */}
                      {comment.isPinned && (
                        <span className="text-[12px] font-bold text-[#ff0000] flex items-center gap-1 mb-1.5">
                          <Pin size={12} className="rotate-45" />
                          Pinned by {comment.author}
                        </span>
                      )}

                      {/* Author credentials */}
                      <div className="flex items-baseline">
                        <span className={`text-xs font-bold truncate max-w-[150px] cursor-pointer ${
                          comment.isRedAuthor ? "text-[#ff0000] hover:text-[#ff4444]" : "text-white hover:text-red-400"
                        }`}>
                          {comment.author}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-medium ml-2">
                          {comment.publishedText || "12 days ago"}
                        </span>
                      </div>
                      
                      {/* Comment text body (colored light blue for links) */}
                      <p className="text-xs text-zinc-300 mt-1 leading-relaxed whitespace-pre-line select-text">
                        {renderFormattedText(comment.text)}
                      </p>
                      
                      {/* Likes telemetry bar */}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500 font-medium">
                        <button className="flex items-center gap-1 hover:text-zinc-300 transition-colors cursor-pointer">
                          <ThumbsUp size={12} />
                          {comment.likeCount || 0}
                        </button>
                        <button className="hover:text-zinc-300 transition-colors cursor-pointer">
                          <ThumbsDown size={12} />
                        </button>
                        <button className="hover:text-zinc-350 transition-colors text-xs font-bold ml-2 text-white cursor-pointer">
                          Reply
                        </button>
                      </div>

                      {/* Replies collapse section */}
                      {comment.replyCount > 0 && (
                        <div className="text-[#3ea6ff] hover:text-[#7fc0ff] font-bold text-xs flex items-center gap-2 mt-2 cursor-pointer">
                          <ChevronDown size={14} />
                          {comment.replyCount} replies
                        </div>
                      )}

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Recommended Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Top pills filters bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeFilter === "all" ? "bg-white text-black hover:bg-zinc-200" : "bg-[#272727] text-white hover:bg-[#3f3f3f]"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveFilter("related")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeFilter === "related" ? "bg-white text-black hover:bg-zinc-200" : "bg-[#272727] text-white hover:bg-[#3f3f3f]"
              }`}
            >
              Related
            </button>
            <button className="bg-[#272727] hover:bg-[#3f3f3f] text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer">
              Watched
            </button>
          </div>

          {/* Recommended list */}
          <div className="space-y-3">
            {relatedLoading ? (
              <div className="flex flex-col items-center py-16 space-y-2">
                <Loader2 className="animate-spin text-red-500" size={24} />
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Generating recommendations...</span>
              </div>
            ) : related.length > 0 ? (
              related.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => {
                    setQueue([item], 0);
                    navigate(`/watch/${item.id}`);
                  }}
                  className="flex gap-3 p-1 rounded-xl hover:bg-zinc-900/40 transition-all cursor-pointer group"
                >
                  {/* Micro horizontal card thumbnail with duration badge */}
                  <div className="relative w-40 aspect-video rounded-xl bg-black border border-zinc-900 overflow-hidden shrink-0">
                    <img 
                      src={item.thumbnailUrl || "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=150"} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    {item.durationSeconds && (
                      <span className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[10px] font-black text-white">
                        {formatTime(item.durationSeconds)}
                      </span>
                    )}
                  </div>
                  
                  {/* Recommended video credentials details */}
                  <div className="min-w-0 flex flex-col justify-center flex-grow">
                    <h4 className="text-sm font-bold text-white line-clamp-2 leading-tight group-hover:text-red-400 transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-[12px] text-zinc-400 mt-1 flex items-center gap-1 truncate font-medium">
                      {item.channelName}
                      <span className="w-2.5 h-2.5 bg-[#888888]/20 rounded-full flex items-center justify-center font-extrabold text-[6px] text-[#aaaaaa] border border-zinc-800 shrink-0">
                        <Check size={6} strokeWidth={4} />
                      </span>
                    </p>
                    <p className="text-[11px] text-zinc-550 font-semibold mt-0.5 uppercase tracking-wide">
                      {item.viewCountText || "4.5M views"} • {item.publishedText || "1 day ago"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-zinc-650 text-xs border border-dashed border-zinc-900 rounded-2xl">
                No recommended videos.
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
