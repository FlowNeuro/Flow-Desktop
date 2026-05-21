import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Plus, Loader2 } from "lucide-react";
import { getChannelDetails, getChannelVideos } from "../lib/api/youtube";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import type { VideoSummary, ChannelDetails } from "../types/video";
import { VideoGrid } from "../components/video/VideoGrid";
import { Button } from "../components/ui/Button";

interface ChannelProps {
  onPlay: (video: VideoSummary) => void;
  onAddToQueue: (video: VideoSummary) => void;
}

export const Channel: React.FC<ChannelProps> = ({ onPlay, onAddToQueue }) => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  
  const { isSubscribed, subscribe, unsubscribe, loadSubscriptions } = useSubscriptionStore();
  const [channelInfo, setChannelInfo] = useState<ChannelDetails | null>(null);
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  useEffect(() => {
    if (!channelId) return;

    const loadChannelData = async () => {
      setLoading(true);
      setLoadingVideos(true);
      try {
        const details = await getChannelDetails(channelId);
        setChannelInfo(details);
        setLoading(false);

        const res = await getChannelVideos(channelId);
        setVideos(res.videos);
      } catch (err) {
        console.error("Failed to load channel details/videos", err);
      } finally {
        setLoading(false);
        setLoadingVideos(false);
      }
    };

    loadChannelData();
  }, [channelId]);

  if (loading && !channelInfo) {
    return (
      <div className="flex-grow flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const cid = channelId || "";
  const subStatus = isSubscribed(cid);

  const handleSubscribeToggle = () => {
    if (subStatus) {
      unsubscribe(cid);
    } else {
      subscribe(cid, channelInfo?.name || "Unknown Creator", channelInfo?.avatarUrl || undefined);
    }
  };

  return (
    <div className="flex-grow overflow-y-auto pb-24">
      {/* Banner */}
      <div className="relative h-40 w-full bg-zinc-900 overflow-hidden border-b border-zinc-800">
        {channelInfo?.bannerUrl ? (
          <img 
            src={channelInfo.bannerUrl} 
            alt="Channel banner" 
            className="w-full h-full object-cover opacity-70"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-red-950/20 via-zinc-900 to-zinc-950" />
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-6 flex items-center gap-2 px-3 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-xl text-xs font-bold text-zinc-350 hover:text-white border border-zinc-800/40 transition-all active:scale-95 z-20"
        >
          <ArrowLeft size={14} />
          Back
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-8 -mt-10 relative z-10 space-y-8">
        {/* Profile Card Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 p-6 bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/60 rounded-3xl shadow-2xl">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-zinc-900 bg-zinc-800 shadow-xl shrink-0">
              {channelInfo?.avatarUrl ? (
                <img 
                  src={channelInfo.avatarUrl} 
                  alt={channelInfo.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-extrabold text-zinc-500">
                  {channelInfo?.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="text-center sm:text-left space-y-1 pb-1">
              <h1 className="text-2xl font-extrabold text-zinc-100 flex items-center justify-center sm:justify-start gap-2">
                {channelInfo?.name}
              </h1>
              <p className="text-xs font-semibold text-zinc-400">
                {channelInfo?.subscriberCountText || "YouTube Creator"}
              </p>
              {channelInfo?.description && (
                <p className="text-xs text-zinc-500 max-w-xl line-clamp-2 mt-2 leading-relaxed">
                  {channelInfo.description}
                </p>
              )}
            </div>
          </div>

          <Button
            variant={subStatus ? "secondary" : "primary"}
            size="md"
            onClick={handleSubscribeToggle}
            className="w-full md:w-auto shrink-0 transition-all font-bold px-6 shadow-md"
          >
            {subStatus ? (
              <span className="flex items-center justify-center gap-2"><Check size={16} /> Subscribed</span>
            ) : (
              <span className="flex items-center justify-center gap-2"><Plus size={16} /> Subscribe</span>
            )}
          </Button>
        </div>

        {/* Video Grid */}
        <div className="space-y-6">
          <h2 className="text-sm font-extrabold text-zinc-400 tracking-wider uppercase">
            Uploads
          </h2>

          {loadingVideos ? (
            <VideoGrid loading={true} onPlay={onPlay} />
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/10 p-6">
              <p className="text-zinc-500 text-xs">No recent videos found for this channel.</p>
            </div>
          ) : (
            <VideoGrid 
              videos={videos}
              onPlay={onPlay}
              onAddToQueue={onAddToQueue}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Channel;
