import React, { useState } from "react";
import { Check } from "lucide-react";
import { SubscribeButton } from "../ui/SubscribeButton";
import type { ChannelDetails } from "../../types/video";
import { upgradeAvatarUrl, upgradeChannelBannerUrl } from "../../lib/thumbnails";
import { useProxiedImageUrl } from "../../lib/useProxiedImageUrl";

interface ChannelHeroProps {
  channelInfo: ChannelDetails | null;
}

export const ChannelHero: React.FC<ChannelHeroProps> = ({
  channelInfo,
}) => {
  const [descExpanded, setDescExpanded] = useState(false);
  const bannerUrl = useProxiedImageUrl(upgradeChannelBannerUrl(channelInfo?.bannerUrl));
  const avatarUrl = useProxiedImageUrl(upgradeAvatarUrl(channelInfo?.avatarUrl));

  if (!channelInfo) return null;

  return (
    <div className="w-full flex flex-col bg-background">
      {/* Banner */}
      <div className="relative w-full h-48 md:h-64 bg-chrome-zinc-900">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt="Channel banner"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-chrome-zinc-800" />
        )}
        {/* Bottom Gradient Blend */}
        <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Profile Block (Overlapping) */}
      <div className=" mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 relative z-10">
          
          <div className="flex flex-col md:flex-row items-center md:items-end gap-6">
            {/* Overlapping Avatar */}
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-background bg-chrome-zinc-800 shrink-0 -mt-16 md:-mt-16">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={channelInfo.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-chrome-zinc-500">
                  {channelInfo.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="text-center md:text-left space-y-1 mt-4 md:mt-0 pb-2">
              <h1 className="text-4xl font-bold tracking-tight text-chrome-neutral-100 flex items-center justify-center md:justify-start gap-2">
                {channelInfo.name}
                {channelInfo.verified && (
                  <Check size={20} className="text-chrome-neutral-400 bg-chrome-neutral-800 rounded-full p-0.5" />
                )}
              </h1>
              <p className="text-chrome-neutral-400 font-medium">
                {channelInfo.subscriberCountText || "YouTube Creator"} • 
                <span className="ml-1">@{channelInfo.id}</span>
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-center md:justify-end gap-3 w-full md:w-auto mt-4 md:mt-0 shrink-0 pb-2">
            <SubscribeButton
              channelId={channelInfo.id}
              channelName={channelInfo.name}
              avatarUrl={avatarUrl || undefined}
              size="md"
            />
          </div>
        </div>

        {/* Description */}
        {channelInfo.description && (
          <div 
            className="mb-8 cursor-pointer group"
            onClick={() => setDescExpanded(!descExpanded)}
          >
            <p className={`text-chrome-neutral-400 text-sm leading-relaxed ${descExpanded ? "" : "line-clamp-2"} group-hover:text-chrome-neutral-300 transition-colors max-w-3xl`}>
              {channelInfo.description}
            </p>
            {!descExpanded && channelInfo.description.length > 150 && (
              <span className="text-chrome-neutral-500 text-xs font-semibold uppercase tracking-wider mt-1 block">
                Show more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
