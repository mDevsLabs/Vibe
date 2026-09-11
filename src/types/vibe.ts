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
  /** Statuts sociaux renvoyés par GET /profiles/:username pour le visiteur. */
  isFollowing?: boolean;
  blocked_by_me?: boolean;
  blocked_me?: boolean;
  muted_by_me?: boolean;
}

/** Compte masqué (mute) via GET /users/muted. */
export interface MutedUser {
  id: string;
  muted_user_id: string;
  muted_username: string;
  muted_display_name?: string;
  muted_avatar_url?: string;
  created_at: string;
}

export interface MediaAsset {
  id?: string;
  url: string;
  media_type?: string;
  alt_text?: string;
}

/** Publication citée intégrée à un post (données simplifiées). */
export interface QuotedPost {
  id: string;
  author_id?: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  content: string;
  format?: Post['format'];
  likes_count?: number;
  replies_count?: number;
  published_at?: string;
  created_via?: Post['created_via'];
  ai_generated?: boolean;
  media_assets?: MediaAsset[];
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
  /** Audience : public, abonnés uniquement, cercle privé, ou privé (soi seul). */
  visibility: 'public' | 'followers' | 'circle' | 'private';
  likes_count: number;
  reposts_count: number;
  replies_count: number;
  bookmarks_count: number;
  views_count?: number;
  /** Post épinglé tout en haut du profil de son auteur (max 3). */
  is_pinned?: boolean;
  toxicity_score?: number;
  sentiment_score?: number;
  created_via?: 'web' | 'mai_agent' | 'api';
  /** Badge « Créé avec l'IA » déclaré par l'auteur (ou défaut de ses réglages). */
  ai_generated?: boolean;
  /** Post original cité (quote-post), s'il y en a un. */
  quoted_post_id?: string | null;
  quoted_post?: QuotedPost | null;
  /** Retour d'algorithme de l'utilisateur courant sur ce post. */
  my_feedback?: 'more' | 'less' | null;
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
    interestFactor?: number;
  };
  media_url?: string;
  media_assets?: MediaAsset[];
  /** Planification : 'scheduled' tant que la date de publication n'est pas atteinte. */
  status?: 'published' | 'scheduled';
  scheduled_at?: string | null;
  updated_at?: string;
  /** Sondage intégré (2-4 options, vote unique modifiable). */
  poll?: Poll | null;
  /** Co-auteurs invités/acceptés (co-signature). */
  collaborators?: PostCollaborator[];
}

/** Option d'un sondage de post. */
export interface PollOption {
  id: string;
  label: string;
  votes_count: number;
  position: number;
}

/** Sondage intégré à un post. */
export interface Poll {
  id: string;
  post_id: string;
  question: string;
  ends_at: string;
  total_votes: number;
  created_at?: string;
  options: PollOption[];
  /** Option votée par l'utilisateur courant (null si aucun vote). */
  my_vote?: string | null;
  expired?: boolean;
}

/** Co-auteur d'un post collaboratif. */
export interface PostCollaborator {
  username: string;
  display_name?: string;
  avatar_url?: string;
  status: string;
}

/** Résultat de recherche globale unifiée. */
export interface UnifiedSearchResult {
  posts: Post[];
  users: Array<{
    id: number | string;
    username: string;
    display_name?: string;
    avatar_url?: string;
    is_verified?: boolean;
    followers_count?: number;
    bio?: string;
  }>;
  books: VibeBook[];
  messages: DirectMessage[];
  total: number;
}

/** Brouillon de post synchronisé serveur (multi-appareils). */
export interface ServerDraft {
  id: string;
  user_id?: string | number;
  html: string;
  text: string;
  visibility?: string;
  scheduled_at?: string | null;
  ai_generated?: boolean;
  media_assets?: Array<{ url: string; media_type?: string; size?: number; alt_text?: string }>;
  updated_at?: string;
  created_at?: string;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  content: string;
  parent_comment_id?: string;
  depth: number;
  likes_count: number;
  created_at: string;
  /** Médias joints au commentaire (max 3 images / 1 vidéo). */
  media_assets?: MediaAsset[];
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username?: string;
  recipient_id: string;
  content: string;
  is_read: boolean;
  read_at?: string | null;
  is_edited?: boolean;
  edited_at?: string | null;
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_username?: string | null;
  reactions?: Array<{ emoji: string; count: number; mine: boolean }>;
  created_at: string;
  /** Message épinglé dans la conversation (bannière). */
  is_pinned?: boolean;
  /** Envoi programmé : 'scheduled' jusqu'à send_at, sinon 'sent'. */
  status?: 'scheduled' | 'sent';
  send_at?: string | null;
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
  /** Nom personnalisé donné à la conversation (par le compte courant) */
  custom_name?: string | null;
  /** Partenaire bloqué par le compte courant */
  is_blocked?: boolean;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id?: string;
  actor_username?: string;
  actor_avatar_url?: string;
  type: 'like' | 'repost' | 'reply' | 'follow' | 'mention' | 'dm' | 'mai_system' | 'reaction' | 'quote' | 'post';
  post_id?: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

/** Livre de « Vibe préférées » — collection de posts en favoris (max 5 par compte). */
export interface VibeBook {
  id: string;
  title: string;
  /** Nom de l'icône lucide-react choisie parmi le picker. */
  icon: string;
  created_at?: string;
  items_count?: number;
  /** true si le post passé en query est déjà dans ce Livre. */
  contains_post?: boolean;
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
  mai_auto_approve_tools?: boolean;
  /** Les nouvelles publications sont-elles marquées « créées avec l'IA » par défaut ? */
  posts_ai_generated_by_default?: boolean;
  /** Modèle mAI par défaut pour toutes les requêtes mAI (assistant, outils composer, traduction). */
  mai_default_model?: string;
  /** Voix de lecture mAI (mini-lecteur audio flottant, cf. GET /v1/speech/voices). */
  mai_tts_voice?: string;
  /** Langue cible de traduction (code DeepL : FR, EN-US…) ; vide/null = langue du navigateur. */
  ui_language?: string;
  accent_color?: string;
  font_size?: 'small' | 'medium' | 'large';
  message_bubble_theme?: string;
  chat_background_theme?: string;
  message_bubble_shape?: string;
  /** Audience par défaut lors de la création d'une Vibe ('public', 'followers', 'circle') */
  default_vibe_audience?: 'public' | 'followers' | 'circle';
  /** Thème programmé (JSON sérialisé {enabled, darkStart, darkEnd}). */
  scheduled_theme?: string | null;
  /** Onboarding guidé terminé. */
  onboarding_completed?: boolean;
  /** Contexte mAI opt-in : publications / DMs / livres. */
  mai_context_posts?: boolean;
  mai_context_dms?: boolean;
  mai_context_books?: boolean;
}
