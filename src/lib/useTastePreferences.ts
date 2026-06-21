import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addBlockedTopic,
  addPreferredTopic,
  getBrainSnapshot,
  removePreferredTopic,
  unblockTopic,
} from "./api/recommendation";

function normalizeTopic(topic: string) {
  return topic.trim();
}

function sameTopic(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function sortTopics(topics: string[]) {
  return [...topics].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function useTastePreferences() {
  const [preferredTopics, setPreferredTopics] = useState<string[]>([]);
  const [blockedTopics, setBlockedTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTopic, setSavingTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const brain = await getBrainSnapshot(true);
      setPreferredTopics(sortTopics(brain.preferred_topics ?? []));
      setBlockedTopics(sortTopics(brain.blocked_topics ?? []));
    } catch (err) {
      console.warn("Failed to load taste preferences", err);
      setError("load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const preferredSet = useMemo(
    () => new Set(preferredTopics.map((topic) => topic.toLowerCase())),
    [preferredTopics],
  );
  const blockedSet = useMemo(
    () => new Set(blockedTopics.map((topic) => topic.toLowerCase())),
    [blockedTopics],
  );

  const addInterest = useCallback(async (topic: string) => {
    const clean = normalizeTopic(topic);
    if (!clean) return;
    setSavingTopic(clean);
    setError(null);
    const previousPreferred = preferredTopics;
    const previousBlocked = blockedTopics;
    setPreferredTopics((topics) => (
      topics.some((item) => sameTopic(item, clean)) ? topics : sortTopics([...topics, clean])
    ));
    setBlockedTopics((topics) => topics.filter((item) => !sameTopic(item, clean)));
    try {
      await addPreferredTopic(clean);
    } catch (err) {
      console.warn("Failed to add preferred topic", err);
      setPreferredTopics(previousPreferred);
      setBlockedTopics(previousBlocked);
      setError("save");
    } finally {
      setSavingTopic(null);
    }
  }, [blockedTopics, preferredTopics]);

  const removeInterest = useCallback(async (topic: string) => {
    const clean = normalizeTopic(topic);
    if (!clean) return;
    setSavingTopic(clean);
    setError(null);
    const previousPreferred = preferredTopics;
    setPreferredTopics((topics) => topics.filter((item) => !sameTopic(item, clean)));
    try {
      await removePreferredTopic(clean);
    } catch (err) {
      console.warn("Failed to remove preferred topic", err);
      setPreferredTopics(previousPreferred);
      setError("save");
    } finally {
      setSavingTopic(null);
    }
  }, [preferredTopics]);

  const toggleInterest = useCallback((topic: string) => {
    if (preferredSet.has(topic.toLowerCase())) {
      return removeInterest(topic);
    }
    return addInterest(topic);
  }, [addInterest, preferredSet, removeInterest]);

  const blockTopic = useCallback(async (topic: string) => {
    const clean = normalizeTopic(topic).toLowerCase();
    if (!clean) return;
    setSavingTopic(clean);
    setError(null);
    const previousPreferred = preferredTopics;
    const previousBlocked = blockedTopics;
    setBlockedTopics((topics) => (
      topics.some((item) => sameTopic(item, clean)) ? topics : sortTopics([...topics, clean])
    ));
    setPreferredTopics((topics) => topics.filter((item) => !sameTopic(item, clean)));
    try {
      await addBlockedTopic(clean);
    } catch (err) {
      console.warn("Failed to block topic", err);
      setPreferredTopics(previousPreferred);
      setBlockedTopics(previousBlocked);
      setError("save");
    } finally {
      setSavingTopic(null);
    }
  }, [blockedTopics, preferredTopics]);

  const unblockBlockedTopic = useCallback(async (topic: string) => {
    const clean = normalizeTopic(topic);
    if (!clean) return;
    setSavingTopic(clean);
    setError(null);
    const previousBlocked = blockedTopics;
    setBlockedTopics((topics) => topics.filter((item) => !sameTopic(item, clean)));
    try {
      await unblockTopic(clean);
    } catch (err) {
      console.warn("Failed to unblock topic", err);
      setBlockedTopics(previousBlocked);
      setError("save");
    } finally {
      setSavingTopic(null);
    }
  }, [blockedTopics]);

  return {
    blockedSet,
    blockedTopics,
    blockTopic,
    error,
    loading,
    preferredSet,
    preferredTopics,
    refresh,
    removeInterest,
    savingTopic,
    toggleInterest,
    unblockBlockedTopic,
    addInterest,
  };
}
