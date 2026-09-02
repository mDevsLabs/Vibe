/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — PROFILE PAGE (src/pages/ProfilePage.tsx)
 * User profile view with file-only Avatar/Banner uploads, Verified Badge & Username edit
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  CheckCircle,
  Edit3,
  ArrowLeft,
  X,
  Camera,
  LogOut,
  Upload,
  Loader2,
  ShieldCheck,
  BadgeCheck
} from 'lucide-react';
import type { Profile, Post } from '../types/vibe';
import { ApiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PostCard } from '../components/feed/PostCard';
import { VerifiedBadge } from '../components/common/VerifiedBadge';

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
  const { user, profile: authProfile, updateUserAvatar, refreshProfile, logout } = useAuth();
  const targetUsername = username || user?.username || 'utilisateur';
  const isSelf = user && (user.username.toLowerCase() === targetUsername.toLowerCase());

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'media' | 'likes'>('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Edit fields
  const [editUsername, setEditUsername] = useState('');
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editInterests, setEditInterests] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editBanner, setEditBanner] = useState('');
  const [editIsVerified, setEditIsVerified] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const fetchProfile = async () => {
    try {
      const data = await ApiService.getProfile(targetUsername);
      setProfile(data.profile);
      setPosts(data.posts || []);
      setEditUsername(data.profile.username || targetUsername);
      setEditName(data.profile.displayName || '');
      setEditBio(data.profile.bio || '');
      setEditInterests(data.profile.interests ? data.profile.interests.join(', ') : '');
      setEditAvatar(data.profile.avatarUrl || '');
      setEditBanner(data.profile.bannerUrl || '');
      setEditIsVerified(Boolean(data.profile.is_verified || (data.profile as any).isVerified));
    } catch {}
  };

  useEffect(() => {
    fetchProfile();
    const handlePostUpdated = () => {
      fetchProfile();
    };
    window.addEventListener('vibe:post_updated', handlePostUpdated);
    return () => {
      window.removeEventListener('vibe:post_updated', handlePostUpdated);
    };
  }, [targetUsername]);

  const handleFollowToggle = async () => {
    setIsFollowing(!isFollowing);
    try {
      await ApiService.toggleFollow(targetUsername);
    } catch {
      setIsFollowing(isFollowing);
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
    setIsSaving(true);
    try {
      const interestsArray = editInterests.split(',').map((s) => s.trim()).filter(Boolean);

      await ApiService.updateProfile({
        username: editUsername.trim() || undefined,
        displayName: editName.trim(),
        bio: editBio.trim(),
        interests: interestsArray,
        avatarUrl: editAvatar,
        bannerUrl: editBanner,
        is_verified: editIsVerified,
      } as any);

      await fetchProfile();
      await refreshProfile();
      setIsEditOpen(false);
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const activeAvatar = profile?.avatarUrl || (isSelf ? authProfile?.avatarUrl || user?.avatar_url : null) || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80';
  const isVerified = Boolean(
    profile?.is_verified ||
    (profile as any)?.isVerified ||
    (isSelf && user?.is_verified) ||
    ['plus', 'pro', 'max'].includes(((isSelf ? user?.tier : (profile as any)?.tier) || '').toLowerCase().trim())
  );

  return (
    <div className="flex-1 min-h-screen border-r border-zinc-800 bg-black pb-20 select-none">
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
              <span>{profile?.displayName || targetUsername}</span>
              <VerifiedBadge isVerified={isVerified} tier={isSelf ? user?.tier : (profile as any)?.tier} size="sm" />
            </h1>
            <span className="text-[11px] text-zinc-500 font-mono">{posts.length} publication(s)</span>
          </div>
        </div>

        {isSelf && (
          <button
            onClick={logout}
            title="Se déconnecter"
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-semibold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Déconnexion</span>
          </button>
        )}
      </header>

      {/* Banner */}
      <div className="h-44 sm:h-52 w-full bg-zinc-900 relative overflow-hidden border-b border-zinc-800 group">
        {profile?.bannerUrl ? (
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
            <img
              src={activeAvatar}
              alt="Avatar"
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-black bg-zinc-900 shadow-2xl"
            />
            {isSelf && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity text-xs"
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
              className={`py-2 px-6 rounded-full font-bold text-xs transition-all ${
                isFollowing
                  ? 'border border-zinc-700 bg-transparent text-white hover:bg-zinc-900'
                  : 'bg-white text-black hover:bg-zinc-200'
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
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Inscrit sur Vibe</span>
            </div>
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
              {tab === 'posts' ? 'Publications' : tab === 'replies' ? 'Réponses' : tab === 'media' ? 'Médias' : 'J’aime'}
            </span>
            {activeTab === tab && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Real Posts Stream from DB */}
      <div className="divide-y divide-zinc-900">
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            onPostDeleted={() => fetchProfile()}
            onOpenThread={onOpenThread}
            onOpenProfile={onOpenProfile}
          />
        ))}

        {posts.length === 0 && (
          <div className="p-16 text-center text-zinc-500 text-xs">
            Aucun post publié pour le moment.
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

              {/* Verified Badge Option */}
              <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#1D9BF0] fill-[#1D9BF0]" />
                  <div>
                    <span className="text-xs font-bold text-white">Compte Vérifié (Badge Bleu)</span>
                    <p className="text-[11px] text-zinc-500">Affiche la coche bleue Twitter officielle</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editIsVerified}
                  onChange={(e) => setEditIsVerified(e.target.checked)}
                  className="w-4 h-4 accent-[#1D9BF0] cursor-pointer"
                />
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
