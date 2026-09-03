/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — MOBILE SIDE NAV (src/components/layout/MobileNav.tsx)
 * Liquid Glass retractable side navigation for mobile (< 640px)
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Home,
  Compass,
  Sparkles,
  PenSquare,
  Bell,
  MessageCircle,
  Settings,
  User as UserIcon,
  Menu,
  X
} from 'lucide-react';
import { VibeLogo } from './VibeLogo';
import { ProfileAvatar } from '../common/ProfileAvatar';

interface MobileNavProps {
  onOpenComposer: () => void;
  avatarUrl?: string | null;
  unreadNotifications?: number;
  unreadMessages?: number;
}

const NAV_ITEMS = [
  { path: '/', label: 'Accueil', icon: Home, exact: true },
  { path: '/explore', label: 'Explorer', icon: Compass },
  { path: '/notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' as const },
  { path: '/messages', label: 'Messages', icon: MessageCircle, badgeKey: 'messages' as const },
  { path: '/mai', label: 'mAI', icon: Sparkles },
  { path: '/settings', label: 'Paramètres', icon: Settings },
];

export const MobileNav: React.FC<MobileNavProps> = ({
  onOpenComposer,
  avatarUrl,
  unreadNotifications = 0,
  unreadMessages = 0,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const profilePath = user?.username ? `/@${user.username}` : '/profile';

  // Fermer le drawer au changement de route
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Fermer avec Échap
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <>
      {/* Bouton flottant (FAB) — toujours visible sur mobile */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Ouvrir la navigation"
        className="sm:hidden fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-4 z-50 p-3 rounded-2xl text-white active:scale-90 transition-transform liquid-glass"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="sm:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fadeIn"
        />
      )}

      {/* Panneau latéral Liquid Glass */}
      <aside
        className={`sm:hidden fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[82vw] p-4 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex-1 rounded-3xl border border-white/15 shadow-2xl liquid-glass-panel overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <VibeLogo size={28} showText={true} />
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Fermer"
              className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Profil rapide */}
          <Link
            to={profilePath}
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-4 border-b border-white/10 text-left hover:bg-white/5 transition-colors"
          >
            <ProfileAvatar
              src={avatarUrl}
              alt="Profil"
              fallbackName={user?.username}
              size="md"
              className="border border-white/20"
            />
            <span className="text-xs font-semibold text-white">Voir mon profil</span>
          </Link>

          {/* Items */}
          <nav className="flex-1 overflow-y-auto p-2 space-y-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon, badgeKey, exact }) => {
              const active = exact ? location.pathname === '/' : location.pathname.startsWith(path);
              const badge =
                badgeKey === 'notifications' ? unreadNotifications :
                badgeKey === 'messages' ? unreadMessages : 0;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                    active
                      ? 'bg-white/20 text-white shadow-inner'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  {badge > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              );
            })}
            <Link
              to={profilePath}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                location.pathname.startsWith('/@') ||
                location.pathname === '/profile' ||
                (user?.username && location.pathname === `/${user.username}`)
                  ? 'bg-white/20 text-white shadow-inner'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              <UserIcon className="w-5 h-5 shrink-0" />
              <span className="flex-1 text-left">Profil</span>
            </Link>
          </nav>

          {/* Composer */}
          <div className="p-3 border-t border-white/10">
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenComposer();
              }}
              className="w-full py-3 rounded-2xl bg-white text-black font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <PenSquare className="w-4 h-4" />
              <span>Publier</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
