export type VerificationTier = 'creator' | 'business' | 'verified_human' | 'official' | null;

export interface User {
  id: string;
  username: string;
  email: string;
  tier: 'Free' | 'Plus' | 'Pro' | 'Max';
  phone?: string;
  avatar_url?: string;
  is_verified?: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  bannerUrl?: string;
  website?: string;
  location?: string;
  interests: string[];
  followersCount: number;
  followingCount: number;
  postsCount: number;
  reputationScore?: number;
  is_verified?: boolean;
  isVerified?: boolean;
  verificationTier?: VerificationTier;
  showcaseLayout?: 'stream' | 'grid';
  topicModel?: string[];
}

export interface MediaAsset {
  id?: string;
  url: string;
  media_type?: string;
  alt_text?: string;
}

export interface Post {
  id: string;
  author_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  verification_tier?: VerificationTier;
  content: string;
  format: 'micro_text' | 'article' | 'media' | 'mai_generation';
  visibility: 'public' | 'followers' | 'private';
  likes_count: number;
  reposts_count: number;
  replies_count: number;
  bookmarks_count: number;
  views_count?: number;
  toxicity_score?: number;
  sentiment_score?: number;
  created_via?: 'web' | 'mai_agent' | 'api';
  published_at: string;
  has_liked?: boolean;
  has_reposted?: boolean;
  has_bookmarked?: boolean;
  recommendationScore?: number;
  explanation?: string;
  scoreBreakdown?: {
    freshnessScore: number;
    engagementScore: number;
    velocityScore: number;
    semanticScore: number;
    graphProximityScore: number;
    safetyFactor: number;
  };
  media_url?: string;
  media_assets?: MediaAsset[];
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  content: string;
  parent_comment_id?: string;
  depth: number;
  likes_count: number;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username?: string;
  recipient_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface DMConversation {
  id: string;
  partner_id: string;
  partner_username: string;
  partner_display_name?: string;
  partner_avatar_url?: string;
  last_message_preview?: string;
  last_message_content?: string;
  last_message_at: string;
  unread_count?: number;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id?: string;
  actor_username?: string;
  actor_avatar_url?: string;
  type: 'like' | 'repost' | 'reply' | 'follow' | 'mention' | 'dm' | 'mai_system';
  post_id?: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface MAIQuotas {
  tier: 'Free' | 'Plus' | 'Pro' | 'Max';
  weeklyTokens: {
    used: number;
    limit: number;
    percent: number;
  };
  dailyImages: {
    used: number;
    limit: number;
    percent: number;
  };
  resetAt: string;
}

export interface UserSettings {
  email_notifications: boolean;
  push_notifications: boolean;
  notify_on_like: boolean;
  notify_on_repost: boolean;
  notify_on_reply: boolean;
  notify_on_dm: boolean;
  content_filter_level: 'low' | 'medium' | 'strict';
  blur_sensitive_content: boolean;
  allow_dms?: 'everyone' | 'following' | 'nobody';
  allow_dms_from?: 'everyone' | 'following' | 'nobody';
  dms_enabled?: boolean;
  allow_mentions?: 'everyone' | 'following' | 'nobody';
  feed_default_mode?: 'for_you' | 'stream' | 'trending';
  hide_reposts?: boolean;
  blocked_keywords?: string[] | string;
  two_factor_auth?: boolean;
  age_restriction_enabled: boolean;
  theme_preference: string;
}
