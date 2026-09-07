/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — PROFILE SHARE MODAL (src/components/profile/ProfileShareModal.tsx)
 * Partage de profil minimaliste (noir & blanc) : QR Code avec logo intégré,
 * copie du lien & téléchargement du QR. Aucune configuration de couleur,
 * aucun partage externe, aucune intégration web.
 * ============================================================================
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Download, Loader2, AlertCircle } from 'lucide-react';
import type { Profile } from '../../types/vibe';
import { VerifiedBadge } from '../common/VerifiedBadge';

interface ProfileShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  targetUsername: string;
  isVerified?: boolean;
  tier?: string | null;
}

const QR_CANVAS_SIZE = 560; // rendu haute définition (affiché en ~240px)
const LOGO_SIZE_RATIO = 0.24;

export const ProfileShareModal: React.FC<ProfileShareModalProps> = ({
  isOpen,
  onClose,
  profile,
  targetUsername,
  isVerified = false,
  tier = null,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const cleanUsername = targetUsername.replace(/^@/, '');
  const displayName = profile?.displayName || cleanUsername;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://vibe.app';
  const profileUrl = `${origin}/@${cleanUsername}`;

  /**
   * Dessine le QR Code noir & blanc avec le logo Vibe intégré au centre :
   * matrice générée par `qrcode` (niveau H de correction pour compenser
   * la zone couverte par le logo), rendu manuel sur canvas.
   */
  const drawQR = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;
    setIsGenerating(true);
    setError(null);
    try {
      const qr = QRCode.create(profileUrl, { errorCorrectionLevel: 'H' });
      const size = qr.modules.size;
      const data = qr.modules.data;

      const quietZone = 2; // modules de marge blanche
      const totalCells = size + quietZone * 2;
      const cell = QR_CANVAS_SIZE / totalCells;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponible');
      canvas.width = QR_CANVAS_SIZE;
      canvas.height = QR_CANVAS_SIZE;

      // Fond blanc (QR noir sur blanc, thème minimaliste)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, QR_CANVAS_SIZE, QR_CANVAS_SIZE);
      ctx.fillStyle = '#000000';
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (data[row * size + col]) {
            const x = (col + quietZone) * cell;
            const y = (row + quietZone) * cell;
            ctx.fillRect(x, y, Math.ceil(cell), Math.ceil(cell));
          }
        }
      }

      // Logo au centre, sur une pastille blanche arrondie
      const logo = new Image();
      logo.src = '/logo.png';
      await new Promise<void>((resolve) => {
        if (logo.complete && logo.naturalWidth > 0) {
          resolve();
          return;
        }
        logo.onload = () => resolve();
        logo.onerror = () => resolve();
        setTimeout(() => resolve(), 4000);
      });

      if (logo.naturalWidth > 0) {
        const logoSize = QR_CANVAS_SIZE * LOGO_SIZE_RATIO;
        const lx = (QR_CANVAS_SIZE - logoSize) / 2;
        const ly = (QR_CANVAS_SIZE - logoSize) / 2;
        const pad = logoSize * 0.12;
        const badgeSize = logoSize + pad * 2;
        const radius = badgeSize * 0.22;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(lx - pad, ly - pad, badgeSize, badgeSize, radius);
        ctx.fill();
        ctx.drawImage(logo, lx, ly, logoSize, logoSize);
      }
      setIsGenerating(false);
    } catch (err: any) {
      console.warn('[ProfileShare] Erreur génération QR:', err);
      setError('Impossible de générer le QR Code.');
      setIsGenerating(false);
    }
  }, [isOpen, profileUrl]);

  useEffect(() => {
    if (isOpen) {
      setIsCopied(false);
      drawQR();
    }
  }, [isOpen, drawQR]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
    } catch {
      // Fallback pour contextes sans Clipboard API
      const input = document.createElement('input');
      input.value = profileUrl;
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy');
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2200);
      } catch {}
      document.body.removeChild(input);
    }
  };

  const handleDownloadQR = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vibe-qr-${cleanUsername}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }, 'image/png');
    } catch (err) {
      console.warn('[ProfileShare] Erreur téléchargement QR:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn h-dvh"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-black/60">
          <span className="text-xs font-bold text-black dark:text-white uppercase font-mono tracking-wider">
            Partager le profil
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-black dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900 transition-colors"
          >
            <X className="w-5 h-5 text-black dark:text-white" />
          </button>
        </div>

        {/* Corps : identité + QR Code minimaliste */}
        <div className="p-6 flex flex-col items-center space-y-5">
          <div className="flex items-center gap-3 self-stretch">
            {profile?.avatarUrl && (
              <img
                src={profile.avatarUrl}
                alt={displayName}
                className="w-11 h-11 rounded-full border border-zinc-800 object-cover"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-black dark:text-white truncate">{displayName}</span>
                <VerifiedBadge isVerified={isVerified} tier={tier ?? undefined} size="sm" />
              </div>
              <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">@{cleanUsername}</span>
            </div>
          </div>

          <div className="relative p-3 bg-white border border-zinc-200 rounded-2xl shadow-sm">
            <canvas
              ref={canvasRef}
              className="block w-60 h-60"
              aria-label={`QR Code du profil @${cleanUsername}`}
            />
            {isGenerating && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-2xl">
                <Loader2 className="w-6 h-6 animate-spin text-black" />
              </div>
            )}
          </div>

          <div className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-black border border-zinc-300 dark:border-zinc-800 text-center">
            <span className="text-[11px] text-black dark:text-zinc-400 font-mono break-all">{profileUrl}</span>
          </div>

          {error && (
            <div className="w-full p-2.5 rounded-xl bg-zinc-100 border border-zinc-300 text-[11px] text-black flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-black shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions minimales : copier le lien, télécharger le QR */}
          <div className="w-full space-y-2">
            <button
              onClick={handleCopyLink}
              className="w-full py-3 rounded-2xl bg-white border border-zinc-300 text-black font-bold text-sm hover:bg-zinc-100 transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {isCopied ? <Check className="w-4 h-4 text-black" /> : <Copy className="w-4 h-4 text-black" />}
              <span className="text-black">{isCopied ? 'Lien copié !' : 'Copier le lien'}</span>
            </button>
            <button
              onClick={handleDownloadQR}
              disabled={isGenerating}
              className="w-full py-3 rounded-2xl bg-zinc-100 border border-zinc-300 text-black font-semibold text-sm hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Download className="w-4 h-4 text-black" />
              <span className="text-black">Télécharger le QR Code</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
