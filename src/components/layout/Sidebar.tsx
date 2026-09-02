/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — SIDEBAR (src/components/layout/Sidebar.tsx)
 * Primary Navigation Bar with Centered Circular Shadows & mAI Actions
 * ============================================================================
 */

import React from 'react';
import {
  Home,
  Compass,
  Bell,
  Mail,
  User as UserIcon,
  Sparkles,
  Settings,
  PenSquare,
  LogOut,
  Sun,
  Moon,
  Laptop
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { VibeLogo } from './VibeLogo';
import { VerifiedBadge } from '../common/VerifiedBadge';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenComposer: () => void;
  onToggleMAIDrawer: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenComposer,
  onToggleMAIDrawer,
}) => {
  const { user, profile, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { id: 'home', label: 'Accueil', icon: Home },
    { id: 'explore', label: 'Explorer', icon: Compass },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: 0 },
    { id: 'messages', label: 'Messages', icon: Mail },
    { id: 'mai', label: 'mAI', icon: Sparkles },
    { id: 'profile', label: 'Profil', icon: UserIcon },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  const activeAvatar = profile?.avatarUrl || user?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80';

  return (
    <aside className="hidden sm:flex w-16 sm:w-20 xl:w-64 h-screen sticky top-0 border-r border-zinc-800 flex-col justify-between p-2 sm:p-3 xl:p-4 bg-black select-none z-30 shrink-0">
      {/* Brand & Nav List */}
      <div className="space-y-4">
        {/* Brand Logo */}
        <div
          onClick={() => setCurrentTab('home')}
          className="cursor-pointer mx-auto xl:mx-0 w-fit p-1.5 flex items-center justify-center"
          title="Accueil Vibe"
        >
          <VibeLogo size={40} showText={false} />
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5 flex flex-col items-center xl:items-stretch">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id || (item.id === 'mai' && currentTab === 'mai-studio');
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-12 h-12 xl:w-full xl:h-auto p-0 xl:px-4 xl:py-3 rounded-full text-sm font-semibold transition-all flex items-center justify-center xl:justify-start gap-4 group ${
                  isActive
                    ? 'bg-zinc-900 text-white font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-950'
                }`}
                title={item.label}
              >
                <div className="relative flex items-center justify-center">
                  <Icon className={`w-6 h-6 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : ''}`} />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <span className="hidden xl:inline text-base">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Action Button: Publier & Assistant mAI */}
        <div className="pt-2 space-y-2 flex flex-col items-center xl:items-stretch">
          <button
            onClick={onOpenComposer}
            className="w-12 h-12 xl:w-full xl:h-auto xl:py-3.5 xl:px-4 rounded-full bg-white text-black font-bold text-sm xl:text-base hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
            title="Publier un Vibe"
          >
            <PenSquare className="w-5 h-5 shrink-0" />
            <span className="hidden xl:inline">Publier</span>
          </button>

          <button
            onClick={onToggleMAIDrawer}
            className="w-12 h-12 xl:w-full xl:h-auto xl:py-2.5 xl:px-4 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium text-xs hover:bg-zinc-800 hover:text-white transition-all flex items-center justify-center gap-2"
            title="Assistant mAI"
          >
            <Sparkles className="w-4 h-4 text-white shrink-0" />
            <span className="hidden xl:inline">Assistant mAI</span>
          </button>
        </div>
      </div>

      {/* User Footer Card & Logout */}
      <div className="pt-4 border-t border-zinc-900 space-y-2">
        <div className="flex items-center justify-between p-1.5 xl:p-2 rounded-2xl bg-zinc-950 border border-zinc-800/80 hover:bg-zinc-900 transition-all">
          <div
            className="flex items-center gap-3 cursor-pointer overflow-hidden flex-1 justify-center xl:justify-start"
            onClick={() => setCurrentTab('profile')}
            title="Voir mon profil"
          >
            <img
              src={activeAvatar}
              alt="Avatar"
              className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0"
            />
            <div className="hidden xl:flex flex-col truncate min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-white truncate">{profile?.displayName || user?.username || 'Utilisateur'}</span>
                <VerifiedBadge isVerified={(profile as any)?.is_verified || (user as any)?.is_verified} tier={user?.tier} size="xs" />
              </div>
              <span className="text-[11px] text-zinc-500 font-mono">@{user?.username}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (theme === 'light') setTheme('dark');
                else if (theme === 'dark') setTheme('system');
                else setTheme('light');
              }}
              title={`Changer de thème (Actuel : ${theme === 'light' ? 'Clair' : theme === 'dark' ? 'Sombre' : 'Système'})`}
              className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-zinc-800 transition-all flex items-center justify-center shrink-0"
            >
              {theme === 'light' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : theme === 'dark' ? (
                <Moon className="w-4 h-4 text-indigo-400" />
              ) : (
                <Laptop className="w-4 h-4 text-sky-400" />
              )}
            </button>
            <button
              onClick={logout}
              title="Se déconnecter"
              className="hidden xl:flex text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-zinc-800 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
