export interface WatchHistoryRecord {
  id?: number | null;
  videoId: string;
  title: string;
  channelName?: string | null;
  channelId?: string | null;
  watchDate: string;
  watchDurationSeconds: number;
  totalDurationSeconds?: number | null;
  isMusic?: boolean;
}
