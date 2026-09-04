/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — COMMENT SECTION (src/components/comments/CommentSection.tsx)
 * Interactive thread replies, comment likes & mAI discussion synthesis
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Heart, Mic, MicOff, Loader2, AlertCircle } from 'lucide-react';
import { Comment } from '../../types/vibe';
import { ApiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { FormattedText } from '../common/FormattedText';

interface CommentSectionProps {
  postId: string;
}

export const CommentSection: React.FC<CommentSectionProps> = ({ postId }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [aiDigest, setAiDigest] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const {
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    onResult: (text) => {
      setNewComment((prev) => (prev ? `${prev} ${text}` : text));
    },
  });

  const fetchComments = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await ApiService.getComments(postId);
      setComments(data.comments || []);
      setAiDigest(data.aiDigest || null);
      setLikedIds(new Set((data.comments || []).filter((c: any) => c.liked_by_me).map((c: any) => String(c.id))));
    } catch (err: any) {
      setComments([]);
      setAiDigest(null);
      setLoadError(err?.message || 'Impossible de charger les commentaires.');
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    if (isListening) {
      stopListening();
      resetTranscript();
    }

    setIsSubmitting(true);
    try {
      await ApiService.addComment(postId, newComment.trim(), replyingTo?.id);
      setNewComment('');
      setReplyingTo(null);
      fetchComments();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l’envoi de la réponse.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLikeComment = async (cm: Comment) => {
    if (!user) {
      // Bouton "mort" si déconnecté : on prévient au lieu d'un update optimiste
      // qui serait annulé par un 401.
      window.dispatchEvent(
        new CustomEvent('vibe:in_app_toast', {
          detail: {
            id: Date.now(),
            title: 'Connexion requise',
            message: 'Connectez-vous pour aimer un commentaire.',
          },
        })
      );
      return;
    }
    const id = String(cm.id);
    const wasLiked = likedIds.has(id);
    // Mise à jour optimiste
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(id);
      else next.add(id);
      return next;
    });
    setComments((prev) =>
      prev.map((c) =>
        String(c.id) === id
          ? { ...c, likes_count: Math.max(0, (c.likes_count || 0) + (wasLiked ? -1 : 1)) }
          : c
      )
    );
    try {
      const res = await ApiService.likeComment(postId, id);
      if (typeof res?.likes_count === 'number') {
        setComments((prev) =>
          prev.map((c) => (String(c.id) === id ? { ...c, likes_count: res.likes_count } : c))
        );
      }
    } catch {
      // Revenir en arrière en cas d'échec
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(id);
        else next.delete(id);
        return next;
      });
      setComments((prev) =>
        prev.map((c) =>
          String(c.id) === id
            ? { ...c, likes_count: Math.max(0, (c.likes_count || 0) + (wasLiked ? 1 : -1)) }
            : c
        )
      );
    }
  };

  const renderComment = (cm: Comment) => {
    const liked = likedIds.has(String(cm.id));
    return (
      <div
        key={String(cm.id)}
        className={`p-3.5 rounded-2xl bg-black border border-zinc-900 space-y-1.5 ${
          (cm.depth || 0) > 0 ? 'ml-4 sm:ml-6 border-l-2 border-zinc-700' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <ProfileAvatar
              src={cm.avatar_url}
              alt={cm.username}
              fallbackName={cm.username}
              size="xs"
              className="border border-zinc-800 shrink-0"
            />
            <span className="text-xs font-bold text-white truncate">{cm.display_name || cm.username}</span>
            <span className="text-[11px] text-zinc-500 truncate">@{cm.username}</span>
          </div>
          <button
            onClick={() => setReplyingTo(cm)}
            className="text-[11px] text-zinc-500 hover:text-white transition-colors shrink-0 ml-2"
          >
            Répondre
          </button>
        </div>
        <div className="text-xs text-zinc-200 pl-8 whitespace-pre-wrap break-words">
          <FormattedText text={cm.content} />
        </div>
        <div className="flex items-center gap-4 pl-8 pt-0.5">
          <button
            onClick={() => handleLikeComment(cm)}
            className={`flex items-center gap-1 text-[11px] transition-colors ${
              liked ? 'text-rose-500' : 'text-zinc-500 hover:text-rose-400'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-rose-500' : ''}`} />
            <span>{cm.likes_count || 0}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* mAI Thread Synthesis */}
      {aiDigest && (
        <div className="p-4 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-white tracking-wide uppercase font-mono">
            <Sparkles className="w-3.5 h-3.5 text-white" />
            <span>Synthèse mAI des échanges</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">{aiDigest}</p>
        </div>
      )}

      {/* Reply Input Form */}
      <form onSubmit={handleSubmit} className="p-4 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-3">
        {replyingTo && (
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>
              En réponse à <strong className="text-white">@{replyingTo.username}</strong>
            </span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-zinc-500 hover:text-white"
            >
              Annuler
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <ProfileAvatar
            src={user?.avatar_url}
            alt="Avatar"
            fallbackName={user?.username}
            size="sm"
            className="border border-zinc-800 shrink-0"
          />
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={isListening ? 'Parlez, dictée vocale en cours...' : 'Poster votre réponse...'}
              className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
            />
            <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
              {isSupported && (
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isListening ? 'bg-white text-black pulse-recording' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
              )}
              <button
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="py-1.5 px-4 rounded-full bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                {isSubmitting ? 'Envoi…' : 'Répondre'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Comments List */}
      <div className="space-y-2">
        {isLoading && (
          <div className="text-center py-6 text-xs text-zinc-400 flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            <span>Chargement des commentaires…</span>
          </div>
        )}

        {!isLoading && loadError && (
          <div className="text-center py-6 text-xs text-zinc-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span>{loadError}</span>
            <button
              onClick={fetchComments}
              className="py-1.5 px-4 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-semibold hover:bg-zinc-800"
            >
              Réessayer
            </button>
          </div>
        )}

        {!isLoading && !loadError && comments.map(renderComment)}

        {!isLoading && !loadError && comments.length === 0 && (
          <div className="text-center py-6 text-xs text-zinc-500 font-mono">
            Aucun commentaire pour le moment. Soyez le premier à répondre !
          </div>
        )}
      </div>
    </div>
  );
};
