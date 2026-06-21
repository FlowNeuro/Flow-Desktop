import { useNavigate } from "react-router-dom";
import { Music2 } from "lucide-react";
import { useProxiedImageUrl } from "../../lib/useProxiedImageUrl";
import { SubscribeButton } from "../ui/SubscribeButton";
import type { ShortItem } from "../../types/shorts";

interface ShortMetadataProps {
  short: ShortItem;
  onOpenDescription: () => void;
}

export function ShortMetadata({ short, onOpenDescription }: ShortMetadataProps) {
  const navigate = useNavigate();
  const avatar = useProxiedImageUrl(short.channelAvatarUrl ?? undefined);

  return (
    <div className="absolute bottom-6 left-6 right-20 z-20 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => short.channelId && navigate(`/channel/${short.channelId}`)}
          className="flex items-center gap-3"
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-full bg-surface-container-high text-sm font-bold text-neutral-300">
              {short.channelName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-medium text-white hover:underline">{short.channelName}</span>
        </button>
        {short.channelId && (
          <SubscribeButton
            channelId={short.channelId}
            channelName={short.channelName}
            avatarUrl={short.channelAvatarUrl ?? undefined}
            size="sm"
          />
        )}
      </div>

      <p
        className="line-clamp-2 cursor-pointer text-base text-white hover:underline"
        onClick={onOpenDescription}
      >
        {short.title}
      </p>

      <div className="flex items-center gap-2 text-sm text-neutral-300">
        <Music2 className="h-4 w-4 shrink-0" />
        <span className="truncate">Original audio · {short.channelName}</span>
      </div>
    </div>
  );
}
