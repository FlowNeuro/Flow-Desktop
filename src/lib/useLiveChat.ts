import { useEffect, useRef, useState } from "react";
import { getLiveChat } from "./api/youtube";
import type { LiveChatMessage } from "../types/video";

const MAX_MESSAGES = 200;
const MAX_SEEN_IDS = 1500;
const RETRY_MS = 3000;
const MAX_FAILURES = 6;
const MIN_POLL_MS = 800;

export interface LiveChatState {
  messages: LiveChatMessage[];
  loading: boolean;
  // Chat is unavailable for this video, or its stream has closed.
  ended: boolean;
}

/**
 * Polls YouTube's native live chat for `videoId` while `enabled`. Seeds the continuation token
 * on the first call, then walks the continuation chain at the server-recommended cadence,
 * de-duplicating by message id and capping the in-memory backlog.
 */
export function useLiveChat(videoId: string | undefined, enabled: boolean): LiveChatState {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);

  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setMessages([]);
    setEnded(false);
    seenRef.current = new Set();

    if (!videoId || !enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let continuation: string | null = null;
    let failures = 0;
    setLoading(true);

    const schedule = (delay: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const page = await getLiveChat(videoId, continuation);
        if (cancelled) return;
        failures = 0;
        setLoading(false);

        const fresh = page.messages.filter((m) => !seenRef.current.has(m.id));
        if (fresh.length > 0) {
          for (const m of fresh) seenRef.current.add(m.id);
          if (seenRef.current.size > MAX_SEEN_IDS) {
            seenRef.current = new Set(Array.from(seenRef.current).slice(-MAX_SEEN_IDS));
          }
          setMessages((prev) => {
            const next = [...prev, ...fresh];
            return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
          });
        }

        // No further continuation means the chat had none to begin with or has now closed.
        if (!page.continuation) {
          setEnded(true);
          return;
        }
        continuation = page.continuation;
        schedule(Math.max(MIN_POLL_MS, page.pollingIntervalMs || 2000));
      } catch (err) {
        if (cancelled) return;
        failures += 1;
        console.warn("Live chat poll failed", err);
        if (failures >= MAX_FAILURES) {
          setLoading(false);
          setEnded(true);
          return;
        }
        schedule(RETRY_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [videoId, enabled]);

  return { messages, loading, ended };
}
