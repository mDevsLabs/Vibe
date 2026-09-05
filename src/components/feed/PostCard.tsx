/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — POST CARD (src/components/feed/PostCard.tsx)
 * Multi-Image Grid (up to 5), Video Player (up to 2) & Unlimited Content
 * ============================================================================
 */

import React, { useState } from 'react';
import {
  Heart,
  Repeat,
  MessageSquare,
  Bookmark,
  MoreHorizontal,
  Trash2,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { Post } from '../../types/vibe';
import { ApiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { NotificationService } from '../../services/notificationService';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { FormattedText } from '../common/FormattedText';

interface PostCardProps {
  post: Post;
  onPostDeleted?: (postId: string) => void;
  onOpenThread?: (post: Post) => void;
  onOpenExplain?: (post: Post) => void;
  onOpenProfile?: (username: string) => void;
}

export const PostCardBase: React.FC<PostCardProps> = ({
  post,
  onPostDeleted,
  onOpenThread,
  onOpenExplain,
  onOpenProfile,
}) => {
  const { user } = useAuth();
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [isLiked, setIsLiked] = useState(post.has_liked || false);
  const [repostsCount, setRepostsCount] = useState(post.reposts_count || 0);
  const [isReposted, setIsReposted] = useState(post.has_reposted || false);
  const [isBookmarked, setIsBookmarked] = useState(post.has_bookmarked || false);
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);

  const isAuthor = user && (user.id === post.author_id || user.username === post.username);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev) => (newLikedState ? prev + 1 : Math.max(0, prev - 1)));
    if (newLikedState) {
      setLikeBurst(true);
      setTimeout(() => setLikeBurst(false), 450);
      navigator.vibrate?.(10);
    }

    try {
      await ApiService.toggleLike(post.id);
    } catch {
      setIsLiked(!newLikedState);
      setLikesCount((prev) => (!newLikedState ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  const handleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newRepostState = !isReposted;
    setIsReposted(newRepostState);
    setRepostsCount((prev) => (newRepostState ? prev + 1 : Math.max(0, prev - 1)));

    try {
      await ApiService.toggleRepost(post.id);
    } catch {
      setIsReposted(!newRepostState);
      setRepostsCount((prev) => (!newRepostState ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  const handleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBookmarked(!isBookmarked);
    try {
      await ApiService.toggleBookmark(post.id);
    } catch {
      setIsBookmarked(isBookmarked);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Voulez-vous vraiment supprimer cette publication ?')) return;
    setIsDeleting(true);
    try {
      await ApiService.deletePost(post.id);
      NotificationService.notifyPostDeleted();
      window.dispatchEvent(new CustomEvent('vibe:post_updated'));
      if (onPostDeleted) {
        onPostDeleted(post.id);
      }
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la suppression.');
    } finally {
      setIsDeleting(false);
      setShowMenu(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "À l'instant";
      if (mins < 60) return `${mins}m`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h`;
      const days = Math.floor(hours / 24);
      return `${days}j`;
    } catch {
      return '';
    }
  };

  const allMedia: Array<{ url: string; media_type?: string; alt_text?: string }> = post.media_assets && post.media_assets.length > 0
    ? post.media_assets
    : post.media_url
    ? [{ url: post.media_url, media_type: post.media_url.endsWith('.mp4') ? 'video' : 'image', alt_text: 'Média joint' }]
    : [];

  const images = allMedia.filter((m) => m.media_type !== 'video' && !m.url?.endsWith('.mp4'));
  const videos = allMedia.filter((m) => m.media_type === 'video' || m.url?.endsWith('.mp4'));

  return (
    <article
      onClick={() => onOpenThread && onOpenThread(post)}
      className="p-4 border-b border-zinc-800/90 bg-black hover:bg-zinc-950/70 transition-colors cursor-pointer relative select-none"
    >
      <div className="flex gap-3">
        {/* Avatar */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenProfile) onOpenProfile(post.username);
          }}
          className="shrink-0"
        >
          <ProfileAvatar
            src={post.avatar_url}
            alt={post.username}
            size="md"
            fallbackName={post.username}
            className="border border-zinc-800 hover:opacity-90 transition-opacity"
          />
        </div>

        {/* Content Container */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Post Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenProfile) onOpenProfile(post.username);
                }}
                className="font-bold text-sm text-white hover:underline truncate"
              >
                {post.display_name || post.username}
              </span>
              <VerifiedBadge isVerified={post.is_verified || (post as any).isVerified} tier={(post as any).tier} size="sm" />
              <span className="text-zinc-500 text-xs">@{post.username}</span>
              <span className="text-zinc-600 text-xs">·</span>
              <span className="text-zinc-500 text-xs font-mono">{timeAgo(post.published_at)}</span>

              {post.created_via === 'mai_agent' && (
                <span className="ml-1 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono">
                  <Sparkles className="w-2.5 h-2.5" />
                  mAI Post
                </span>
              )}
            </div>

            {/* Options Menu */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="text-zinc-500 hover:text-white p-1 rounded-full hover:bg-zinc-900 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-6 z-20 w-44 bg-zinc-900 border border-zinc-700 rounded-2xl p-1.5 shadow-2xl space-y-1">
                  {onOpenExplain && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onOpenExplain(post);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-white" />
                      <span>Pourquoi ce post ?</span>
                    </button>
                  )}

                  {isAuthor && (
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                      <span>Supprimer</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Post Text (Unlimited) */}
          <div className="text-zinc-100 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
            <FormattedText text={post.content} onOpenProfile={onOpenProfile} />
          </div>

          {/* Multi-Image Grid Gallery (Up to 5 images) */}
          {images.length > 0 && (
            <div className="pt-2">
              <div
                className={`grid gap-1.5 rounded-2xl overflow-hidden border border-zinc-800 ${
                  images.length === 1
                    ? 'grid-cols-1 max-h-[480px]'
                    : images.length === 2
                    ? 'grid-cols-2 aspect-[16/9]'
                    : images.length === 3
                    ? 'grid-cols-2 aspect-[16/9]'
                    : images.length === 4
                    ? 'grid-cols-2 aspect-square'
                    : 'grid-cols-3 aspect-[16/9]'
                }`}
              >
                {images.map((img, i) => (
                  <div
                    key={i}
                    className={`relative overflow-hidden bg-zinc-950 ${
                      images.length === 3 && i === 0 ? 'row-span-2' : ''
                    } ${images.length === 5 && i < 2 ? 'col-span-1 sm:col-span-1' : ''}`}
                  >
                    <img
                      src={img.url}
                      alt={img.alt_text || `Média ${i + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300 animate-mediaIn"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Video Players (Up to 2 videos) */}
          {videos.length > 0 && (
            <div className="pt-2 space-y-2">
              {videos.map((vid, idx) => (
                <div key={idx} className="rounded-2xl overflow-hidden border border-zinc-800 bg-black max-h-96">
                  <video
                    src={vid.url}
                    controls
                    preload="metadata"
                    className="w-full max-h-96 object-cover"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Engagement Footer Actions */}
          <div className="flex items-center justify-between pt-3 text-zinc-500 max-w-md text-xs">
            {/* Replies */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenThread) onOpenThread(post);
              }}
              className="flex items-center gap-1.5 hover:text-white transition-colors group"
            >
              <div className="p-1.5 rounded-full group-hover:bg-zinc-900 transition-colors">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span>{post.replies_count || 0}</span>
            </button>

            {/* Repost */}
            <button
              onClick={handleRepost}
              className={`flex items-center gap-1.5 transition-colors group ${
                isReposted ? 'text-white font-bold' : 'hover:text-white'
              }`}
            >
              <div className="p-1.5 rounded-full group-hover:bg-zinc-900 transition-colors">
                <Repeat className="w-4 h-4" />
              </div>
              <span>{repostsCount}</span>
            </button>

            {/* Like */}
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 transition-colors group ${
                isLiked ? 'text-white font-bold' : 'hover:text-white'
              }`}
            >
              <div className={`p-1.5 rounded-full group-hover:bg-zinc-900 transition-colors ${likeBurst ? 'animate-likeBurst' : ''}`}>
                <Heart className={`w-4 h-4 ${isLiked ? 'fill-white text-white' : ''}`} />
              </div>
              <span>{likesCount}</span>
            </button>

            {/* Bookmark */}
            <button
              onClick={handleBookmark}
              className={`flex items-center gap-1.5 transition-colors group ${
                isBookmarked ? 'text-white font-bold' : 'hover:text-white'
              }`}
            >
              <div className="p-1.5 rounded-full group-hover:bg-zinc-900 transition-colors">
                <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-white text-white' : ''}`} />
              </div>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

/**
 * Mémoïsation : la carte ne re-render que si ses données ou ses callbacks
 * changent — critique pour garder le scroll infini fluide.
 */
export const PostCard = React.memo(
  PostCardBase,
  (prev, next) =>
    prev.post === next.post &&
    prev.onOpenThread === next.onOpenThread &&
    prev.onOpenProfile === next.onOpenProfile &&
    prev.onOpenExplain === next.onOpenExplain &&
    prev.onPostDeleted === next.onPostDeleted
);
