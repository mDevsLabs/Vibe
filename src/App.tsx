/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — ROOT APPLICATION (src/App.tsx)
 * Master Layout, Responsive Mobile Bottom Bar, Routing & Modals
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar } from './components/layout/Sidebar';
import { MAIDrawer } from './components/layout/MAIDrawer';
import { PostComposer } from './components/feed/PostComposer';
import { HomePage } from './pages/HomePage';
import { PostDetailPage } from './pages/PostDetailPage';
import { ExplorePage } from './pages/ExplorePage';
import { MessagesPage } from './pages/MessagesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { MAIStudioPage } from './pages/MAIStudioPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthModal } from './pages/AuthModal';
import { Post } from './types/vibe';
import { Home, Compass, Sparkles, PenSquare, X, CheckCircle } from 'lucide-react';
import { InAppToast } from './services/notificationService';

function VibeApp() {
  const { user, profile, isAuthenticated } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [activePostDetailId, setActivePostDetailId] = useState<string | null>(null);
  const [activeProfileUsername, setActiveProfileUsername] = useState<string | null>(null);
  const [isMAIDrawerOpen, setIsMAIDrawerOpen] = useState(false);
  const [isComposerModalOpen, setIsComposerModalOpen] = useState(false);
  const [toasts, setToasts] = useState<InAppToast[]>([]);

  useEffect(() => {
    const handleToast = (e: any) => {
      const newToast: InAppToast = e.detail;
      if (!newToast) return;
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 4000);
    };

    window.addEventListener('vibe:in_app_toast', handleToast);
    return () => {
      window.removeEventListener('vibe:in_app_toast', handleToast);
    };
  }, []);

  const handleOpenThread = (post: Post) => {
    setActivePostDetailId(post.id);
    setCurrentTab('post-detail');
  };

  const handleOpenProfile = (username: string) => {
    setActiveProfileUsername(username);
    setCurrentTab('profile');
  };

  const renderActiveView = () => {
    switch (currentTab) {
      case 'home':
        return (
          <HomePage
            onOpenThread={handleOpenThread}
            onOpenProfile={handleOpenProfile}
          />
        );
      case 'post-detail':
        return activePostDetailId ? (
          <PostDetailPage
            postId={activePostDetailId}
            onBack={() => setCurrentTab('home')}
            onOpenProfile={handleOpenProfile}
          />
        ) : (
          <HomePage
            onOpenThread={handleOpenThread}
            onOpenProfile={handleOpenProfile}
          />
        );
      case 'explore':
        return (
          <ExplorePage
            onOpenProfile={handleOpenProfile}
            onOpenThread={handleOpenThread}
          />
        );
      case 'messages':
        return <MessagesPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'mai':
      case 'mai-studio':
        return <MAIStudioPage />;
      case 'profile':
        return (
          <ProfilePage
            username={activeProfileUsername || undefined}
            onBack={() => {
              setActiveProfileUsername(null);
              setCurrentTab('home');
            }}
            onOpenThread={handleOpenThread}
            onOpenProfile={handleOpenProfile}
          />
        );
      case 'settings':
        return <SettingsPage />;
      default:
        return (
          <HomePage
            onOpenThread={handleOpenThread}
            onOpenProfile={handleOpenProfile}
          />
        );
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <AuthModal isFullScreen isOpen={true} onClose={() => {}} />
      </div>
    );
  }

  const activeAvatar = profile?.avatarUrl || user?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80';

  return (
    <div className="min-h-screen bg-black text-white flex justify-center font-sans antialiased selection:bg-white selection:text-black">
      <div className="w-full max-w-7xl flex relative">
        {/* Left Navigation Sidebar (Desktop / Tablet) */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={(tab) => {
            setActivePostDetailId(null);
            if (tab !== 'profile') setActiveProfileUsername(null);
            setCurrentTab(tab);
          }}
          onOpenComposer={() => setIsComposerModalOpen(true)}
          onToggleMAIDrawer={() => setIsMAIDrawerOpen(!isMAIDrawerOpen)}
        />

        {/* Center Main Viewport (Pleine largeur étendue) */}
        <main className="flex-1 w-full min-h-screen border-r border-zinc-800 pb-16 sm:pb-0">
          {renderActiveView()}
        </main>

        {/* Mobile Bottom Navigation Bar (Mobile < 640px) */}
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/90 backdrop-blur-md border-t border-zinc-800 flex justify-around items-center py-2 px-3">
          <button
            onClick={() => setCurrentTab('home')}
            className={`p-2 rounded-full transition-colors ${currentTab === 'home' ? 'text-white font-bold' : 'text-zinc-500'}`}
            title="Accueil"
          >
            <Home className="w-6 h-6" />
          </button>

          <button
            onClick={() => setCurrentTab('explore')}
            className={`p-2 rounded-full transition-colors ${currentTab === 'explore' ? 'text-white font-bold' : 'text-zinc-500'}`}
            title="Explorer"
          >
            <Compass className="w-6 h-6" />
          </button>

          <button
            onClick={() => setIsComposerModalOpen(true)}
            className="p-3 rounded-full bg-white text-black shadow-lg shadow-white/20 active:scale-90 transition-transform"
            title="Publier"
          >
            <PenSquare className="w-5 h-5" />
          </button>

          <button
            onClick={() => setCurrentTab('mai')}
            className={`p-2 rounded-full transition-colors ${currentTab === 'mai' ? 'text-white font-bold' : 'text-zinc-500'}`}
            title="mAI"
          >
            <Sparkles className="w-6 h-6" />
          </button>

          <button
            onClick={() => setCurrentTab('profile')}
            className="p-1 rounded-full border border-transparent hover:border-zinc-700 transition-colors"
            title="Profil"
          >
            <img
              src={activeAvatar}
              alt="Profil"
              className="w-7 h-7 rounded-full object-cover border border-zinc-700"
            />
          </button>
        </nav>

        {/* Retractable mAI Drawer */}
        <MAIDrawer
          isOpen={isMAIDrawerOpen}
          onClose={() => setIsMAIDrawerOpen(false)}
          onPostCreated={() => {
            if (currentTab === 'home') {
              setCurrentTab('home');
            }
          }}
        />

        {/* Modal Post Composer */}
        {isComposerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-scaleUp">
              <div className="p-3 border-b border-zinc-800 flex justify-between items-center bg-black/60">
                <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">Nouvelle publication</span>
                <button
                  onClick={() => setIsComposerModalOpen(false)}
                  className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <PostComposer
                onPostCreated={() => {
                  setIsComposerModalOpen(false);
                  if (currentTab === 'home') {
                    setCurrentTab('home');
                  }
                }}
              />
            </div>
          </div>
        )}
        {/* Floating In-App Toast Notifications */}
        {toasts.length > 0 && (
          <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className="pointer-events-auto p-4 rounded-2xl bg-zinc-950/95 border border-zinc-700 shadow-2xl backdrop-blur-md flex items-start gap-3 text-xs text-white animate-fadeIn"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-white text-xs">{toast.title}</p>
                  <p className="text-zinc-300 text-[11px] mt-0.5 leading-relaxed">{toast.message}</p>
                </div>
                <button
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="text-zinc-400 hover:text-white p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <VibeApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
