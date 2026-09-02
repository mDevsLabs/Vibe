/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — HOME PAGE (src/pages/HomePage.tsx)
 * Timeline: Pour Vous, Abonnements & Tendances Populaires avec Hashtags Réels
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, AlertCircle, PenSquare, Sparkles, TrendingUp, Hash, X } from 'lucide-react';
import { PostComposer } from '../components/feed/PostComposer';
import { PostCard } from '../components/feed/PostCard';
import { ExplainModal } from '../components/feed/ExplainModal';
import type { Post } from '../types/vibe';
import { ApiService } from '../services/api';

interface HomePageProps {
  onOpenThread: (post: Post) => void;
  onOpenProfile: (username: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onOpenThread,
  onOpenProfile,
}) => {
  const [feedType, setFeedType] = useState<'for_you' | 'stream' | 'trending'>('for_you');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [trends, setTrends] = useState<Array<{ tag: string; category?: string; posts: string }>>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedPostForExplain, setSelectedPostForExplain] = useState<Post | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const fetchFeed = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await ApiService.getFeed(feedType, selectedTag || undefined);
      setPosts(data.posts || []);
    } catch (err: any) {
      console.warn('[HomePage] Error loading feed:', err);
      setFetchError(err.message || 'Impossible de charger le fil.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [feedType, selectedTag]);

  useEffect(() => {
    ApiService.getTrends()
      .then((res) => {
        if (res?.trends) setTrends(res.trends);
      })
      .catch(() => {});

    const handlePostUpdated = () => {
      fetchFeed();
    };
    window.addEventListener('vibe:post_updated', handlePostUpdated);
    return () => {
      window.removeEventListener('vibe:post_updated', handlePostUpdated);
    };
  }, []);

  const handlePostDeleted = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleSelectTag = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
    } else {
      setSelectedTag(tag);
      setFeedType('trending');
    }
  };

  return (
    <div className="flex-1 min-h-screen border-r border-zinc-800 bg-black pb-20 select-none">
      {/* Sticky Top Header with 3 Feed Tabs: Pour Vous | Abonnements | Tendances */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/80 border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-white tracking-tight">Accueil</h1>
            {selectedTag && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-white font-mono">
                <span>{selectedTag}</span>
                <button onClick={() => setSelectedTag(null)} className="hover:text-zinc-400">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
          <button
            onClick={fetchFeed}
            title="Rafraîchir le flux"
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Mode Switcher: Pour Vous vs Abonnements vs Tendances */}
        <div className="flex border-t border-zinc-800 bg-zinc-950/60">
          <button
            onClick={() => {
              setSelectedTag(null);
              setFeedType('for_you');
            }}
            className="flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wider relative transition-colors hover:bg-zinc-900/50"
          >
            <span className={feedType === 'for_you' ? 'text-white font-bold' : 'text-zinc-500'}>
              Pour Vous
            </span>
            {feedType === 'for_you' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-white rounded-full" />
            )}
          </button>

          <button
            onClick={() => {
              setSelectedTag(null);
              setFeedType('stream');
            }}
            className="flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wider relative transition-colors hover:bg-zinc-900/50"
          >
            <span className={feedType === 'stream' ? 'text-white font-bold' : 'text-zinc-500'}>
              Abonnements
            </span>
            {feedType === 'stream' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-white rounded-full" />
            )}
          </button>

          <button
            onClick={() => setFeedType('trending')}
            className="flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wider relative transition-colors hover:bg-zinc-900/50 flex items-center justify-center gap-1.5"
          >
            <TrendingUp className={`w-3.5 h-3.5 ${feedType === 'trending' ? 'text-white' : 'text-zinc-500'}`} />
            <span className={feedType === 'trending' ? 'text-white font-bold' : 'text-zinc-500'}>
              Tendances
            </span>
            {feedType === 'trending' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-white rounded-full" />
            )}
          </button>
        </div>
      </header>

      {/* Main Post Composer */}
      <div ref={composerRef}>
        <PostComposer onPostCreated={fetchFeed} />
      </div>

      {/* Trending Hashtags Quick Strip (When on Tendances or always on top of stream) */}
      {feedType === 'trending' && trends.length > 0 && (
        <div className="p-3 bg-zinc-950/80 border-b border-zinc-900 overflow-x-auto flex items-center gap-2 no-scrollbar">
          <span className="text-[11px] font-mono text-zinc-500 uppercase shrink-0 pl-1">Hashtags du moment :</span>
          {trends.map((item) => {
            const isSelected = selectedTag === item.tag;
            return (
              <button
                key={item.tag}
                onClick={() => handleSelectTag(item.tag)}
                className={`px-3 py-1 rounded-full text-xs font-mono transition-all shrink-0 flex items-center gap-1 ${
                  isSelected
                    ? 'bg-white text-black font-bold'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white'
                }`}
              >
                <span>{item.tag}</span>
                <span className={`text-[10px] ${isSelected ? 'text-zinc-600' : 'text-zinc-500'}`}>
                  {item.posts.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Feed Stream */}
      <div className="divide-y divide-zinc-900">
        {fetchError && (
          <div className="p-6 m-4 rounded-3xl bg-zinc-950 border border-zinc-800 text-center space-y-3">
            <AlertCircle className="w-5 h-5 mx-auto text-zinc-400" />
            <p className="text-xs text-zinc-400">{fetchError}</p>
            <button
              onClick={fetchFeed}
              className="py-1.5 px-4 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-all"
            >
              Réessayer
            </button>
          </div>
        )}

        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onOpenThread={onOpenThread}
            onOpenProfile={onOpenProfile}
            onPostDeleted={handlePostDeleted}
            onOpenExplain={(p: Post) => setSelectedPostForExplain(p)}
          />
        ))}

        {!isLoading && posts.length === 0 && !fetchError && (
          <div className="p-12 sm:p-16 text-center space-y-4 max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
              <PenSquare className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">
                {feedType === 'trending' ? 'Aucune tendance pour le moment' : 'Aucune publication'}
              </h3>
              <p className="text-xs text-zinc-500">
                {feedType === 'trending'
                  ? 'Soyez le premier à lancer un sujet populaire avec un #hashtag !'
                  : 'Créez votre première publication ci-dessus pour animer votre communauté.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* AI Explain Modal */}
      {selectedPostForExplain && (
        <ExplainModal
          post={selectedPostForExplain}
          isOpen={!!selectedPostForExplain}
          onClose={() => setSelectedPostForExplain(null)}
        />
      )}
    </div>
  );
};
