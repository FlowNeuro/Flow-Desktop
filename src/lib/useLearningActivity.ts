import { useEffect, useState } from "react";

import {
  getRecommendationEvents,
  type RecommendationEvent,
} from "./api/recommendation";

export function useLearningActivity(limit = 40) {
  const [events, setEvents] = useState<RecommendationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getRecommendationEvents(limit)
      .then((rows) => {
        if (active) setEvents(rows);
      })
      .catch((e) => console.warn("Failed to load learning activity", e))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [limit]);

  return { events, loading };
}
