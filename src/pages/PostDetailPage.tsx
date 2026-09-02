/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — POST DETAIL PAGE (src/pages/PostDetailPage.tsx)
 * Single post view with comments thread & mAI synthesis
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Post } from '../types/vibe';
import { PostCard } from '../components/feed/PostCard';
import { CommentSection } from '../components/comments/CommentSection';
import { ApiService } from '../services/api';

interface PostDetailPageProps {
  postId: string;
  onBack: () => void;
  onOpenProfile: (username: string) => void;
}

export const PostDetailPage: React.FC<PostDetailPageProps> = ({
  postId,
  onBack,
  onOpenProfile,
}) => {
  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPost = async () => {
      setIsLoading(true);
      try {
        const data = await ApiService.getPost(postId);
        setPost(data.post);
      } catch {
        // Mock fallback
        setPost({
          id: postId,
          author_id: 'mathias-id',
          username: 'mathias_dev',
          display_name: 'Mathias',
          avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&q=80',
          content: 'Bienvenue sur Vibe ! Le réseau social nouvelle génération fusionnant l’expérience fluide de X/Twitter avec l’intelligence artificielle autonome mAI.',
          format: 'micro_text',
          visibility: 'public',
          likes_count: 142,
          reposts_count: 38,
          replies_count: 12,
          bookmarks_count: 24,
          published_at: new Date().toISOString(),
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchPost();
  }, [postId]);

  return (
    <div className="flex-1 min-h-screen border-r border-zinc-800 bg-black pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/80 border-b border-zinc-800 px-4 py-3 flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-white tracking-tight">Publication</h1>
      </header>

      {/* Main Post */}
      {post && (
        <div className="border-b border-zinc-800">
          <PostCard post={post} onOpenProfile={onOpenProfile} />
        </div>
      )}

      {/* Comment Section & Discussion Synthesis */}
      <div className="p-4">
        <CommentSection postId={postId} />
      </div>
    </div>
  );
};
