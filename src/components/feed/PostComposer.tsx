/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — POST COMPOSER (src/components/feed/PostComposer.tsx)
 * Multi-Media (Photos & Vidéos unifiées), Unlimited Text & Speech
 * ============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Image as ImageIcon,
  Mic,
  MicOff,
  Send,
  X,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiService } from '../../services/api';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { NotificationService } from '../../services/notificationService';
import { ProfileAvatar } from '../common/ProfileAvatar';
import type { Post } from '../../types/vibe';

interface PostComposerProps {
  onPostCreated: () => void;
  placeholder?: string;
  isModal?: boolean;
  onClose?: () => void;
  initialContent?: string;
  initialMediaUrl?: string;
  /** Post original cité (quote-post) prérempli (bouton « Citer »). */
  initialQuotedPost?: Post | null;
}

interface UploadedMedia {
  url: string;
  media_type: 'image' | 'video';
  file_name?: string;
  size?: number;
}

export const PostComposer: React.FC<PostComposerProps> = ({
  onPostCreated,
  placeholder = "Quoi de neuf sur Vibe ?",
  isModal = false,
  onClose,
  initialContent,
  initialMediaUrl,
  initialQuotedPost,
}) => {
  const { user, profile } = useAuth();
  const [content, setContent] = useState(initialContent || '');
  const [mediaList, setMediaList] = useState<UploadedMedia[]>(
    initialMediaUrl ? [{ url: initialMediaUrl, media_type: 'image' }] : []
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Badge « Créé avec l'IA » : défaut issu des réglages utilisateur
  const [isAIGenerated, setIsAIGenerated] = useState(false);
  const [quotedPost, setQuotedPost] = useState<Post | null>(initialQuotedPost || null);

  useEffect(() => {
    ApiService.getSettings()
      .then((res: any) => {
        setIsAIGenerated(Boolean(res?.settings?.posts_ai_generated_by_default));
      })
      .catch(() => {});
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    NotificationService.requestPermission().catch(() => {});
  }, []);

  const {
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    onResult: (text) => {
      setContent((prev) => (prev ? `${prev} ${text}` : text));
    },
  });

  const imagesCount = mediaList.filter((m) => m.media_type === 'image').length;
  const videosCount = mediaList.filter((m) => m.media_type === 'video').length;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate limits: max 5 images, max 2 videos, and max 50 MB total
    const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB
    const currentTotalBytes = mediaList.reduce((acc, m) => acc + (m.size || 0), 0);
    const newFilesBytes = files.reduce((acc, f) => acc + f.size, 0);

    if (currentTotalBytes + newFilesBytes > MAX_TOTAL_BYTES) {
      setError(`La taille totale des médias ne peut pas dépasser 50 Mo par publication (sélection actuelle : ${((currentTotalBytes + newFilesBytes) / (1024 * 1024)).toFixed(1)} Mo).`);
      return;
    }

    let newImages = 0;
    let newVideos = 0;
    for (const f of files) {
      if (f.type.startsWith('image/')) newImages++;
      else if (f.type.startsWith('video/')) newVideos++;
    }

    if (imagesCount + newImages > 5) {
      setError(`Limite de 5 images par publication atteinte (actuel: ${imagesCount}).`);
      return;
    }
    if (videosCount + newVideos > 2) {
      setError(`Limite de 2 vidéos par publication atteinte (actuel: ${videosCount}).`);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      for (const file of files) {
        if (file.size > MAX_TOTAL_BYTES) {
          throw new Error(`Le fichier ${file.name} dépasse la taille maximale autorisée de 50 Mo.`);
        }
        const res = await ApiService.uploadFile(file);
        if (res.url) {
          const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
          setMediaList((prev) => [...prev, { url: res.url, media_type: type, file_name: file.name, size: file.size }]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors du téléversement du média.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveMedia = (index: number) => {
    setMediaList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && mediaList.length === 0) || isSubmitting) return;

    if (isListening) {
      stopListening();
      resetTranscript();
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const primaryMedia = mediaList[0]?.url;
      const mediaAssets = mediaList.map((m) => ({
        url: m.url,
        media_type: m.media_type === 'video' ? 'video/mp4' : 'image/jpeg',
      }));

      const res = await ApiService.createPost(content.trim(), primaryMedia, mediaAssets, {
        aiGenerated: isAIGenerated,
        quotedPostId: quotedPost?.id,
      });
      NotificationService.notifyPostPublished(content.trim());
      window.dispatchEvent(new CustomEvent('vibe:post_updated'));
      // Insertion optimiste : le fil affiche le post immédiatement, sans recharger
      if (res?.post) {
        window.dispatchEvent(new CustomEvent('vibe:feed_refresh', { detail: { post: res.post } }));
      }
      setContent('');
      setMediaList([]);
      setQuotedPost(null);
      onPostCreated();
      if (isModal && onClose) {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la publication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const avatarSrc = profile?.avatarUrl || user?.avatar_url || null;

  return (
    <div className={`p-4 border-b border-zinc-800 bg-black ${isModal ? 'border-none p-4' : ''} select-none relative`}>
      {error && (
        <div className="mb-3 p-3 rounded-2xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-white shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-3">
        <ProfileAvatar
          src={avatarSrc}
          alt="Avatar"
          fallbackName={user?.username}
          size="md"
          className="border border-zinc-800 shrink-0"
        />

        <div className="flex-1 space-y-3 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextChange}
            placeholder={placeholder}
            rows={3}
            className="w-full bg-transparent border-none text-white text-sm sm:text-base placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
          />

          {/* Publication citée (quote-post) */}
          {quotedPost && (
            <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950 p-3 flex items-start gap-2.5">
              <ProfileAvatar
                src={quotedPost.avatar_url}
                alt={quotedPost.username}
                size="sm"
                fallbackName={quotedPost.username}
                className="border border-zinc-800 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {quotedPost.display_name || quotedPost.username}{' '}
                  <span className="text-zinc-500 font-normal">@{quotedPost.username}</span>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-3 mt-0.5 leading-relaxed">
                  {quotedPost.content}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuotedPost(null)}
                className="p-1 rounded-full bg-black/80 text-white hover:bg-black transition-colors shrink-0"
                title="Retirer la citation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Upload indicator */}
          {isUploading && (
            <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center gap-2 text-xs text-zinc-300">
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Téléversement des médias ({imagesCount}/5 images, {videosCount}/2 vidéos)...</span>
            </div>
          )}

          {/* Multi-Media Previews (Up to 5 images / 2 videos) */}
          {mediaList.length > 0 && (
            <div className={`grid gap-2 rounded-2xl overflow-hidden ${mediaList.length === 1 ? 'grid-cols-1' : mediaList.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {mediaList.map((m, idx) => (
                <div key={idx} className="relative group rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-video flex items-center justify-center">
                  {m.media_type === 'video' ? (
                    <video src={m.url} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={m.url} alt="Média" className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia(idx)}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/80 text-white hover:bg-black transition-colors"
                    title="Retirer le média"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action Tools Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
            <div className="flex items-center gap-1 sm:gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFilesSelected}
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                className="hidden"
              />

              {/* Bouton unique pour l'import de photos ET vidéos */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || (imagesCount >= 5 && videosCount >= 2)}
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                title="Ajouter photos ou vidéos (max 5 photos, 2 vidéos)"
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              {/* Badge « Créé avec l'IA » (défaut = réglage posts_ai_generated_by_default) */}
              <button
                type="button"
                onClick={() => setIsAIGenerated(!isAIGenerated)}
                className={`p-2 rounded-full transition-colors ${
                  isAIGenerated
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
                title={isAIGenerated ? 'Publication marquée « créée avec l\'IA » — cliquer pour retirer' : 'Marquer cette publication comme créée avec l\'IA'}
              >
                <Sparkles className="w-4 h-4" />
              </button>

              {isSupported && (
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`p-2 rounded-full transition-colors ${
                    isListening
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                  title={isListening ? 'Arrêter la dictée' : 'Dicter la vibe'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Unlimited text info */}
              <span className="text-[11px] font-mono text-zinc-500">
                {content.length > 0 ? `${content.length} car.` : ''}
              </span>

              <button
                onClick={handleSubmit}
                disabled={(!content.trim() && mediaList.length === 0) || isSubmitting || isUploading}
                style={{ backgroundColor: 'var(--vibe-accent, #ffffff)' }}
                className="py-2 px-5 rounded-full bg-white text-black font-bold text-xs hover:brightness-90 transition-all flex items-center gap-1.5 shadow-lg disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Poster une vibe</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
