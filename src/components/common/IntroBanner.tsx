/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — INTRO VIDEO BANNER (src/components/common/IntroBanner.tsx)
 * Cinematic video banner introducing the Vibe social network (2026 / mAI)
 * ============================================================================
 */

import React, { useRef, useState, useEffect } from 'react';
import { X, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const INTRO_DISMISS_KEY = 'vibe_intro_dismissed';
const INTRO_SRC = '/videos/vibe-intro.mp4';

export const IntroBanner: React.FC = () => {
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(() => {
    try {
      return localStorage.getItem(INTRO_DISMISS_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Lecture automatique : certains navigateurs bloquent le autoplay sonore,
  // on retente en forçant le mute.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.play().catch(() => {});
  }, [isVisible]);

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(INTRO_DISMISS_KEY, '1');
    } catch {}
  };

  const handleReplay = () => {
    try {
      localStorage.removeItem(INTRO_DISMISS_KEY);
    } catch {}
    setIsVisible(true);
  };

  return (
    <>
      {isVisible && (
        <div className="relative mx-3 sm:mx-4 mt-3 rounded-3xl overflow-hidden border border-zinc-800 bg-black group animate-fadeIn">
          <video
            ref={videoRef}
            src={INTRO_SRC}
            className="w-full aspect-video sm:aspect-[21/9] object-cover"
            autoPlay
            loop
            muted={isMuted}
            playsInline
            preload="metadata"
          />

          {/* Overlay contrôles */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              onClick={() => setIsMuted((m) => !m)}
              title={isMuted ? 'Activer le son' : 'Couper le son'}
              className="p-2 rounded-full bg-black/50 border border-white/15 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDismiss}
              title="Masquer la bannière"
              className="p-2 rounded-full bg-black/50 border border-white/15 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-300">2026</p>
              <h2 className="text-xl sm:text-3xl font-black text-white drop-shadow-lg tracking-tight">
                Bienvenue, @{user?.username || 'utilisateur'}
              </h2>
              <p className="text-[11px] sm:text-xs text-zinc-300 mt-0.5 truncate">
                Le réseau social propulsé par mAI — découvrez l'expérience en vidéo.
              </p>
            </div>
            <button
              onClick={handleReplay}
              className="hidden sm:flex shrink-0 items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Revoir
            </button>
          </div>
        </div>
      )}

      {!isVisible && (
        <div className="mx-3 sm:mx-4 mt-3">
          <button
            onClick={handleReplay}
            className="text-[11px] font-mono text-zinc-500 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3" />
            Revoir la vidéo de présentation de Vibe
          </button>
        </div>
      )}
    </>
  );
};
