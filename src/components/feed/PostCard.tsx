/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — POST CARD (src/components/feed/PostCard.tsx)
 * Multi-Image Grid (up to 5), Video Player (up to 2) & Unlimited Content
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Heart,
  Repeat,
  MessageSquare,
  Bookmark,
  BookMarked,
  MoreHorizontal,
  Trash2,
  Sparkles,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Quote,
  Check,
  Pencil,
  CalendarClock,
  Volume2,
  Languages,
  Users,
  Lock,
  Loader2,
  BarChart2,
  Share2,
  Pin,
  PinOff,
  EyeOff,
  Ban,
  X
} from 'lucide-react';
import { Post } from '../../types/vibe';
import { ApiService, TRANSLATION_LANGUAGES } from '../../services/api';
import { RealtimeService } from '../../services/realtimeService';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { useAuth } from '../../context/AuthContext';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { NotificationService } from '../../services/notificationService';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { RichContent } from '../common/RichContent';
import { usePostViewTracking } from '../../hooks/usePostViewTracking';
import { formatCompactCount } from '../../algorithms';
import { haptics } from '../../services/haptics';
import { PostShareModal } from './PostShareModal';
import { BookPickerModal } from './BookPickerModal';

interface PostCardProps {
  post: Post;
  onPostDeleted?: (postId: string) => void;
  onOpenThread?: (post: Post) => void;
  onOpenExplain?: (post: Post) => void;
  onOpenProfile?: (username: string) => void;
  onRemoveFromBook?: (postId: string) => void;
}

