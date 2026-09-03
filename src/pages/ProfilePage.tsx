/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — PROFILE PAGE (src/pages/ProfilePage.tsx)
 * User profile view with file-only Avatar/Banner uploads, Verified Badge & Username edit
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Edit3,
  ArrowLeft,
  X,
  Camera,
  LogOut,
  Upload,
  Loader2,
  BadgeCheck,
  AlertCircle
} from 'lucide-react';
import type { Profile, Post } from '../types/vibe';
import { ApiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PostCard } from '../components/feed/PostCard';
import { VerifiedBadge } from '../components/common/VerifiedBadge';
import { ProfileAvatar } from '../components/common/ProfileAvatar';

interface ProfilePageProps {
  username?: string;
  onBack?: () => void;
  onOpenThread: (post: Post) => void;
  onOpenProfile: (username: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  username,
  onBack,
  onOpenThread,
  onOpenProfile,
}) => {
  const { user, profile: authProfile, updateUserAvatar, updateUser, refreshProfile, logout, isLoadingSession } = useAuth();
  const rawTarget = username || user?.username || 'utilisateur';
  const targetUsername = rawTarget.replace(/^@/, '');
  const isSelf = Boolean(user && user.username && user.username.toLowerCase().replace(/^@/, '') === targetUsername.toLowerCase());

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'media' | 'likes'>('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Edit fields
  const [editUsername, setEditUsername] = useState('');
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editInterests, setEditInterests] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editBanner, setEditBanner] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const fetchProfile = async () => {
    setIsLoadingProfile(true);
    setProfileError(null);
    try {
      const data = await ApiService.getProfile(targetUsername);
      setProfile(data.profile);
      setPosts(data.posts || []);
      setIsFollowing(Boolean((data.profile as any).isFollowing));
      setEditUsername(data.profile.username || targetUsername);
      setEditName(data.profile.displayName || '');
      setEditBio(data.profile.bio || '');
      setEditInterests(data.profile.interests ? data.profile.interests.join(', ') : '');
      setEditAvatar(data.profile.avatarUrl || '');
      setEditBanner(data.profile.bannerUrl || '');
    } catch (err: any) {
      if (isSelf && authProfile) {
        setProfile(authProfile);
        setEditUsername(user?.username || targetUsername);
        setEditName(authProfile.displayName || '');
        setEditBio(authProfile.bio || '');
        setEditAvatar(authProfile.avatarUrl || '');
      } else {
        setProfileError(err?.message || 'Impossible de charger ce profil.');
      }
    } finally {
      setIsLoadingProfile(false);
    }
  };

  useEffect(() => {
    if (!username && isLoadingSession) return;
    fetchProfile();
    const handlePostUpdated = () => {
      fetchProfile();
    };
    window.addEventListener('vibe:post_updated', handlePostUpdated);
    return () => {
      window.removeEventListener('vibe:post_updated', handlePostUpdated);
    };
  }, [targetUsername, isLoadingSession, username]);

  const handleFollowToggle = async () => {
    const next = !isFollowing;
    setIsFollowing(next);
    // Mise à jour immédiate des compteurs affichés
    setProfile((prev) => prev ? {
      ...prev,
      followersCount: Math.max(0, (prev.followersCount || 0) + (next ? 1 : -1)),
    } : prev);
    try {
      await ApiService.toggleFollow(targetUsername);
    } catch {
      setIsFollowing(!next);
      setProfile((prev) => prev ? {
        ...prev,
        followersCount: Math.max(0, (prev.followersCount || 0) + (next ? -1 : 1)),
      } : prev);
    }
  };

  const handleDirectAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const res = await ApiService.uploadAvatar(file);
      if (res.avatarUrl) {
        setEditAvatar(res.avatarUrl);
        await updateUserAvatar(res.avatarUrl);
        await fetchProfile();
        await refreshProfile();
      }
    } catch (err: any) {
      alert(`Erreur upload photo de profil : ${err.message}`);
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleDirectBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingBanner(true);
    try {
      const res = await ApiService.uploadFile(file);
      if (res.url) {
        setEditBanner(res.url);
        await ApiService.updateProfile({ bannerUrl: res.url });
        await fetchProfile();
      }
    } catch (err: any) {
      alert(`Erreur upload bannière : ${err.message}`);
    } finally {
      setIsUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setIsSaving(true);
    try {
      const interestsArray = editInterests.split(',').map((s) => s.trim()).filter(Boolean);
      const cleanUser = editUsername.trim().toLowerCase().replace(/^@/, '');

      if (cleanUser && cleanUser.length < 2) {
        setEditError("Le nom d'utilisateur doit comporter au moins 2 caractères (lettres, chiffres, _).");
        setIsSaving(false);
        return;
      }

      const res = await ApiService.updateProfile({
        username: cleanUser || undefined,
        displayName: editName.trim(),
        bio: editBio.trim(),
        interests: interestsArray,
        avatarUrl: editAvatar,
        bannerUrl: editBanner,
      } as any);

      // Synchroniser l'utilisateur avec la réponse du serveur (username modifié inclus)
      const updatedProfile = (res as any)?.profile;
      const finalUsername = updatedProfile?.username || cleanUser;
      if (finalUsername) {
        updateUser({ username: finalUsername, avatar_url: updatedProfile?.avatarUrl || editAvatar });
        window.history.replaceState(null, '', `/@${finalUsername}`);
      }
      await refreshProfile();
      await fetchProfile();
      setIsEditOpen(false);
    } catch (err: any) {
      setEditError(err.message || 'Erreur lors de la modification du profil.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeAvatar = profile?.avatarUrl || (isSelf ? authProfile?.avatarUrl || user?.avatar_url : null);
  const isVerified = Boolean(
    profile?.is_verified ||
    (profile as any)?.isVerified ||
    (isSelf && user?.is_verified) ||
    ['plus', 'pro', 'max'].includes(((isSelf ? user?.tier : (profile as any)?.tier) || '').toLowerCase().trim())
  );

  return (
    <div className="flex-1 min-h-screen border-r border-zinc-800 bg-black pb-8 select-none">
      {/* Hidden file inputs for direct camera / file upload via storage.ts */}
      <input
        type="file"
        ref={avatarInputRef}
        onChange={handleDirectAvatarUpload}
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
      />
      <input
        type="file"
        ref={bannerInputRef}
        onChange={handleDirectBannerUpload}
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
      />

      {/* Top Bar */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/80 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>{profile?.displayName || (isLoadingProfile ? 'Chargement...' : targetUsername)}</span>
              <VerifiedBadge isVerified={isVerified} size="sm" />
            </h1>
            <p className="text-xs text-zinc-500 font-mono">
              {posts.length} {posts.length <= 1 ? 'publication' : 'publications'}
            </p>
          </div>
        </div>

        {isSelf && (
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-red-900/50 bg-red-950/20 text-red-400 text-xs font-medium hover:bg-red-950/40 transition-colors"
            title="Se déconnecter"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Déconnexion</span>
          </button>
        )}
      </header>

      {/* Banner */}
      <div className="h-44 sm:h-52 w-full bg-zinc-900 relative overflow-hidden border-b border-zinc-800 group">
        {isLoadingProfile ? (
          <div className="w-full h-full bg-zinc-950 animate-pulse flex items-center justify-center text-zinc-600 text-xs font-mono">
            Chargement...
          </div>
        ) : profile?.bannerUrl ? (
          <img src={profile.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-zinc-950 via-zinc-900 to-black" />
        )}

        {isSelf && (
          <button
            onClick={() => bannerInputRef.current?.click()}
            disabled={isUploadingBanner}
            className="absolute top-3 right-3 py-1.5 px-3 rounded-full bg-black/70 backdrop-blur-md border border-zinc-700 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 hover:bg-black"
          >
            {isUploadingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            <span>Changer la bannière</span>
          </button>
        )}
      </div>

      {/* Profile Details Container */}
      <div className="px-4 pb-4 space-y-4 relative">
        {/* Avatar & Action Button */}
        <div className="flex items-end justify-between -mt-16 sm:-mt-20">
          <div className="relative group">
            <ProfileAvatar
              src={activeAvatar}
              alt="Avatar"
              size="2xl"
              isLoading={isLoadingProfile}
              fallbackName={targetUsername}
              className="border-4 border-black bg-zinc-900 shadow-2xl"
            />
            {isSelf && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity text-xs z-20"
                title="Télécharger une photo de profil"
              >
                {isUploadingAvatar ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-[10px] font-semibold">Changer</span>
                  </>
                )}
              </button>
            )}
          </div>

          {isSelf ? (
            <button
              onClick={() => setIsEditOpen(true)}
              className="py-2 px-5 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Modifier le profil</span>
            </button>
          ) : (
            <button
              onClick={handleFollowToggle}
              style={!isFollowing ? { backgroundColor: 'var(--vibe-accent, #ffffff)' } : undefined}
              className={`py-2 px-6 rounded-full font-bold text-xs transition-all ${
                isFollowing
                  ? 'border border-zinc-700 bg-transparent text-white hover:bg-zinc-900'
                  : 'bg-white text-black hover:brightness-90'
              }`}
            >
              {isFollowing ? 'Abonné' : 'Suivre'}
            </button>
          )}
        </div>

        {/* User Info */}
        <div className="space-y-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-white tracking-tight">{profile?.displayName || targetUsername}</h2>
              <VerifiedBadge isVerified={isVerified} tier={isSelf ? user?.tier : (profile as any)?.tier} size="md" />
            </div>
            <span className="text-xs text-zinc-500 font-mono">@{targetUsername}</span>
          </div>

          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {profile?.bio || 'Membre actif de la communauté Vibe.'}
          </p>

          {/* Interests Tags */}
          {profile?.interests && profile.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.interests.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Meta data */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 pt-2 font-mono">
            {(Boolean((profile as any)?.created_at) || (isSelf && user?.created_at)) && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  Inscrit sur Vibe en{' '}
                  {new Date((profile as any)?.created_at || user?.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </span>
              </div>
            )}
            {isVerified && (
              <div className="flex items-center gap-1 text-[#1D9BF0]">
                <BadgeCheck className="w-3.5 h-3.5" />
                <span>Compte Vérifié</span>
              </div>
            )}
          </div>

          {/* Followers / Following Counters */}
          <div className="flex items-center gap-4 text-xs pt-1">
            <span className="text-zinc-400">
              <strong className="text-white font-bold">{profile?.followingCount || 0}</strong> abonnements
            </span>
            <span className="text-zinc-400">
              <strong className="text-white font-bold">{profile?.followersCount || 0}</strong> abonnés
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex border-b border-zinc-800 bg-zinc-950">
        {(['posts', 'replies', 'media', 'likes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wider relative transition-colors hover:bg-zinc-900"
          >
            <span className={activeTab === tab ? 'text-white' : 'text-zinc-500'}>
              {tab === 'posts' ? 'Vibes' : tab === 'replies' ? 'Réponses' : tab === 'media' ? 'Médias' : 'J’aime'}
            </span>
            {activeTab === tab && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Real Posts Stream from DB */}
      <div className="divide-y divide-zinc-900">
        {isLoadingProfile && (
          <div className="p-16 text-center text-zinc-400 text-sm flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            <span>Chargement des publications…</span>
          </div>
        )}

        {!isLoadingProfile && profileError && (
          <div className="p-16 text-center text-zinc-500 text-xs flex flex-col items-center gap-3">
            <span>{profileError}</span>
            <button
              onClick={fetchProfile}
              className="py-2 px-4 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-semibold hover:bg-zinc-800"
            >
              Réessayer
            </button>
          </div>
        )}

        {!isLoadingProfile && !profileError && posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            onPostDeleted={(postId) => setPosts((prev) => prev.filter((x) => String(x.id) !== String(postId)))}
            onOpenThread={onOpenThread}
            onOpenProfile={onOpenProfile}
          />
        ))}

        {!isLoadingProfile && !profileError && posts.length === 0 && (
          <div className="p-16 text-center text-zinc-500 text-xs">
            Aucune vibe publiée pour le moment.
          </div>
        )}
      </div>

      {/* Edit Profile & Avatar Modal (File Uploads Only, No URL input) */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-bold text-base text-white">Modifier le profil</h3>
              <button onClick={() => setIsEditOpen(false)} className="p-1 rounded-full text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {editError && (
                <div className="p-3 rounded-2xl bg-red-950/40 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Username Input */}
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase text-zinc-400">Nom d’utilisateur (@pseudo)</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-zA-Z0-9_]/g, ''))}
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Display Name */}
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase text-zinc-400">Nom d’affichage</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Bio */}
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase text-zinc-400">Biographie</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Interests */}
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase text-zinc-400">Centres d’intérêt</label>
                <input
                  type="text"
                  value={editInterests}
                  onChange={(e) => setEditInterests(e.target.value)}
                  placeholder="IA, Design, Tech, Cinéma"
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Verified Badge Info — réservé aux abonnements payants */}
              <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 text-[#1D9BF0] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white">Coche bleue</span>
                  <p className="text-[11px] text-zinc-500">
                    Disponible automatiquement avec les abonnements Plus, Pro et Max.
                  </p>
                </div>
              </div>

              {/* File-Only Uploads for Avatar and Banner */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors flex flex-col items-center justify-center gap-1.5 text-center"
                >
                  {isUploadingAvatar ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Camera className="w-5 h-5 text-white" />}
                  <span className="text-xs font-bold text-white">Changer photo</span>
                  <span className="text-[10px] text-zinc-500">Importer fichier image</span>
                </button>

                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isUploadingBanner}
                  className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors flex flex-col items-center justify-center gap-1.5 text-center"
                >
                  {isUploadingBanner ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Upload className="w-5 h-5 text-white" />}
                  <span className="text-xs font-bold text-white">Changer bannière</span>
                  <span className="text-[10px] text-zinc-500">Importer fichier image</span>
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="py-2 px-5 rounded-full bg-zinc-900 text-zinc-300 text-xs font-semibold hover:bg-zinc-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="py-2 px-6 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-200 disabled:opacity-40"
                >
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
