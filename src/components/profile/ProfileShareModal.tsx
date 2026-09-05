/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — PROFILE SHARE MODAL (src/components/profile/ProfileShareModal.tsx)
 * Carte de profil avec QR Code Amélioré, Export Image HD (PNG), Lien & Réseaux
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Copy,
  Check,
  Download,
  Share2,
  Sparkles,
  ExternalLink,
  QrCode,
  Palette,
  Code
} from 'lucide-react';
import type { Profile } from '../../types/vibe';
import { VerifiedBadge } from '../common/VerifiedBadge';

export type CardThemeId = 'neon' | 'oled' | 'aurora' | 'gold';

interface CardTheme {
  id: CardThemeId;
  name: string;
  badge: string;
  qrColor: string;
  qrBg: string;
  gradient: string;
  border: string;
  glow: string;
  accentText: string;
}

const THEMES: CardTheme[] = [
  {
    id: 'neon',
    name: 'Cyber Néon',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    qrColor: '#06b6d4',
    qrBg: '#09090b',
    gradient: 'from-cyan-950/40 via-zinc-900/90 to-purple-950/40',
    border: 'border-cyan-500/40',
    glow: 'shadow-[0_0_35px_rgba(6,182,212,0.25)]',
    accentText: 'text-cyan-400',
  },
  {
    id: 'oled',
    name: 'OLED Minimal',
    badge: 'bg-white/10 text-white border-white/20',
    qrColor: '#ffffff',
    qrBg: '#000000',
    gradient: 'from-zinc-900/80 via-black to-zinc-950',
    border: 'border-zinc-700',
    glow: 'shadow-2xl shadow-black',
    accentText: 'text-white',
  },
  {
    id: 'aurora',
    name: 'Aurore Boréale',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    qrColor: '#10b981',
    qrBg: '#022c22',
    gradient: 'from-emerald-950/50 via-zinc-900 to-teal-950/40',
    border: 'border-emerald-500/40',
    glow: 'shadow-[0_0_35px_rgba(16,185,129,0.25)]',
    accentText: 'text-emerald-400',
  },
  {
    id: 'gold',
    name: 'Or Luxe',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    qrColor: '#f59e0b',
    qrBg: '#1c1917',
    gradient: 'from-amber-950/40 via-zinc-900 to-yellow-950/30',
    border: 'border-amber-500/40',
    glow: 'shadow-[0_0_35px_rgba(245,158,11,0.25)]',
    accentText: 'text-amber-400',
  },
];

interface ProfileShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  targetUsername: string;
  isVerified?: boolean;
  tier?: string | null;
}