const formatTimeAgo = (dateStr: string): string => {
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

export const PostCardBase: React.FC<PostCardProps> = ({
  post,
  onPostDeleted,
  onOpenThread,
  onOpenExplain,
  onOpenProfile,
  onRemoveFromBook,
}) => {
  const { user } = useAuth();
  const { playQueue } = useAudioPlayer();
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [isLiked, setIsLiked] = useState(post.has_liked || false);
  const [repostsCount, setRepostsCount] = useState(post.reposts_count || 0);
  const [isReposted, setIsReposted] = useState(post.has_reposted || false);
  const [isBookmarked, setIsBookmarked] = useState(post.has_bookmarked || false);
  const [repliesCount, setRepliesCount] = useState(post.replies_count || 0);
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);
  // Retour d'algorithme : « Cela m'intéresse » / « Cela ne m'intéresse pas »
  const [myFeedback, setMyFeedback] = useState<'more' | 'less' | null>(post.my_feedback || null);
  // Traduction DeepL (repli mAI côté serveur), affichée sous le texte d'origine
  const [translation, setTranslation] = useState<{ text: string; language: string; targetLanguage?: string; provider?: string } | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  // Épinglage sur le profil + modale de partage
  const [isPinned, setIsPinned] = useState(post.is_pinned || false);
  const [showShare, setShowShare] = useState(false);
  // Livre : « Vibe préférée » enregistrée dans un Livre (favoris durables)
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [isInABook, setIsInABook] = useState(Boolean((post as any).in_books > 0));

  // État du cœur flottant pour double-tap mobile
  const [heartFloatPos, setHeartFloatPos] = useState<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  // Temps réel (SSE) : compteurs like/repost/réponses poussés par le serveur
  useEffect(() => {
    return RealtimeService.on((type, payload) => {
      if (type !== 'post_stats' || !payload || String(payload.post_id) !== String(post.id)) return;
      if (payload.likes_count !== undefined) setLikesCount(Number(payload.likes_count) || 0);
      if (payload.reposts_count !== undefined) setRepostsCount(Number(payload.reposts_count) || 0);
      if (payload.replies_count !== undefined) setRepliesCount(Number(payload.replies_count) || 0);
    });
  }, [post.id]);

  // Resynchronise les compteurs quand le parent recharge le post (avec garde d'égalité)
  useEffect(() => {
    const targetLikes = post.likes_count || 0;
    const targetReposts = post.reposts_count || 0;
    const targetReplies = post.replies_count || 0;
    setLikesCount((prev) => (prev !== targetLikes ? targetLikes : prev));
    setRepostsCount((prev) => (prev !== targetReposts ? targetReposts : prev));
    setRepliesCount((prev) => (prev !== targetReplies ? targetReplies : prev));
  }, [post.id, post.likes_count, post.reposts_count, post.replies_count]);

  useEffect(() => {
    const targetPinned = post.is_pinned || false;
    setIsPinned((prev) => (prev !== targetPinned ? targetPinned : prev));
  }, [post.id, post.is_pinned]);

  const isAuthor = user && (user.id === post.author_id || user.username === post.username);

  // Compteur d'impressions : IntersectionObserver + dwell 1 s, une vue par
  // session et par post (fire-and-forget, cf. src/algorithms/viewTracking.ts)
  const { ref: viewRef, viewsCount } = usePostViewTracking(
    post.id,
    post.views_count,
    { enabled: post.status !== 'scheduled' }
  );

  /**
   * Affine l'algorithme : enregistre/retire un retour d'intérêt qui
   * influence le classement des futures Vibes (« Pour Vous »).
   */
  const applyFeedback = async (value: 'more' | 'less') => {
    const newValue = myFeedback === value ? null : value;
    setMyFeedback(newValue);
    try {
      await ApiService.sendPostFeedback(post.id, newValue);
      NotificationService.showInAppToast(
        newValue === 'more'
          ? "Cela m'intéresse"
          : newValue === 'less'
          ? "Cela ne m'intéresse pas"
          : 'Préférence retirée',
        newValue
          ? 'Vos Vibes futures seront affinées.'
          : "Ce post n'influence plus votre algorithme.",
        'info'
      );
    } catch {
      setMyFeedback(myFeedback);
    }
  };

  const handleQuote = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('vibe:open_composer', { detail: { quotedPost: post } }));
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    window.dispatchEvent(new CustomEvent('vibe:open_composer', { detail: { editPost: post } }));
  };

  const handleAskMAI = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('vibe:open_mai', { detail: { postId: post.id } }));
  };

  /** Traduction DeepL (repli mAI côté serveur) : langue cible = réglage ou navigateur. */
  const handleTranslate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTranslating || translation) return;
    setIsTranslating(true);
    try {
      const userLang = ApiService.resolveTargetLanguage();
      let res = await ApiService.translatePost(post.id, userLang);
      // Si la publication est déjà dans la langue cible (ex : post en français pour un utilisateur francophone),
      // on traduit vers l'anglais (ou vers le français si la cible initiale était l'anglais).
      if (res?.same_language) {
        const altLang = userLang.slice(0, 2).toUpperCase() === 'FR' ? 'EN-US' : 'FR';
        res = await ApiService.translatePost(post.id, altLang);
      }
      if (res?.translation && !res.same_language) {
        const rawLang = res.detected_language || '';
        const prettyLang = rawLang
          ? res.provider === 'deepl'
            ? TRANSLATION_LANGUAGES.find((l) => l.code === rawLang.toUpperCase())?.label || rawLang
            : rawLang
          : '';
        const targetLabel = res.target_lang
          ? TRANSLATION_LANGUAGES.find((l) => l.code === res.target_lang?.toUpperCase())?.label || res.target_lang
          : (userLang.slice(0, 2).toUpperCase() === 'FR' && rawLang.toUpperCase().startsWith('FR') ? 'Anglais' : undefined);
        setTranslation({
          text: res.translation,
          language: prettyLang,
          targetLanguage: targetLabel,
          provider: res.provider,
        });
      } else {
        NotificationService.showInAppToast('Traduction indisponible', "La traduction n'a pas pu être récupérée.", 'error');
      }
    } catch (err: any) {
      NotificationService.showInAppToast('Traduction impossible', err?.message || "La traduction n'a pas pu être récupérée.", 'error');
    } finally {
      setIsTranslating(false);
    }
  };

  /** Écoute la publication avec la voix mAI (mini-lecteur flottant). */
  const handleListen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    const snippet = (post.content || '').trim().slice(0, 48);
    playQueue([
      {
        id: post.id,
        title: `@${post.username}${snippet ? ` — ${snippet}${(post.content || '').length > 48 ? '…' : ''}` : ''}`,
        text: post.content || '',
      },
    ]);
  };

  const handleLike = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev) => (newLikedState ? prev + 1 : Math.max(0, prev - 1)));
    if (newLikedState) {
      setLikeBurst(true);
      setTimeout(() => setLikeBurst(false), 450);
      haptics.like();
    } else {
      haptics.unlike();
    }

    try {
      await ApiService.toggleLike(post.id);
    } catch {
      setIsLiked(!newLikedState);
      setLikesCount((prev) => (!newLikedState ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  /** Double tap mobile sur le post / média : déclenche un like et une animation de cœur */
  const handleTouchDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 320;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      let clientX = rect.left + rect.width / 2;
      let clientY = rect.top + rect.height / 2;
      if ('clientX' in e && typeof (e as any).clientX === 'number') {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      } else if ('touches' in e && e.touches[0]) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
      setHeartFloatPos({ x: clientX - rect.left, y: clientY - rect.top });
      setTimeout(() => setHeartFloatPos(null), 780);

      haptics.like();
      if (!isLiked) {
        setIsLiked(true);
        setLikesCount((prev) => prev + 1);
        setLikeBurst(true);
        setTimeout(() => setLikeBurst(false), 450);
        ApiService.toggleLike(post.id).catch(() => {
          setIsLiked(false);
          setLikesCount((prev) => Math.max(0, prev - 1));
        });
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const handleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newRepostState = !isReposted;
    setIsReposted(newRepostState);
    setRepostsCount((prev) => (newRepostState ? prev + 1 : Math.max(0, prev - 1)));
    haptics.medium();

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
    haptics.medium();
    try {
      await ApiService.toggleBookmark(post.id);
    } catch {
      setIsBookmarked(isBookmarked);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.warning();
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

  /** Épingle/désépingle la publication tout en haut du profil (max 3). */
  const handleTogglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    const next = !isPinned;
    try {
      const res = await ApiService.setPostPinned(post.id, next);
      setIsPinned(Boolean(res.pinned));
      NotificationService.showInAppToast(
        res.pinned ? 'Post épinglé' : 'Post désépinglé',
        res.pinned
          ? 'Il restera fixé tout en haut de votre profil.'
          : 'Il reprend sa place chronologique.',
        'info'
      );
      window.dispatchEvent(new CustomEvent('vibe:post_updated'));
    } catch (err: any) {
      if (err?.code === 'PIN_LIMIT') {
        NotificationService.showInAppToast(
          'Limite atteinte',
          'Vous ne pouvez épingler que 3 publications maximum.',
          'error'
        );
      } else {
        NotificationService.showInAppToast('Erreur', err?.message || "L'épinglage a échoué.", 'error');
      }
    }
  };

  /** Mute : les publications/notifications de l'auteur disparaissent, en silence. */
  const handleMuteAuthor = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    try {
      await ApiService.muteUser(post.username, true);
      NotificationService.showInAppToast(
        'Compte masqué',
        `Les publications de @${post.username} n'apparaîtront plus dans votre fil.`,
        'info'
      );
      window.dispatchEvent(new CustomEvent('vibe:feed_refresh'));
      onPostDeleted?.(post.id);
    } catch (err: any) {
      NotificationService.showInAppToast('Erreur', err?.message || 'Le masquage a échoué.', 'error');
    }
  };

  /** Block : coupe tout contact de manière visible (DM, follow, notifications). */
  const handleBlockAuthor = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (!window.confirm(`Bloquer @${post.username} ?\n\nCette action coupe tout contact de manière visible : messages, abonnement et notifications. @${post.username} ne pourra plus interagir avec vous.`)) return;
    try {
      await ApiService.blockUser(post.author_id);
      NotificationService.showInAppToast(
        'Compte bloqué',
        `@${post.username} ne pourra plus interagir avec vous.`,
        'info'
      );
      window.dispatchEvent(new CustomEvent('vibe:feed_refresh'));
      onPostDeleted?.(post.id);
    } catch (err: any) {
      NotificationService.showInAppToast('Erreur', err?.message || 'Le blocage a échoué.', 'error');
    }
  };

  const allMedia: Array<{ url: string; media_type?: string; alt_text?: string }> = post.media_assets && post.media_assets.length > 0
    ? post.media_assets
    : post.media_url
    ? [{ url: post.media_url, media_type: post.media_url.endsWith('.mp4') ? 'video' : 'image', alt_text: 'Média joint' }]
    : [];

  // Classification fiable : MIME "video/*" ou extension vidéo
  const isVideoMedia = (m: { url: string; media_type?: string }) =>
    String(m.media_type || '').startsWith('video') || /\.(mp4|webm|mov)(\?|$)/i.test(m.url);

  const images = allMedia.filter((m) => !isVideoMedia(m));
  const videos = allMedia.filter(isVideoMedia);

  const quotedPost = post.quoted_post;
  const quotedImage = quotedPost?.media_assets?.find((m) => !isVideoMedia(m));

  const isScheduled = post.status === 'scheduled';

  return (
    <article
      ref={viewRef}
      onClick={() => onOpenThread && onOpenThread(post)}
      onDoubleClick={handleTouchDoubleTap}
      className="p-4 border-b border-zinc-800/90 bg-black hover:bg-zinc-950/70 transition-colors cursor-pointer relative select-none overflow-hidden"
    >
      {/* Cœur animé flottant lors d'un double-tap mobile */}
      {heartFloatPos && (
        <div
          className="absolute z-30 pointer-events-none animate-heartFloat"
          style={{ left: `${heartFloatPos.x}px`, top: `${heartFloatPos.y}px` }}
        >
          <div className="p-3 rounded-full bg-black/70 backdrop-blur-md shadow-2xl border border-rose-500/40 flex items-center justify-center">
            <Heart className="w-10 h-10 fill-rose-500 text-rose-500 drop-shadow-[0_0_12px_rgba(244,63,94,0.7)]" />
          </div>
        </div>
      )}
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
          {/* Étiquette « Post épinglé » (fixé en haut du profil) */}
          {isPinned && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400" title="Ce post est épinglé sur le profil de son auteur">
              <Pin className="w-3 h-3" />
              Post épinglé
            </div>
          )}

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
              {isScheduled ? (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono">
                  <CalendarClock className="w-2.5 h-2.5" />
                  Planifiée{post.scheduled_at ? ` · ${new Date(post.scheduled_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              ) : (
                <span className="text-zinc-500 text-xs font-mono">{formatTimeAgo(post.published_at)}</span>
              )}

              {/* Visibilité de la publication (Public par défaut = rien d'affiché) */}
              {post.visibility === 'followers' && (
                <span className="inline-flex items-center text-zinc-500" title="Visible par les abonnés uniquement">
                  <Users className="w-3 h-3" />
                </span>
              )}
              {post.visibility === 'circle' && (
                <span className="inline-flex items-center text-zinc-500" title="Cercle Privé">
                  <Users className="w-3 h-3" />
                  <Lock className="-ml-0.5 w-2 h-2" />
                </span>
              )}
              {post.visibility === 'private' && (
                <span className="inline-flex items-center text-zinc-500" title="Visible par vous seul">
                  <Lock className="w-3 h-3" />
                </span>
              )}

              {post.created_via === 'mai_agent' && (
                <span className="ml-1 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono">
                  <Sparkles className="w-2.5 h-2.5" />
                  mAI Post
                </span>
              )}

              {post.ai_generated && post.created_via !== 'mai_agent' && (
                <span className="ml-1 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-500 font-semibold">
                  <Sparkles className="w-2.5 h-2.5" />
                  Créé avec l'IA
                </span>
              )}
            </div>

            {/* Options Menu & Actions */}
            <div className="flex items-center gap-1">
              {onRemoveFromBook && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromBook(post.id);
                  }}
                  className="p-1 rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Retirer du Livre"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  className="text-zinc-500 hover:text-white p-1 rounded-full hover:bg-zinc-900 transition-colors"
                  title="Options de la publication"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {showMenu && (
                  <div className="absolute right-0 top-6 z-20 w-48 vibe-menu rounded-2xl p-1.5 space-y-1">
                    {onRemoveFromBook && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          onRemoveFromBook(post.id);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                      >
                        <X className="w-3.5 h-3.5 text-red-400" />
                        <span>Retirer du Livre</span>
                      </button>
                    )}
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

                  {/* Partage : DM (par défaut), lien ou QR Code */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      setShowShare(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <Share2 className="w-3.5 h-3.5 text-white" />
                    <span>Partager</span>
                  </button>

                  {/* Affinement de l'algorithme (Vibes futures) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      applyFeedback('more');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-zinc-800 flex items-center gap-2 transition-colors ${
                      myFeedback === 'more' ? 'text-white font-bold' : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5 text-white" />
                    <span>Cela m'intéresse</span>
                    {myFeedback === 'more' && <Check className="w-3 h-3 ml-auto" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      applyFeedback('less');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-zinc-800 flex items-center gap-2 transition-colors ${
                      myFeedback === 'less' ? 'text-white font-bold' : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5 text-white" />
                    <span>Cela ne m'intéresse pas</span>
                    {myFeedback === 'less' && <Check className="w-3 h-3 ml-auto" />}
                  </button>

                  {/* Mentionner la publication à l'assistant mAI */}
                  <button
                    onClick={handleAskMAI}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                    <span>Demander à mAI</span>
                  </button>

                  {/* Écoute la publication avec la voix mAI */}
                  {post.content?.trim() && (
                    <button
                      onClick={handleListen}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-white" />
                      <span>Écouter avec mAI</span>
                    </button>
                  )}

                  {isAuthor && (
                    <button
                      onClick={handleEdit}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Pencil className="w-3.5 h-3.5 text-white" />
                      <span>Modifier</span>
                    </button>
                  )}

                  {/* Épinglage sur le profil (auteur uniquement, max 3) */}
                  {isAuthor && (
                    <button
                      onClick={handleTogglePin}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
                    >
                      {isPinned ? (
                        <>
                          <PinOff className="w-3.5 h-3.5 text-white" />
                          <span>Désépingler du profil</span>
                        </>
                      ) : (
                        <>
                          <Pin className="w-3.5 h-3.5 text-white" />
                          <span>Épingler sur votre profil</span>
                        </>
                      )}
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

                  {/* Modération (posts d'autrui) : masquage silencieux + blocage visible */}
                  {!isAuthor && user && (
                    <>
                      <button
                        onClick={handleMuteAuthor}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
                      >
                        <EyeOff className="w-3.5 h-3.5 text-white" />
                        <span>Masquer @{post.username}</span>
                      </button>
                      <button
                        onClick={handleBlockAuthor}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 flex items-center gap-2"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Bloquer @{post.username}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

          {/* Post Text (Unlimited, rendu riche sécurisé) */}
          <div className="text-zinc-100 text-sm sm:text-base leading-relaxed">
            <RichContent content={post.content} onOpenProfile={onOpenProfile} />
          </div>

          {/* Traduction DeepL (repli mAI) : affichée sous le texte d'origine */}
          {(translation || isTranslating) && (
            <div onClick={(e) => e.stopPropagation()} className="pt-1.5">
              {isTranslating ? (
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Traduction en cours…</span>
                </div>
              ) : (
                <div className="pl-2.5 border-l-2 border-zinc-700">
                  <div className="text-sm text-zinc-300 leading-relaxed break-words">
                    <RichContent content={translation!.text} />
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px]">
                    <span className="text-zinc-600">
                      {translation!.targetLanguage
                        ? `Traduit en ${translation!.targetLanguage} via mAI`
                        : translation!.language
                        ? `Traduit de l'« ${translation!.language} » via mAI`
                        : `Traduit via mAI`}
                    </span>
                    <button
                      onClick={() => setTranslation(null)}
                      className="text-zinc-500 hover:text-white transition-colors font-bold"
                    >
                      Afficher l'original
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bouton « Traduire » (langue cible = réglage utilisateur ou navigateur) */}
          {!translation && !isTranslating && post.content?.trim() && (
            <div onClick={(e) => e.stopPropagation()}>
              <button
                onClick={handleTranslate}
                className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-white transition-colors"
                title="Traduire dans votre langue (mAI)"
              >
                <Languages className="w-3.5 h-3.5" />
                <span>Traduire</span>
              </button>
            </div>
          )}

          {/* Publication citée (quote-post) : post original intégré, cliquable */}
          {quotedPost && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenThread) onOpenThread(quotedPost as unknown as Post);
              }}
              className="mt-1 rounded-2xl border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900/70 transition-colors p-3 cursor-pointer"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <ProfileAvatar
                  src={quotedPost.avatar_url}
                  alt={quotedPost.username}
                  size="xs"
                  fallbackName={quotedPost.username}
                />
                <span className="text-xs font-bold text-white truncate">
                  {quotedPost.display_name || quotedPost.username}
                </span>
                <VerifiedBadge isVerified={quotedPost.is_verified} size="sm" />
                <span className="text-xs text-zinc-500 truncate">@{quotedPost.username}</span>
                {quotedPost.published_at && (
                  <>
                    <span className="text-zinc-600 text-xs shrink-0">·</span>
                    <span className="text-xs text-zinc-500 font-mono shrink-0">
                      {formatTimeAgo(quotedPost.published_at)}
                    </span>
                  </>
                )}
              </div>
              <div className="text-sm text-zinc-300 mt-1.5 line-clamp-4 break-words">
                <RichContent content={quotedPost.content} />
              </div>
              {quotedImage && (
                <img
                  src={quotedImage.url}
                  alt={quotedImage.alt_text || 'Média cité'}
                  loading="lazy"
                  decoding="async"
                  className="mt-2 rounded-xl border border-zinc-800 max-h-44 w-full object-cover"
                />
              )}
            </div>
          )}

          {/* Multi-Image Grid Gallery (Up to 5 images) avec légendes */}
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
              {/* Légendes des images */}
              {images.some((img) => img.alt_text?.trim()) && (
                <div className="mt-1.5 space-y-0.5">
                  {images
                    .filter((img) => img.alt_text?.trim())
                    .map((img, i) => (
                      <p key={`cap-${i}`} className="text-xs text-zinc-500 leading-snug break-words">
                        {img.alt_text}
                      </p>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Video Players (Up to 2 videos) avec légendes */}
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
                  {vid.alt_text?.trim() && (
                    <p className="px-3 py-2 text-xs text-zinc-500 leading-snug break-words border-t border-zinc-900">
                      {vid.alt_text}
                    </p>
                  )}
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
              <span>{repliesCount}</span>
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

            {/* Citer (quote-post : nouvelle publication avec l'original intégré) */}
            <button
              onClick={handleQuote}
              className="flex items-center gap-1.5 hover:text-white transition-colors group"
              title="Citer cette publication dans un nouveau post"
            >
              <div className="p-1.5 rounded-full group-hover:bg-zinc-900 transition-colors">
                <Quote className="w-4 h-4" />
              </div>
            </button>

            {/* Impressions / Vues (non cliquable, à la X) */}
            <span
              className="flex items-center gap-1.5"
              title={`${Number(viewsCount) || 0} vues`}
            >
              <div className="p-1.5 rounded-full">
                <BarChart2 className="w-4 h-4" />
              </div>
              <span>{formatCompactCount(viewsCount)}</span>
            </span>

            {/* Like */}
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 transition-all group active:scale-90 ${
                isLiked ? 'text-rose-500 font-bold' : 'hover:text-rose-400'
              }`}
              title={isLiked ? 'Ne plus aimer' : "J'aime"}
            >
              <div className={`p-1.5 rounded-full group-hover:bg-rose-500/10 transition-colors ${likeBurst ? 'animate-likeBurst' : ''}`}>
                <Heart className={`w-4 h-4 transition-transform ${isLiked ? 'fill-rose-500 text-rose-500 scale-110' : 'group-hover:scale-110'}`} />
              </div>
              <span className={isLiked ? 'text-rose-500' : ''}>{likesCount}</span>
            </button>

            {/* Livre : enregistrer la Vibe dans un Livre (Vibe préférées) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                haptics.light();
                setShowBookPicker(true);
              }}
              className={`flex items-center gap-1.5 transition-all active:scale-90 group ${
                isInABook ? 'text-sky-300 font-bold' : 'hover:text-white'
              }`}
              title={isInABook ? 'Enregistrée dans un Livre — gérer' : 'Enregistrer dans un Livre (Vibe préférées)'}
            >
              <div className={`p-1.5 rounded-full group-hover:bg-zinc-900 transition-colors ${isInABook ? 'bg-sky-500/10' : ''}`}>
                <BookMarked className={`w-4 h-4 ${isInABook ? 'fill-sky-400/30 text-sky-300' : ''}`} />
              </div>
            </button>

            {/* Bookmark */}
            <button
              onClick={handleBookmark}
              className={`flex items-center gap-1.5 transition-all active:scale-90 group ${
                isBookmarked ? 'text-amber-400 font-bold' : 'hover:text-white'
              }`}
              title={isBookmarked ? 'Retirer des signets' : 'Enregistrer dans les signets'}
            >
              <div className={`p-1.5 rounded-full group-hover:bg-amber-400/10 transition-colors`}>
                <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
              </div>
            </button>

            {/* Partager (ouvre la modale DM / lien / QR Code) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowShare(true);
              }}
              className="flex items-center gap-1.5 hover:text-white transition-colors group"
              title="Partager"
            >
              <div className="p-1.5 rounded-full group-hover:bg-zinc-900 transition-colors">
                <Share2 className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Modale de partage : Message privé (défaut), Lien, QR Code */}
      {showShare && (
        <PostShareModal post={post} onClose={() => setShowShare(false)} />
      )}

      {/* Modale « Enregistrer dans un Livre » (Vibe préférées) */}
      {showBookPicker && user && (
        <BookPickerModal
          postId={post.id}
          onClose={() => setShowBookPicker(false)}
          onSavedBooksChange={(ids) => setIsInABook(ids.length > 0)}
        />
      )}
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
    prev.onPostDeleted === next.onPostDeleted &&
    prev.onRemoveFromBook === next.onRemoveFromBook
);
