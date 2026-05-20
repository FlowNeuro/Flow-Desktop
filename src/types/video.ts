export interface VideoSummary {
  id: string;
  title: string;
  channelName: string;
  channelId?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  publishedText?: string | null;
  viewCountText?: string | null;
}

export interface VideoDetails {
  id: string;
  title: string;
  channelName: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
}

export interface StreamInfo {
  streamId: string;
  localUrl: string;
  expiresAt: string;
}

export interface SearchVideosRequest {
  query: string;
  pageToken?: string | null;
}

export interface SearchVideosResponse {
  items: VideoSummary[];
  nextPageToken?: string | null;
  source: string;
}

export interface ChannelDetails {
  id: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  subscriberCount?: number | null;
  subscriberCountText?: string | null;
  verified: boolean;
}

export interface ChannelVideosResponse {
  channelId: string;
  videos: VideoSummary[];
  nextPageToken?: string | null;
}

export interface PlaylistDetailsResponse {
  id: string;
  title: string;
  description?: string | null;
  channelName: string;
  videoCount?: number | null;
  videos: VideoSummary[];
  nextPageToken?: string | null;
}

export interface Comment {
  id: string;
  author: string;
  authorThumbnail?: string | null;
  text: string;
  publishedText?: string | null;
  likeCount?: number | null;
  replyCount?: number | null;
  continuationToken?: string | null;
}

export interface CommentsResponse {
  comments: Comment[];
  nextPageToken?: string | null;
}
