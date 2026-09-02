/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — COMMENT SECTION (src/components/comments/CommentSection.tsx)
 * Interactive thread replies & mAI discussion synthesis
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Send, MessageSquare, Heart, Mic, MicOff } from 'lucide-react';
import { Comment } from '../../types/vibe';
import { ApiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    onResult: (text) => {
      setNewComment((prev) => (prev ? `${prev} ${text}` : text));
    },
  });

  const fetchComments = async () => {
    setIsLoading(true);
    try {
      const data = await ApiService.getComments(postId);
      setComments(data.comments || []);
      setAiDigest(data.aiDigest || null);
    } catch {
      // Fallback comments
      setComments([
        {
          id: 'c1',
          post_id: postId,
          author_id: 'u1',
          username: 'sophie_ux',
          display_name: 'Sophie',
          avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
          content: 'Le design monochrome est extrêmement propre et moderne !',
          depth: 0,
          likes_count: 4,
          created_at: new Date().toISOString(),
        },
      ]);
      setAiDigest('Synthèse mAI : Retours très positifs sur l’ergonomie et la rapidité du flux.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [postId]);

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
            <span>En réponse à <strong className="text-white">@{replyingTo.username}</strong></span>
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
          <img
            src={user?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80'}
            alt="Avatar"
            className="w-8 h-8 rounded-full object-cover border border-zinc-800 shrink-0"
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
                className="py-1.5 px-4 rounded-full bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40"
              >
                Répondre
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Comments List */}
      <div className="space-y-2">
        {comments.map((cm) => (
          <div
            key={cm.id}
            className={`p-3.5 rounded-2xl bg-black border border-zinc-900 space-y-1.5 ${
              cm.depth > 0 ? 'ml-6 border-l-2 border-zinc-700' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img
                  src={cm.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80'}
                  alt={cm.username}
                  className="w-6 h-6 rounded-full object-cover border border-zinc-800"
                />
                <span className="text-xs font-bold text-white">{cm.display_name || cm.username}</span>
                <span className="text-[11px] text-zinc-500">@{cm.username}</span>
              </div>
              <button
                onClick={() => setReplyingTo(cm)}
                className="text-[11px] text-zinc-500 hover:text-white transition-colors"
              >
                Répondre
              </button>
            </div>
            <p className="text-xs text-zinc-200 pl-8">{cm.content}</p>
          </div>
        ))}

        {comments.length === 0 && !isLoading && (
          <div className="text-center py-6 text-xs text-zinc-500 font-mono">
            Aucun commentaire pour le moment. Soyez le premier à répondre !
          </div>
        )}
      </div>
    </div>
  );
};
