/**
 * ============================================================================
 * VIBE — MODALE DE PARTAGE DE POST (src/components/feed/PostShareModal.tsx)
 * Trois modes de partage d'une publication :
 *   • Message  (onglet par défaut) — envoi par DM à un utilisateur recherché
 *   • Lien     — permalink copiable + partage natif (Web Share API)
 *   • QR Code  — QR simple du permalink, téléchargeable en PNG
 * ============================================================================
 */

import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Search,
  Send,
  Link2,
  QrCode,
  MessageSquare,
  Check,
  Copy,
  Share2,
  Download,
  Loader2,
  UserPlus
} from 'lucide-react';
import type { Post } from '../../types/vibe';
import { ApiService } from '../../services/api';
import { NotificationService } from '../../services/notificationService';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { VerifiedBadge } from '../common/VerifiedBadge';

interface PostShareModalProps {
  post: Post;
  onClose: () => void;
}

type ShareTab = 'message' | 'link' | 'qr';

interface SearchedUser {
  id: number | string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
}

export const PostShareModal: React.FC<PostShareModalProps> = ({ post, onClose }) => {
  const [tab, setTab] = useState<ShareTab>('message');

  const postUrl = useMemo(
    () => `${window.location.origin}/post/${post.id}`,
    [post.id]
  );

  // Snippet du message de partage : auteur + extrait + lien
  const defaultShareMessage = useMemo(() => {
    const plain = (post.content || '').replace(/<[^>]*>/g, ' ').trim();
    const excerpt = plain.length > 80 ? `${plain.slice(0, 80)}…` : plain;
    return excerpt ? `À voir sur Vibe — @${post.username} : « ${excerpt} »\n${postUrl}` : `À voir sur Vibe : ${postUrl}`;
  }, [post.content, post.username, postUrl]);

  // ── Onglet Message (DM) ──────────────────────────────────────────────
  const [recipientQuery, setRecipientQuery] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchedUser | null>(null);
  const [dmMessage, setDmMessage] = useState(defaultShareMessage);
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Recherche d'utilisateurs (debounce 300 ms, comme MessagesPage)
  useEffect(() => {
    if (tab !== 'message' || selectedUser) return;
    const q = recipientQuery.trim();
    if (!q) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await ApiService.searchUsers(q.replace(/^@/, ''));
        setResults((res?.users || []).filter((u) => String(u.username).toLowerCase() !== String(post.username).toLowerCase()));
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [recipientQuery, tab, selectedUser, post.username]);

  const handleSendDM = async () => {
    if (!selectedUser || isSending) return;
    setIsSending(true);
    try {
      const res = await ApiService.sendMessage(selectedUser.id, dmMessage.trim());
      if (res?.success) {
        setSentTo(selectedUser.username);
        NotificationService.showInAppToast(
          'Publication partagée',
          `Envoyée en message privé à @${selectedUser.username}.`,
          'success'
        );
      } else {
        NotificationService.showInAppToast('Envoi impossible', "Le message n'a pas pu être envoyé.", 'error');
      }
    } catch (err: any) {
      NotificationService.showInAppToast('Envoi impossible', err?.message || "Le message n'a pas pu être envoyé.", 'error');
    } finally {
      setIsSending(false);
    }
  };

  // ── Onglet Lien ──────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      NotificationService.showInAppToast('Copie impossible', 'Copiez le lien manuellement.', 'error');
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: `Post de @${post.username}`, text: 'À voir sur Vibe', url: postUrl });
    } catch (err: any) {
      if (err?.name !== 'AbortError') await handleCopyLink();
    }
  };

  // ── Onglet QR Code ───────────────────────────────────────────────────
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (tab !== 'qr') return;
    let cancelled = false;
    QRCode.toDataURL(postUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 480,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, postUrl]);

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `vibe-post-${post.id.slice(0, 8)}.png`;
    link.click();
  };

  const tabs: Array<{ key: ShareTab; label: string; icon: React.ElementType }> = [
    { key: 'message', label: 'Message', icon: MessageSquare },
    { key: 'link', label: 'Lien', icon: Link2 },
    { key: 'qr', label: 'QR Code', icon: QrCode },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-mediaIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Partager cette vibe
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white p-1.5 rounded-full hover:bg-zinc-900 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-zinc-800">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors relative ${
                tab === key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {tab === key && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-white rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* ── MESSAGE (DM, par défaut) ── */}
          {tab === 'message' && (
            <div className="space-y-4">
              {sentTo ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <Check className="w-6 h-6 text-emerald-400" />
                  </div>
                  <p className="text-sm text-white font-bold">Partagé avec @{sentTo} !</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSentTo(null);
                        setSelectedUser(null);
                        setRecipientQuery('');
                      }}
                      className="px-4 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-colors"
                    >
                      Partager à quelqu'un d'autre
                    </button>
                    <button
                      onClick={onClose}
                      className="px-4 py-2 rounded-full border border-zinc-700 text-zinc-300 text-xs font-bold hover:bg-zinc-900 transition-colors"
                    >
                      Terminer
                    </button>
                  </div>
                </div>
              ) : selectedUser ? (
                <>
                  <div className="flex items-center gap-3 p-3 rounded-2xl border border-zinc-800 bg-zinc-900/60">
                    <ProfileAvatar
                      src={selectedUser.avatar_url}
                      alt={selectedUser.username}
                      size="sm"
                      fallbackName={selectedUser.username}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-white truncate">
                          {selectedUser.display_name || selectedUser.username}
                        </span>
                        <VerifiedBadge isVerified={selectedUser.is_verified} size="xs" />
                      </div>
                      <span className="text-xs text-zinc-500">@{selectedUser.username}</span>
                    </div>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="text-zinc-500 hover:text-white text-xs font-bold p-1.5 rounded-full hover:bg-zinc-800 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={dmMessage}
                    onChange={(e) => setDmMessage(e.target.value)}
                    rows={4}
                    className="w-full bg-transparent border border-zinc-800 rounded-2xl p-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 resize-none"
                    placeholder="Message à envoyer…"
                  />
                  <button
                    onClick={handleSendDM}
                    disabled={isSending || !dmMessage.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Envoyer en message privé
                  </button>
                </>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={recipientQuery}
                      onChange={(e) => setRecipientQuery(e.target.value)}
                      placeholder="Rechercher un compte à qui envoyer…"
                      autoFocus
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-zinc-900 rounded-2xl border border-zinc-800">
                    {isSearching && (
                      <div className="flex items-center gap-2 p-3 text-xs text-zinc-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Recherche…
                      </div>
                    )}
                    {!isSearching && recipientQuery.trim() && results.length === 0 && (
                      <div className="p-3 text-xs text-zinc-500">Aucun compte trouvé.</div>
                    )}
                    {!recipientQuery.trim() && (
                      <div className="flex items-center gap-2 p-3 text-xs text-zinc-500">
                        <UserPlus className="w-3.5 h-3.5" />
                        Tapez un nom d'utilisateur pour partager en DM.
                      </div>
                    )}
                    {results.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setSelectedUser(u);
                          setDmMessage(defaultShareMessage);
                        }}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-900 transition-colors"
                      >
                        <ProfileAvatar
                          src={u.avatar_url}
                          alt={u.username}
                          size="sm"
                          fallbackName={u.username}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-white truncate">
                              {u.display_name || u.username}
                            </span>
                            <VerifiedBadge isVerified={u.is_verified} size="xs" />
                          </div>
                          <span className="text-xs text-zinc-500">@{u.username}</span>
                        </div>
                        <Send className="w-4 h-4 text-zinc-500" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── LIEN ── */}
          {tab === 'link' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 break-all font-mono">
                {postUrl}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Lien copié !' : 'Copier le lien'}
                </button>
                {'share' in navigator && (
                  <button
                    onClick={handleNativeShare}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-zinc-700 text-zinc-300 text-sm font-bold hover:bg-zinc-900 transition-colors"
                    title="Partage natif"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500 text-center">
                Toute personne disposant du lien peut voir cette publication.
              </p>
            </div>
          )}

          {/* ── QR CODE ── */}
          {tab === 'qr' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-white rounded-2xl shadow-lg">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR Code du post" className="w-48 h-48" />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-500 text-center">
                  Scannez pour ouvrir la publication
                </p>
              </div>
              <button
                onClick={handleDownloadQr}
                disabled={!qrDataUrl}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Télécharger le QR Code
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
