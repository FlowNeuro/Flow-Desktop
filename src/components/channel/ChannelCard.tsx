import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import { useSubscriptionStore } from '../../store/useSubscriptionStore';
import { Button } from '../ui/Button';

export interface ChannelCardProps {
  channelId: string;
  name: string;
  avatarUrl?: string | null;
  subtitle?: string | null;
  fill?: boolean;
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function CircleAvatar({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="grid h-full w-full place-items-center rounded-full bg-surface-container-high text-2xl font-semibold text-neutral-500">
        {name.charAt(0).toUpperCase() || '?'}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full rounded-full object-cover"
    />
  );
}

export function ChannelCard({
  channelId,
  name,
  avatarUrl,
  subtitle,
  fill,
  className,
}: ChannelCardProps) {
  const navigate = useNavigate();
  const cleanId = channelId.replace('channel:', '');
  const isSubscribed = useSubscriptionStore((s) => s.isSubscribed);
  const subscribe = useSubscriptionStore((s) => s.subscribe);
  const unsubscribe = useSubscriptionStore((s) => s.unsubscribe);
  const subscribed = isSubscribed(cleanId);

  const open = () => {
    if (cleanId) navigate(`/channel/${cleanId}`);
  };

  const toggleSubscribe = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cleanId) return;
    if (subscribed) {
      void unsubscribe(cleanId);
    } else {
      void subscribe(cleanId, name, avatarUrl ?? undefined);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className={cx(
        'group flex cursor-pointer flex-col items-center gap-3 rounded-2xl text-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
        fill ? 'w-full' : 'w-40 md:w-48',
        className,
      )}
    >
      <div className="aspect-square w-full">
        <div className="h-full w-full overflow-hidden rounded-full ring-1 ring-neutral-800/50 transition-transform duration-200 ease-out group-hover:scale-[1.02]">
          <CircleAvatar src={avatarUrl} name={name} />
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-0.5">
        <span className="line-clamp-1 font-semibold text-neutral-100">{name}</span>
        <span className="line-clamp-1 text-sm text-neutral-400">{subtitle || 'Channel'}</span>
      </div>

      <Button
        variant={subscribed ? 'secondary' : 'primary'}
        size="sm"
        onClick={toggleSubscribe}
        className="mt-1"
        aria-pressed={subscribed}
      >
        {subscribed ? (
          <>
            <Check className="h-4 w-4" /> Subscribed
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" /> Subscribe
          </>
        )}
      </Button>
    </div>
  );
}

export default ChannelCard;
