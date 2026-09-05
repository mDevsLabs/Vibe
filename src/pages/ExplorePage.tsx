/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — EXPLORE PAGE (src/pages/ExplorePage.tsx)
 * Recherche multi-catégories : Comptes, Hashtags, Publications
 * Tendances 100% réelles depuis la base de données
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search, Hash, Users, FileText, TrendingUp, ArrowUpRight,
  Loader2, X, ChevronRight
} from 'lucide-react';
import { ApiService } from '../services/api';
import { PostCard } from '../components/feed/PostCard';
import { Post } from '../types/vibe';
import { VerifiedBadge } from '../components/common/VerifiedBadge';

interface ExplorePageProps {
  onOpenProfile: (username: string) => void;
  onOpenThread: (post: Post) => void;
}

type SearchTab = 'posts' | 'accounts' | 'hashtags';

interface UserResult {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  followers_count?: number;
  bio?: string;
}

interface TrendItem {
  tag: string;
  category?: string;
  posts: string;
  post_count?: number;
}

export const ExplorePage: React.FC<ExplorePageProps> = ({ onOpenProfile, onOpenThread }) => {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('posts');
  const [hasSearched, setHasSearched] = useState(false);

  // Results
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [hashtagResults, setHashtagResults] = useState<TrendItem[]>([]);

  // Loading states
  const [isSearching, setIsSearching] = useState(false);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Chargement des tendances réelles ────────────────────────────────────
  const fetchTrends = async () => {
    setIsLoadingTrends(true);
    try {
      const res = await ApiService.getTrends();
      if (res?.trends) setTrends(res.trends);
      else setTrends([]);
    } catch {
      setTrends([]);
    } finally {
      setIsLoadingTrends(false);
    }
  };

  useEffect(() => { fetchTrends(); }, []);

  // ─── Recherche multi-catégories ────────────────────────────────────────────
  const performSearch = useCallback(async (q: string, overrideTab?: SearchTab) => {
    if (!q.trim()) {
      setHasSearched(false);
      setPostResults([]);
      setUserResults([]);
      setHashtagResults([]);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    const cleanQ = q.trim();
    const isHashtag = cleanQ.startsWith('#');
    const searchQ = isHashtag ? cleanQ.replace(/^#/, '') : cleanQ;

    // Lance les 3 recherches en parallèle
    const [postsRes, usersRes, trendsRes] = await Promise.allSettled([
      // Publications — nouvelle API recherche backend dédiée avec fallback
      ApiService.searchPosts(cleanQ).then(res => {
        if (res?.posts && res.posts.length > 0) return res.posts;
        return ApiService.getFeed('trending', isHashtag ? searchQ : undefined).then(f => {
          if (!f?.posts) return [];
          if (isHashtag) return f.posts;
          return f.posts.filter(p =>
            (p.content || '').toLowerCase().includes(cleanQ.toLowerCase()) ||
            (p.username || '').toLowerCase().includes(cleanQ.toLowerCase()) ||
            (p.display_name || '').toLowerCase().includes(cleanQ.toLowerCase())
          );
        });
      }).catch(async () => {
        const f = await ApiService.getFeed('trending', isHashtag ? searchQ : undefined);
        return f?.posts || [];
      }),

      // Comptes
      ApiService.searchUsers(cleanQ).then(res => res?.users || []),

      // Hashtags — depuis les tendances courantes
      ApiService.getTrends().then(res => {
        if (!res?.trends) return [];
        return res.trends.filter(t =>
          t.tag.toLowerCase().includes(searchQ.toLowerCase())
        );
      }),
    ]);

    setPostResults(postsRes.status === 'fulfilled' ? postsRes.value : []);
    setUserResults(usersRes.status === 'fulfilled' ? usersRes.value : []);
    setHashtagResults(trendsRes.status === 'fulfilled' ? trendsRes.value : []);

    // Sélectionner l'onglet demandé ou le plus pertinent
    if (overrideTab) {
      setActiveTab(overrideTab);
    } else if (isHashtag) {
      setActiveTab('hashtags');
    } else if (usersRes.status === 'fulfilled' && usersRes.value.length > (postsRes.status === 'fulfilled' ? postsRes.value.length : 0)) {
      setActiveTab('accounts');
    } else {
      setActiveTab('posts');
    }

    setIsSearching(false);
  }, []);

  // Détection des URL query params (ex: ?q=%23tech&tab=hashtags)
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const urlQ = params.get('q');
      const urlTab = params.get('tab') as SearchTab | null;
      if (urlQ) {
        setQuery(urlQ);
        performSearch(urlQ, urlTab || undefined);
      }
    } catch {}
  }, [location.search, performSearch]);

  // Debounce automatique à la frappe
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim().length >= 1) performSearch(query);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, performSearch]);

  const handleClear = () => {
    setQuery('');
    setHasSearched(false);
    setPostResults([]);
    setUserResults([]);
    setHashtagResults([]);
    inputRef.current?.focus();
  };

  const handleTrendClick = (tag: string) => {
    const formattedTag = tag.startsWith('#') ? tag : `#${tag}`;
    setQuery(formattedTag);
    performSearch(formattedTag, 'hashtags');
  };

  // ─── Onglets de résultats ─────────────────────────────────────────────────
  const tabs: { id: SearchTab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'posts', label: 'Publications', icon: <FileText className="w-3.5 h-3.5" />, count: postResults.length },
    { id: 'accounts', label: 'Comptes', icon: <Users className="w-3.5 h-3.5" />, count: userResults.length },
    { id: 'hashtags', label: 'Hashtags', icon: <Hash className="w-3.5 h-3.5" />, count: hashtagResults.length },
  ];

  return (
    <div className="flex-1 min-h-screen border-r border-zinc-800 bg-black pb-8 select-none">

      {/* ─── Sticky Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/90 border-b border-zinc-800/80 p-3 space-y-3">

        {/* Barre de recherche */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && performSearch(query)}
            placeholder="Rechercher des publications, @comptes ou #hashtags..."
            className="w-full pl-10 pr-9 py-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800/60 transition-all"
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Onglets de résultats — visibles seulement si recherche active */}
        {hasSearched && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-black'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id ? 'bg-black/20 text-black' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ─── Loader de recherche ───────────────────────────────────────────── */}
      {isSearching && (
        <div className="p-8 text-center flex items-center justify-center gap-2 text-xs text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin text-white" />
          <span>Recherche en cours...</span>
        </div>
      )}

      {/* ─── Résultats de recherche ────────────────────────────────────────── */}
      {hasSearched && !isSearching && (
        <div>

          {/* Header résultats */}
          <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              Résultats pour <span className="text-white font-semibold">« {query} »</span>
            </span>
            <span className="text-[11px] text-zinc-600 font-mono">
              {postResults.length + userResults.length + hashtagResults.length} résultat(s)
            </span>
          </div>

          {/* ── Onglet Comptes ─────────────────────────────────────────── */}
          {activeTab === 'accounts' && (
            <div className="divide-y divide-zinc-900">
              {userResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  <Users className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
                  Aucun compte trouvé pour « {query} »
                </div>
              ) : (
                userResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onOpenProfile(u.username)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-zinc-900/60 transition-colors text-left"
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.username}
                          className="w-11 h-11 rounded-full object-cover bg-zinc-800"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${u.username}`;
                          }}
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center">
                          <span className="text-sm font-bold text-zinc-400">
                            {(u.display_name || u.username || '?')[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-white truncate">
                          {u.display_name || u.username}
                        </span>
                        <VerifiedBadge isVerified={u.is_verified} tier={(u as any).tier} size="xs" />
                      </div>
                      <div className="text-xs text-zinc-500">@{u.username}</div>
                      {u.bio && (
                        <div className="text-xs text-zinc-400 mt-0.5 truncate">{u.bio}</div>
                      )}
                      {u.followers_count != null && u.followers_count > 0 && (
                        <div className="text-[11px] text-zinc-600 mt-0.5 font-mono">
                          {u.followers_count.toLocaleString('fr-FR')} abonnés
                        </div>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-zinc-700 flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── Onglet Hashtags ────────────────────────────────────────── */}
          {activeTab === 'hashtags' && (
            <div className="divide-y divide-zinc-900">
              {hashtagResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  <Hash className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
                  Aucun hashtag trouvé pour « {query} »
                </div>
              ) : (
                hashtagResults.map((item) => (
                  <button
                    key={item.tag}
                    onClick={() => {
                      const tag = item.tag.startsWith('#') ? item.tag : `#${item.tag}`;
                      setQuery(tag);
                      performSearch(tag, 'posts');
                    }}
                    className="w-full p-4 hover:bg-zinc-900/60 transition-colors flex items-center justify-between group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                        <Hash className="w-4 h-4 text-zinc-400" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-white group-hover:underline">{item.tag}</div>
                        <div className="text-[11px] text-zinc-600 font-mono">{item.posts}</div>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── Onglet Publications ────────────────────────────────────── */}
          {activeTab === 'posts' && (
            <div>
              {postResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  <FileText className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
                  Aucune publication trouvée pour « {query} »
                </div>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {postResults.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onOpenProfile={onOpenProfile}
                      onOpenThread={onOpenThread}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Page de découverte (avant toute recherche) ────────────────────── */}
      {!hasSearched && !isSearching && (
        <div className="p-4 space-y-5">

          {/* Tendances réelles */}
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <TrendingUp className="w-4 h-4 text-white" />
            <span>Tendances</span>
          </div>

          {isLoadingTrends ? (
            <div className="p-6 text-center">
              <Loader2 className="w-5 h-5 text-zinc-600 animate-spin mx-auto" />
            </div>
          ) : trends.length === 0 ? (
            <div className="rounded-3xl bg-zinc-950 border border-zinc-800/90 p-8 text-center space-y-2">
              <TrendingUp className="w-8 h-8 text-zinc-700 mx-auto" />
              <p className="text-xs text-zinc-500">
                Les tendances apparaissent quand les hashtags deviennent populaires dans les publications.
              </p>
              <p className="text-[11px] text-zinc-600">
                Publiez des posts avec des <span className="text-zinc-400">#hashtags</span> pour faire émerger des tendances !
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-900 rounded-3xl bg-zinc-950 border border-zinc-800/90 overflow-hidden">
              {trends.map((item, idx) => (
                <button
                  key={item.tag}
                  onClick={() => handleTrendClick(item.tag)}
                  className="w-full p-4 hover:bg-zinc-900/60 transition-colors flex items-center justify-between group text-left"
                >
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-zinc-500 font-mono">
                      #{idx + 1}
                    </div>
                    <div className="text-sm font-bold text-white group-hover:underline">{item.tag}</div>
                    <div className="text-[11px] text-zinc-500 font-mono">{item.posts}</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-zinc-600 transition-all flex-shrink-0">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
