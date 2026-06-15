import { useCallback, useEffect, useState } from "react";
import { getComments } from "./api/youtube";
import type { Comment } from "../types/video";

export function useVideoComments(videoId: string | undefined) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [countText, setCountText] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replies, setReplies] = useState<Record<string, Comment[]>>({});
  const [repliesLoading, setRepliesLoading] = useState<Record<string, boolean>>({});
  const [repliesNextToken, setRepliesNextToken] = useState<Record<string, string | null>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setComments([]);
    setNextPageToken(null);
    setCountText(null);
    setReplies({});
    setRepliesLoading({});
    setRepliesNextToken({});
    setExpanded({});
    if (!videoId) return;

    let cancelled = false;
    setLoading(true);
    getComments(videoId)
      .then((res) => {
        if (cancelled) return;
        setComments(res.comments || []);
        setNextPageToken(res.nextPageToken || null);
        setCountText(res.commentCountText || null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Failed to load comments", err);
        setComments([]);
        setNextPageToken(null);
        setCountText(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const loadMore = useCallback(async () => {
    if (!videoId || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getComments(videoId, nextPageToken);
      setComments((prev) => [...prev, ...(res.comments || [])]);
      setNextPageToken(res.nextPageToken || null);
      if (res.commentCountText) setCountText(res.commentCountText);
    } catch (err) {
      console.error("Failed to load more comments", err);
    } finally {
      setLoadingMore(false);
    }
  }, [videoId, nextPageToken, loadingMore]);

  const loadReplies = useCallback(
    async (commentId: string, replyToken: string) => {
      if (!videoId || repliesLoading[commentId]) return;
      setRepliesLoading((prev) => ({ ...prev, [commentId]: true }));
      try {
        const res = await getComments(videoId, replyToken);
        setReplies((prev) => ({ ...prev, [commentId]: [...(prev[commentId] || []), ...(res.comments || [])] }));
        setRepliesNextToken((prev) => ({ ...prev, [commentId]: res.nextPageToken || null }));
      } catch (err) {
        console.error(`Failed to load replies for comment ${commentId}`, err);
      } finally {
        setRepliesLoading((prev) => ({ ...prev, [commentId]: false }));
      }
    },
    [videoId, repliesLoading],
  );

  const toggleReplies = useCallback(
    async (commentId: string, replyToken: string | null | undefined) => {
      if (expanded[commentId]) {
        setExpanded((prev) => ({ ...prev, [commentId]: false }));
        return;
      }
      setExpanded((prev) => ({ ...prev, [commentId]: true }));
      if (!replies[commentId] && replyToken) await loadReplies(commentId, replyToken);
    },
    [expanded, replies, loadReplies],
  );

  return {
    comments,
    loading,
    countText,
    nextPageToken,
    loadingMore,
    replies,
    repliesLoading,
    repliesNextToken,
    expanded,
    loadMore,
    toggleReplies,
    loadReplies,
  };
}
