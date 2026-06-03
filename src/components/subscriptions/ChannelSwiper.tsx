import type { SubscribedChannel } from '../../store/useSubscriptionStore';
import { QuickAccessAvatar } from './QuickAccessAvatar';

export interface ChannelSwiperProps {
  channels: SubscribedChannel[];
  selectedChannelId?: string | null;
  channelsWithNewVideos?: Set<string>;
  onSelectChannel?: (channel: SubscribedChannel) => void;
}

export function ChannelSwiper({
  channels,
  selectedChannelId,
  channelsWithNewVideos,
  onSelectChannel,
}: ChannelSwiperProps) {
  return (
    <div className="flex flex-row gap-4 overflow-x-auto py-4 snap-x hide-scrollbar">
      {channels.map((channel) => (
        <QuickAccessAvatar
          key={channel.id}
          name={channel.name}
          avatarUrl={channel.avatarUrl}
          active={selectedChannelId === channel.id}
          hasNewVideos={channelsWithNewVideos?.has(channel.id)}
          onClick={() => onSelectChannel?.(channel)}
        />
      ))}
    </div>
  );
}