export const ProfileShareModal: React.FC<ProfileShareModalProps> = ({
  isOpen,
  onClose,
  profile,
  targetUsername,
  isVerified = false,
  tier = null,
}) => {
  const [selectedTheme, setSelectedTheme] = useState<CardThemeId>('neon');
  const [activeTab, setActiveTab] = useState<'card' | 'link' | 'embed'>('card');
  const [isCopied, setIsCopied] = useState(false);
  const [isEmbedCopied, setIsEmbedCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const cardPreviewRef = useRef<HTMLDivElement>(null);

  const cleanUsername = targetUsername.replace(/^@/, '');
  const displayName = profile?.displayName || cleanUsername;
  const bio = profile?.bio || 'Membre actif de la communauté Vibe.';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://vibe.app';
  const profileUrl = `${origin}/@${cleanUsername}`;

  const currentTheme = THEMES.find((t) => t.id === selectedTheme) || THEMES[0];

  // ============================================================================
  // Dessin du QR Code Amélioré (Enhanced QR Code)
  // Modules arrondis, coins personnalisés et logo central
  // ============================================================================
  const drawEnhancedQRCode = useCallback(
    (canvas: HTMLCanvasElement, theme: CardTheme, size = 260) => {
      try {
        const qr = QRCode.create(profileUrl, { errorCorrectionLevel: 'H' });
        const moduleCount = qr.modules.size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = size;
        canvas.height = size;

        const cellSize = size / moduleCount;
        const cornerRadius = cellSize * 0.42;

        // Arrière-plan QR
        ctx.fillStyle = theme.qrBg;
        ctx.fillRect(0, 0, size, size);

        // Dégradé pour les modules
        const gradient = ctx.createLinearGradient(0, 0, size, size);
        if (theme.id === 'neon') {
          gradient.addColorStop(0, '#06b6d4');
          gradient.addColorStop(0.5, '#3b82f6');
          gradient.addColorStop(1, '#a855f7');
        } else if (theme.id === 'aurora') {
          gradient.addColorStop(0, '#10b981');
          gradient.addColorStop(0.5, '#06b6d4');
          gradient.addColorStop(1, '#6366f1');
        } else if (theme.id === 'gold') {
          gradient.addColorStop(0, '#f59e0b');
          gradient.addColorStop(0.5, '#fbbf24');
          gradient.addColorStop(1, '#f97316');
        } else {
          gradient.addColorStop(0, '#ffffff');
          gradient.addColorStop(1, '#e4e4e7');
        }

        ctx.fillStyle = gradient;

        // Zone centrale réservée pour le logo Vibe
        const centerModuleStart = Math.floor(moduleCount / 2) - 2;
        const centerModuleEnd = Math.floor(moduleCount / 2) + 2;

        // Vérifier si une cellule fait partie d'un motif de recherche de coin (Finder Pattern)
        const isFinderPattern = (r: number, c: number) => {
          return (
            (r < 7 && c < 7) || // Haut-Gauche
            (r < 7 && c >= moduleCount - 7) || // Haut-Droite
            (r >= moduleCount - 7 && c < 7) // Bas-Gauche
          );
        };

        // 1. Dessiner les données du QR Code (hors Finders et centre)
        for (let row = 0; row < moduleCount; row++) {
          for (let col = 0; col < moduleCount; col++) {
            if (isFinderPattern(row, col)) continue;

            // Laisser la place pour le logo central
            if (
              row >= centerModuleStart &&
              row <= centerModuleEnd &&
              col >= centerModuleStart &&
              col <= centerModuleEnd
            ) {
              continue;
            }

            if (qr.modules.get(row, col)) {
              const x = col * cellSize;
              const y = row * cellSize;

              // Dessiner un module avec bords doux
              ctx.beginPath();
              ctx.roundRect(
                x + cellSize * 0.1,
                y + cellSize * 0.1,
                cellSize * 0.8,
                cellSize * 0.8,
                cornerRadius
              );
              ctx.fill();
            }
          }
        }

        // 2. Dessiner les 3 Finder Patterns stylisés (coins arrondis premium)
        const drawFinderPattern = (startRow: number, startCol: number) => {
          const x = startCol * cellSize;
          const y = startRow * cellSize;
          const finderSize = 7 * cellSize;

          // Cadre extérieur
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, y, finderSize, finderSize, cellSize * 1.8);
          ctx.fill();

          // Espace intérieur creux
          ctx.fillStyle = theme.qrBg;
          ctx.beginPath();
          ctx.roundRect(
            x + cellSize,
            y + cellSize,
            finderSize - 2 * cellSize,
            finderSize - 2 * cellSize,
            cellSize * 1.2
          );
          ctx.fill();

          // Cœur central plein
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(
            x + 2 * cellSize,
            y + 2 * cellSize,
            finderSize - 4 * cellSize,
            finderSize - 4 * cellSize,
            cellSize * 0.8
          );
          ctx.fill();
        };

        drawFinderPattern(0, 0); // Haut gauche
        drawFinderPattern(0, moduleCount - 7); // Haut droite
        drawFinderPattern(moduleCount - 7, 0); // Bas gauche

        // 3. Dessiner le badge central "Vibe"
        const centerPx = size / 2;
        const badgeRadius = cellSize * 2.8;

        // Cercle de fond pour isoler le logo
        ctx.save();
        ctx.fillStyle = theme.qrBg;
        ctx.beginPath();
        ctx.arc(centerPx, centerPx, badgeRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = gradient;
        ctx.lineWidth = Math.max(2, cellSize * 0.35);
        ctx.stroke();

        // Fond interne du badge
        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        ctx.arc(centerPx, centerPx, badgeRadius - 2, 0, Math.PI * 2);
        ctx.fill();

        // Texte stylisé "V"
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(badgeRadius * 1.05)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('V', centerPx, centerPx + 1);
        ctx.restore();
      } catch (err) {
        console.error('Erreur génération QR Code:', err);
      }
    },
    [profileUrl]
  );

  // Redessiner le QR code à chaque changement de thème ou d'ouverture
  useEffect(() => {
    if (!isOpen || !qrCanvasRef.current) return;
    drawEnhancedQRCode(qrCanvasRef.current, currentTheme);
  }, [isOpen, currentTheme, drawEnhancedQRCode]);

  if (!isOpen) return null;

  // ============================================================================
  // Copier le lien du profil
  // ============================================================================
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      alert(`Lien du profil : ${profileUrl}`);
    }
  };

  // ============================================================================
  // Copier le code d'intégration HTML (Embed)
  // ============================================================================
  const embedCode = `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#09090b;color:#ffffff;border:1px solid #27272a;border-radius:9999px;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:13px;"><img src="${origin}/logo.png" width="20" height="20" style="border-radius:50%;" />Suivre @${cleanUsername} sur Vibe</a>`;

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setIsEmbedCopied(true);
      setTimeout(() => setIsEmbedCopied(false), 2500);
    } catch {
      alert('Code copié');
    }
  };

  // ============================================================================
  // Partage natif mobile / desktop (Web Share API)
  // ============================================================================
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${displayName} (@${cleanUsername}) sur Vibe`,
          text: `Découvrez le profil de ${displayName} sur Vibe Social Platform !`,
          url: profileUrl,
        });
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  // ============================================================================
  // Téléchargement du QR Code seul
  // ============================================================================
  const handleDownloadQR = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `vibe-qr-${cleanUsername}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setExportNotice('QR Code téléchargé avec succès !');
    setTimeout(() => setExportNotice(null), 3000);
  };

  // ============================================================================
  // Export HD de la Carte de Profil complète (Canvas composite 800x1000px)
  // ============================================================================
  const handleDownloadFullCard = async () => {
    setIsExporting(true);
    setExportNotice('Génération de la carte HD en cours...');
    try {
      const cardWidth = 800;
      const cardHeight = 1000;
      const canvas = document.createElement('canvas');
      canvas.width = cardWidth;
      canvas.height = cardHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Impossible de créer le contexte canvas');

      // 1. Fond principal
      const bgGrad = ctx.createLinearGradient(0, 0, 0, cardHeight);
      bgGrad.addColorStop(0, '#09090b');
      bgGrad.addColorStop(0.5, '#040405');
      bgGrad.addColorStop(1, '#000000');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cardWidth, cardHeight);

      // 2. Halo d'ambiance selon le thème
      const haloGrad = ctx.createRadialGradient(
        cardWidth / 2,
        220,
        20,
        cardWidth / 2,
        220,
        360
      );
      if (selectedTheme === 'neon') {
        haloGrad.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else if (selectedTheme === 'aurora') {
        haloGrad.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else if (selectedTheme === 'gold') {
        haloGrad.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        haloGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = haloGrad;
      ctx.fillRect(0, 0, cardWidth, 450);

      // 3. Carte intérieure avec coins arrondis et bordure
      const cardPadding = 40;
      const innerX = cardPadding;
      const innerY = cardPadding;
      const innerW = cardWidth - cardPadding * 2;
      const innerH = cardHeight - cardPadding * 2;

      ctx.save();
      ctx.fillStyle = '#0e0e11';
      ctx.beginPath();
      ctx.roundRect(innerX, innerY, innerW, innerH, 36);
      ctx.fill();

      ctx.strokeStyle = currentTheme.qrColor;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // 4. Bannière décorative supérieure
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(innerX, innerY, innerW, 160, [36, 36, 0, 0]);
      ctx.clip();
      const bannerGrad = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY + 160);
      if (selectedTheme === 'neon') {
        bannerGrad.addColorStop(0, '#083344');
        bannerGrad.addColorStop(0.5, '#1e1b4b');
        bannerGrad.addColorStop(1, '#09090b');
      } else if (selectedTheme === 'aurora') {
        bannerGrad.addColorStop(0, '#022c22');
        bannerGrad.addColorStop(0.5, '#064e3b');
        bannerGrad.addColorStop(1, '#09090b');
      } else if (selectedTheme === 'gold') {
        bannerGrad.addColorStop(0, '#451a03');
        bannerGrad.addColorStop(0.5, '#78350f');
        bannerGrad.addColorStop(1, '#09090b');
      } else {
        bannerGrad.addColorStop(0, '#27272a');
        bannerGrad.addColorStop(1, '#09090b');
      }
      ctx.fillStyle = bannerGrad;
      ctx.fillRect(innerX, innerY, innerW, 160);
      ctx.restore();

      // 5. Logo Vibe en haut à droite
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('VIBE • SOCIAL', innerX + innerW - 30, innerY + 45);

      // 6. Avatar utilisateur (Cercle avec initiale ou photo)
      const avatarX = cardWidth / 2;
      const avatarY = innerY + 160;
      const avatarRadius = 55;

      // Dessiner anneau avatar
      ctx.save();
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarRadius + 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = currentTheme.qrColor;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Initiales par défaut
      ctx.fillStyle = '#18181b';
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initial = (cleanUsername.charAt(0) || 'V').toUpperCase();
      ctx.fillText(initial, avatarX, avatarY + 2);
      ctx.restore();

      // 7. Nom et Pseudo
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(displayName, cardWidth / 2, avatarY + 80);

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '20px monospace';
      ctx.fillText(`@${cleanUsername}`, cardWidth / 2, avatarY + 112);

      // 8. Bio courte (tronquée avec élégance)
      ctx.fillStyle = '#d4d4d8';
      ctx.font = '17px sans-serif';
      const displayBio = bio.length > 75 ? bio.slice(0, 72) + '...' : bio;
      ctx.fillText(displayBio, cardWidth / 2, avatarY + 148);

      // 9. Dessin du QR Code amélioré directement sur la carte
      const qrTargetSize = 280;
      const qrX = (cardWidth - qrTargetSize) / 2;
      const qrY = avatarY + 175;

      // Cadre pour le QR Code avec ombre
      ctx.save();
      ctx.fillStyle = currentTheme.qrBg;
      ctx.beginPath();
      ctx.roundRect(qrX - 16, qrY - 16, qrTargetSize + 32, qrTargetSize + 32, 24);
      ctx.fill();
      ctx.strokeStyle = currentTheme.qrColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Dessiner le QR Code sur un canvas temporaire puis le coller
      const tempCanvas = document.createElement('canvas');
      drawEnhancedQRCode(tempCanvas, currentTheme, qrTargetSize);
      ctx.drawImage(tempCanvas, qrX, qrY, qrTargetSize, qrTargetSize);

      // 10. Pied de carte & instructions
      ctx.fillStyle = currentTheme.qrColor;
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SCANNEZ POUR OUVRIR LE PROFIL', cardWidth / 2, qrY + qrTargetSize + 48);

      ctx.fillStyle = '#71717a';
      ctx.font = '14px sans-serif';
      ctx.fillText(profileUrl, cardWidth / 2, qrY + qrTargetSize + 72);

      // Téléchargement du résultat PNG
      const link = document.createElement('a');
      link.download = `vibe-carte-${cleanUsername}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setExportNotice('Carte de profil HD téléchargée avec succès !');
      setTimeout(() => setExportNotice(null), 3500);
    } catch (err: any) {
      alert(`Erreur génération carte : ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Liens pour réseaux sociaux
  const shareTwitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `Retrouvez ${displayName} (@${cleanUsername}) sur Vibe Social Platform ! ✨\n${profileUrl}`
  )}`;
  const shareWhatsAppUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `Rejoins mon profil Vibe : ${profileUrl}`
  )}`;
  const shareTelegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
    profileUrl
  )}&text=${encodeURIComponent(`Profil Vibe de ${displayName}`)}`;
  const shareLinkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    profileUrl
  )}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scaleUp">
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>Partager le profil</span>
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  @{cleanUsername}
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Carte visuelle, QR Code amélioré & liens de partage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-zinc-800 bg-black/40">
          <button
            onClick={() => setActiveTab('card')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'card'
                ? 'text-white border-b-2 border-white bg-zinc-900/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Carte & QR Code</span>
          </button>

          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'link'
                ? 'text-white border-b-2 border-white bg-zinc-900/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Lien & Réseaux</span>
          </button>

          <button
            onClick={() => setActiveTab('embed')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'embed'
                ? 'text-white border-b-2 border-white bg-zinc-900/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code className="w-3.5 h-3.5 text-purple-400" />
            <span>Intégration Web</span>
          </button>
        </div>

        {/* Contenu Scrollable */}
        <div className="p-5 overflow-y-auto space-y-5">
          {exportNotice && (
            <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportNotice}</span>
            </div>
          )}

          {/* ========================================================= */}
          {/* ONGLET 1 : CARTE DE PROFIL & QR CODE AMÉLIORÉ             */}
          {/* ========================================================= */}
          {activeTab === 'card' && (
            <div className="space-y-4">
              {/* Sélecteur de Thème */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" /> Style de la carte :
                  </span>
                  <span className="font-semibold text-white">{currentTheme.name}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {THEMES.map((th) => (
                    <button
                      key={th.id}
                      onClick={() => setSelectedTheme(th.id)}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all flex flex-col items-center gap-1 ${
                        selectedTheme === th.id
                          ? `${th.border} bg-zinc-900 text-white shadow-md`
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: th.qrColor }}
                      />
                      <span className="text-[11px] truncate w-full text-center">{th.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Aperçu interactif de la Carte de Profil */}
              <div
                ref={cardPreviewRef}
                className={`relative rounded-3xl p-5 border bg-gradient-to-b ${currentTheme.gradient} ${currentTheme.border} ${currentTheme.glow} transition-all duration-300 overflow-hidden text-center space-y-4`}
              >
                {/* Badge supérieur Vibe */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: currentTheme.qrColor }} />
                    <span className="font-mono uppercase tracking-widest text-[10px] text-zinc-400">
                      VIBE PROFILE CARD
                    </span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${currentTheme.badge}`}>
                    {currentTheme.name}
                  </span>
                </div>

                {/* Profil Header Info */}
                <div className="flex flex-col items-center space-y-2 pt-1">
                  <div
                    className="w-20 h-20 rounded-full border-2 p-0.5 bg-zinc-900 shadow-xl flex items-center justify-center font-bold text-2xl text-white relative"
                    style={{ borderColor: currentTheme.qrColor }}
                  >
                    {profile?.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt="Avatar"
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span>{(cleanUsername.charAt(0) || 'V').toUpperCase()}</span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white flex items-center justify-center gap-1.5">
                      <span>{displayName}</span>
                      <VerifiedBadge isVerified={isVerified} tier={tier || undefined} size="sm" />
                    </h3>
                    <p className="text-xs text-zinc-400 font-mono">@{cleanUsername}</p>
                  </div>

                  <p className="text-xs text-zinc-300 max-w-sm line-clamp-2 px-2">
                    {bio}
                  </p>

                  {/* Compteurs */}
                  <div className="flex items-center gap-4 text-xs pt-1 font-mono text-zinc-400">
                    <span>
                      <strong className="text-white font-bold">{profile?.followingCount || 0}</strong> abonnements
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-white font-bold">{profile?.followersCount || 0}</strong> abonnés
                    </span>
                  </div>
                </div>

                {/* Canvas du QR Code Amélioré */}
                <div className="flex flex-col items-center justify-center py-2">
                  <div
                    className="p-3 rounded-2xl border bg-black/90 shadow-2xl relative group"
                    style={{ borderColor: currentTheme.qrColor }}
                  >
                    <canvas
                      ref={qrCanvasRef}
                      className="rounded-xl max-w-[200px] max-h-[200px] w-full h-auto block"
                    />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 mt-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    Scannez avec l’appareil photo de votre smartphone
                  </span>
                </div>
              </div>

              {/* Boutons d'Action de la Carte */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={handleDownloadFullCard}
                  disabled={isExporting}
                  className="py-3 px-4 rounded-2xl bg-white text-black font-extrabold text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isExporting ? 'Génération...' : "Télécharger l'image de la carte (HD)"}</span>
                </button>

                <button
                  onClick={handleDownloadQR}
                  className="py-3 px-4 rounded-2xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs transition-all flex items-center justify-center gap-2"
                >
                  <QrCode className="w-4 h-4 text-cyan-400" />
                  <span>Télécharger le QR Code seul</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* ONGLET 2 : LIEN & PARTAGE SUR RÉSEAUX SOCIAUX              */}
          {/* ========================================================= */}
          {activeTab === 'link' && (
            <div className="space-y-4">
              {/* Copie du lien direct */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Lien permanent vers votre profil Vibe
                </label>
                <div className="flex items-center gap-2 p-2 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <input
                    type="text"
                    readOnly
                    value={profileUrl}
                    className="flex-1 bg-transparent text-xs text-zinc-200 font-mono px-2 focus:outline-none select-all"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isCopied
                        ? 'bg-emerald-500 text-black'
                        : 'bg-white text-black hover:bg-zinc-200'
                    }`}
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? 'Copié !' : 'Copier'}</span>
                  </button>
                </div>
              </div>

              {/* Bouton Partage Natif Mobile / Desktop */}
              <button
                onClick={handleNativeShare}
                className="w-full py-3 px-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/30"
              >
                <Share2 className="w-4 h-4" />
                <span>Partager via les applications de votre appareil</span>
              </button>

              {/* Liens de partage direct vers réseaux */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-mono uppercase text-zinc-400 block">
                  Partager directement sur :
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <a
                    href={shareTwitterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>X (Twitter)</span>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                  </a>

                  <a
                    href={shareWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 hover:bg-emerald-950/50 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>WhatsApp</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                  </a>

                  <a
                    href={shareTelegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-2xl bg-sky-950/30 border border-sky-800/40 hover:bg-sky-950/50 text-sky-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>Telegram</span>
                    <ExternalLink className="w-3.5 h-3.5 text-sky-500" />
                  </a>

                  <a
                    href={shareLinkedInUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-2xl bg-blue-950/30 border border-blue-800/40 hover:bg-blue-950/50 text-blue-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>LinkedIn</span>
                    <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* ONGLET 3 : INTÉGRATION WEB (BADGE EMBED)                   */}
          {/* ========================================================= */}
          {activeTab === 'embed' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Badge HTML pour site web, blog ou GitHub
                </label>
                <div className="relative">
                  <textarea
                    readOnly
                    rows={4}
                    value={embedCode}
                    className="w-full p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono focus:outline-none select-all"
                  />
                  <button
                    onClick={handleCopyEmbed}
                    className="absolute top-2 right-2 py-1.5 px-3 rounded-xl bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-all flex items-center gap-1 shadow"
                  >
                    {isEmbedCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{isEmbedCopied ? 'Copié !' : 'Copier le code'}</span>
                  </button>
                </div>
              </div>

              {/* Aperçu du badge */}
              <div className="space-y-2">
                <span className="text-xs font-mono uppercase text-zinc-400 block">
                  Aperçu du badge de suivi :
                </span>
                <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-center">
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 py-2 px-4 rounded-full bg-black border border-zinc-700 text-white text-xs font-semibold hover:border-zinc-500 transition-colors shadow"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    <span>Suivre @{cleanUsername} sur Vibe</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between text-xs text-zinc-500">
          <span className="font-mono">Vibe Social Platform</span>
          <button
            onClick={onClose}
            className="py-2 px-5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
