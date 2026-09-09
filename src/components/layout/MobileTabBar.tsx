/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — MOBILE TAB BAR (src/components/layout/MobileTabBar.tsx)
 * Barre d'onglets fixe en bas (< 640px) + FABs Composer & mAI, safe-areas iOS
 * ============================================================================
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Home,
  Compass,
  Sparkles,
  PenSquare,
  Bell,
  MessageCircle,
  Library,
  User as UserIcon,
} from 'lucide-react';

interface MobileTabBarProps {
  onOpenComposer: () => void;
  onToggleMAIDrawer: () => void;
  unreadNotifications?: number;
  unreadMessages?: number;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  onOpenComposer,
  onToggleMAIDrawer,
  unreadNotifications = 0,
  unreadMessages = 0,
}) => {
  const location = useLocation();
  const { user } = useAuth();
  const profilePath = user?.username ? `/@${user.username}` : '/profile';

  const isProfileActive =
    location.pathname.startsWith('/@') ||
    location.pathname === '/profile' ||
    (user?.username && location.pathname === `/${user.username}`);

  const tabs = [
    { path: '/', label: 'Accueil', icon: Home, active: location.pathname === '/', badge: 0 },
    { path: '/explore', label: 'Explorer', icon: Compass, active: location.pathname.startsWith('/explore'), badge: 0 },
    { path: '/notifications', label: 'Notifications', icon: Bell, active: location.pathname.startsWith('/notifications'), badge: unreadNotifications },
    { path: '/messages', label: 'Messages', icon: MessageCircle, active: location.pathname.startsWith('/messages'), badge: unreadMessages },
    { path: '/books', label: 'Livres', icon: Library, active: location.pathname.startsWith('/books'), badge: 0 },
    { path: profilePath, label: 'Profil', icon: UserIcon, active: Boolean(isProfileActive), badge: 0 },
  ];

  return (
    <>
      {/* FABs empilés : mAI + Composer, au-dessus de la barre */}
      <div className="sm:hidden fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2.5">
        <button
          onClick={onToggleMAIDrawer}
          aria-label="Ouvrir l'assistant mAI"
          className="p-3.5 rounded-2xl text-white active:scale-90 transition-transform liquid-glass"
        >
          <Sparkles className="w-5 h-5" />
        </button>
        <button
          onClick={onOpenComposer}
          aria-label="Publier une vibe"
          className="p-3.5 rounded-2xl bg-white text-black shadow-xl active:scale-90 transition-transform"
        >
          <PenSquare className="w-5 h-5" />
        </button>
      </div>

      {/* Barre d'onglets fixe */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-black/85 backdrop-blur-2xl border-t border-zinc-800 pb-safe">
        <div className="grid grid-cols-6 items-stretch">
          {tabs.map(({ path, label, icon: Icon, active, badge }) => (
            <Link
              key={label}
              to={path}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] py-2 transition-colors ${
                active ? 'text-white' : 'text-zinc-500 active:text-zinc-300'
              }`}
            >
              <span className="relative">
                <Icon className={`w-[1.35rem] h-[1.35rem] ${active ? 'stroke-[2.4]' : ''}`} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] leading-none ${active ? 'font-bold' : 'font-medium'}`}>
                {label}
              </span>
              {active && (
                <span
                  className="absolute top-0 h-0.5 w-8 rounded-full"
                  style={{ backgroundColor: 'var(--vibe-accent, #ffffff)' }}
                />
              )}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
};
