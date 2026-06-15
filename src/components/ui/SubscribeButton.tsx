import React, { useEffect } from "react";
import { Check } from "lucide-react";
import { Button } from "./Button";
import { useSubscriptionStore } from "../../store/useSubscriptionStore";

export interface SubscribeButtonProps {
  channelId: string;
  channelName: string;
  avatarUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SubscribeButton({
  channelId,
  channelName,
  avatarUrl,
  size = "md",
  className = "",
}: SubscribeButtonProps) {
  const { isSubscribed, subscribe, unsubscribe, loadSubscriptions } = useSubscriptionStore();

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const active = isSubscribed(channelId);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (active) {
      unsubscribe(channelId);
    } else {
      subscribe(channelId, channelName, avatarUrl);
    }
  };

  return (
    <Button
      variant={active ? "secondary" : "primary"}
      size={size}
      onClick={handleToggle}
      className={`font-semibold px-6 transition-all ${
        active 
          ? "bg-zinc-800 hover:bg-zinc-700 text-neutral-200" 
          : "bg-primary text-white"
      } ${className}`}
    >
      {active ? (
        <>
          <Check size={18} className="mr-2" /> Subscribed
        </>
      ) : (
        <>
          Subscribe
        </>
      )}
    </Button>
  );
}
