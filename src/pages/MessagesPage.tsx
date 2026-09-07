/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — DIRECT MESSAGES (src/pages/MessagesPage.tsx)
 * Private chats with multi-media (up to 5 images / 2 videos / 50 MB), speech & privacy controls
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  ArrowUp,
  Plus,
  Image as ImageIcon,
  Mic,
  MicOff,
  Search,
  ArrowLeft,
  Check,
  Eye,
  Lock,
  Mail,
  Loader2,
  AlertCircle,
  X,
  MoreVertical,
  Reply,
  Forward,
  Copy,
  Sparkles,
  Flag,
  Trash2,
  Ban,
  Pencil,
  Scissors,
  Expand,
  Drama,
  Wand2,
  PenLine,
  Info,
  Palette
} from 'lucide-react';
import { ApiService } from '../services/api';
import { RealtimeService } from '../services/realtimeService';
import { DirectMessage, DMConversation } from '../types/vibe';
import { useAuth } from '../context/AuthContext';
import { useTheme, MESSAGE_BUBBLE_THEMES, CHAT_BACKGROUND_THEMES, MESSAGE_BUBBLE_SHAPES, MessageBubbleShape } from '../context/ThemeContext';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { VerifiedBadge } from '../components/common/VerifiedBadge';
import { ProfileAvatar } from '../components/common/ProfileAvatar';
import { RichContent } from '../components/common/RichContent';

interface AttachedMedia {
  url: string;
  type: 'image' | 'video';
  size: number;
}

export const MessagesPage: React.FC = () => {
  const { user } = useAuth();
  const {
    messageBubbleTheme,
    setMessageBubbleTheme,
    chatBackgroundTheme,
    setChatBackgroundTheme,
    messageBubbleShape,
    setMessageBubbleShape,
  } = useTheme();

  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [activePartnerId, setActivePartnerId] = useState<string | number | null>(null);
  const [activePartner, setActivePartner] = useState<{ id: string | number; username: string; display_name?: string; avatar_url?: string } | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [attachedMediaList, setAttachedMediaList] = useState<AttachedMedia[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Menu + d'import et options IA
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);

  // Édition de message (limite 60 minutes)
  const [editingMessage, setEditingMessage] = useState<DirectMessage | null>(null);

  // Modale Informations de message (date/heure, reçu, lu...)
  const [infoModalMessage, setInfoModalMessage] = useState<DirectMessage | null>(null);

  // Modale rapide de thème de discussion
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  // Interactions par message : réactions, réponse, transfert, copie
  const REACTION_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
  const [actionMenuFor, setActionMenuFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<DirectMessage | null>(null);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [customPresetOpen, setCustomPresetOpen] = useState(false);
  const [customPresetText, setCustomPresetText] = useState('');

  // Modération : menu conversation, renommage, signalement, blocage, suppression
  const [convMenuOpen, setConvMenuOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Spam ou arnaque');
  const [isModerating, setIsModerating] = useState(false);

  const REPORT_REASONS = ['Spam ou arnaque', 'Harcèlement', 'Contenu haineux ou violent', 'Contenu illégal', 'Impersonation', 'Autre'];

  // Conversation active dérivée de la liste (nom personnalisé, état de blocage…)
  const activeConv = conversations.find((c) => String(c.partner_id) === String(activePartnerId)) || null;
  const activePartnerBlocked = Boolean(activeConv?.is_blocked);

  // New conversation user search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string | number; username: string; display_name?: string; avatar_url?: string; is_verified?: boolean; tier?: string }>>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Indicateur de frappe du partenaire (« @x est en train d'écrire… »)
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Heartbeat de notre propre frappe (throttlé côté client)
  const lastTypingSentRef = useRef(0);

  const {
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    onResult: (text) => {
      setMessageInput((prev) => (prev ? `${prev} ${text}` : text));
    },
  });

  const fetchConversations = useCallback(async () => {
    try {
      const res = await ApiService.getConversations();
      // Si une conversation est actuellement affichée, son compteur de non lu passe à 0
      const list = (res.conversations || []).map((c) =>
        activePartnerId && String(c.partner_id) === String(activePartnerId)
          ? { ...c, unread_count: 0 }
          : c
      );
      setConversations(list);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, [activePartnerId]);

  const fetchMessages = useCallback(async (partnerId: string | number) => {
    try {
      // Invalider le cache pour forcer la lecture réelle et fraîche
      ApiService.invalidateCache(`/v1/dms/messages/${partnerId}`);
      const res = await ApiService.getMessages(partnerId);
      setMessages(res.messages || []);

      // Supprimer immédiatement le point/badge de non lu sur la conversation ouverte
      setConversations((prev) =>
        prev.map((c) =>
          String(c.partner_id) === String(partnerId)
            ? { ...c, unread_count: 0 }
            : c
        )
      );

      // Invalider le cache des conversations et actualiser les badges globaux
      ApiService.invalidateCache('/dms/conversations');
      ApiService.invalidateCache('/unread_count');
      window.dispatchEvent(new CustomEvent('vibe:unread_updated'));

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err: any) {
      setErrorMessage(err.message || 'Impossible de charger les messages.');
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    // Filet de sécurité : rafraîchissement léger toutes les 60 s.
    // L'instantanéité est assurée par le flux SSE (RealtimeService).
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (activePartnerId) fetchMessages(activePartnerId);
      fetchConversations();
    }, 60000);
    return () => clearInterval(timer);
  }, [activePartnerId, fetchConversations, fetchMessages]);

  // ── Temps réel (SSE) : nouveaux messages + indicateur de frappe ──
  useEffect(() => {
    const unsubscribe = RealtimeService.on((type, payload) => {
      if (type === 'dm_message' && payload) {
        const fromActivePartner =
          activePartnerId != null && String(payload.sender_id) === String(activePartnerId);
        const mine = payload.sender_id != null && user && String(payload.sender_id) === String(user.id);
        if (fromActivePartner && !mine) {
          // Dédupliqué contre l'optimiste/le rafraîchissement par id
          setMessages((prev) => {
            if (prev.some((m) => String(m.id) === String(payload.id))) return prev;
            return [...prev, payload as DirectMessage];
          });
          // Marque lu côté serveur + purge les caches DM (rattrapage silencieux)
          ApiService.invalidateCache(`/dms/messages/${activePartnerId}`);
          ApiService.getMessages(activePartnerId).catch(() => {});
          ApiService.invalidateCache('/dms/conversations');
          fetchConversations();
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 60);
        } else if (!mine) {
          // Autre conversation : met à jour la liste (aperçu, tri, badge)
          ApiService.invalidateCache('/dms/');
          fetchConversations();
        }
      } else if (type === 'dm_message_edited' && payload) {
        setMessages((prev) =>
          prev.map((m) =>
            String(m.id) === String(payload.id)
              ? {
                  ...m,
                  content: payload.content,
                  is_edited: true,
                  edited_at: payload.edited_at || new Date().toISOString(),
                }
              : m
          )
        );
        fetchConversations();
      } else if (type === 'dm_typing' && payload) {
        const fromActivePartner =
          activePartnerId != null && String(payload.user_id) === String(activePartnerId);
        if (!fromActivePartner) return;
        if (typingHideTimeoutRef.current) clearTimeout(typingHideTimeoutRef.current);
        if (payload.typing === false) {
          setPartnerTyping(false);
        } else {
          setPartnerTyping(true);
          // Disparaît si aucun nouveau signal n'arrive (l'émetteur throttle à 2,5 s)
          typingHideTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 6000);
        }
      }
    });
    return () => {
      unsubscribe();
      if (typingHideTimeoutRef.current) clearTimeout(typingHideTimeoutRef.current);
    };
  }, [activePartnerId, user, fetchConversations]);

  // Réinitialise l'indicateur de frappe quand on change de conversation
  useEffect(() => {
    setPartnerTyping(false);
  }, [activePartnerId]);

  const handleSelectConversation = (conv: DMConversation) => {
    setActivePartnerId(conv.partner_id);
    setActivePartner({
      id: conv.partner_id,
      username: conv.partner_username,
      display_name: conv.partner_display_name,
      avatar_url: conv.partner_avatar_url,
    });
    // Supprimer immédiatement le badge/point de non lu au clic
    setConversations((prev) =>
      prev.map((c) =>
        String(c.partner_id) === String(conv.partner_id)
          ? { ...c, unread_count: 0 }
          : c
      )
    );
    setConvMenuOpen(false);
    setErrorMessage(null);
    setAttachedMediaList([]);
    fetchMessages(conv.partner_id);
  };

  // ── Modération conversation ──
  const handleRenameConversation = async () => {
    if (!activePartnerId || isModerating) return;
    setIsModerating(true);
    try {
      await ApiService.renameConversation(activePartnerId, renameValue);
      setRenameModalOpen(false);
      setConvMenuOpen(false);
      fetchConversations();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors du renommage.');
    } finally {
      setIsModerating(false);
    }
  };

  const handleReportConversation = async () => {
    if (!activePartnerId || isModerating) return;
    setIsModerating(true);
    try {
      await ApiService.reportConversation(activePartnerId, reportReason);
      setReportModalOpen(false);
      setConvMenuOpen(false);
      setErrorMessage(null);
      alert('Signalement transmis à la modération. Merci de nous aider à garder Vibe sûr.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors du signalement.');
    } finally {
      setIsModerating(false);
    }
  };

  const handleBlockPartner = async () => {
    if (!activePartnerId || isModerating) return;
    setIsModerating(true);
    try {
      if (activePartnerBlocked) {
        await ApiService.unblockUser(activePartnerId);
      } else {
        if (!window.confirm(`Bloquer @${activePartner?.username} ? Cette personne ne pourra plus vous envoyer de messages.`)) {
          setIsModerating(false);
          return;
        }
        await ApiService.blockUser(activePartnerId);
      }
      setConvMenuOpen(false);
      fetchConversations();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors du blocage.');
    } finally {
      setIsModerating(false);
    }
  };

  const handleDeleteConversation = async () => {
    if (!activePartnerId || isModerating) return;
    if (!window.confirm('Supprimer définitivement cette conversation et tous ses messages ?')) return;
    setIsModerating(true);
    try {
      await ApiService.deleteConversation(activePartnerId);
      setActivePartnerId(null);
      setActivePartner(null);
      setMessages([]);
      setConvMenuOpen(false);
      fetchConversations();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors de la suppression.');
    } finally {
      setIsModerating(false);
    }
  };

  const handleDeleteMessage = async (m: DirectMessage) => {
    setActionMenuFor(null);
    if (!window.confirm('Supprimer ce message ?')) return;
    const snapshot = messages;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    try {
      await ApiService.deleteMessage(String(m.id));
    } catch (err: any) {
      setMessages(snapshot);
      setErrorMessage(err.message || 'Impossible de supprimer le message.');
    }
  };

  const handleSearchUsers = (q: string) => {
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!q.trim()) {
      setSearchResults([]);
      setIsSearchingUsers(false);
      return;
    }

    setIsSearchingUsers(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await ApiService.searchUsers(q.trim());
        setSearchResults(res.users || []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 300);
  };

  const handleStartConversationWith = (u: { id: string | number; username: string; display_name?: string; avatar_url?: string }) => {
    setActivePartnerId(u.id);
    setActivePartner(u);
    setMessages([]);
    setSearchQuery('');
    setSearchResults([]);
    setErrorMessage(null);
    setAttachedMediaList([]);
    fetchMessages(u.id);
  };

  const handleAttachFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB
    const currentBytes = attachedMediaList.reduce((acc, m) => acc + m.size, 0);
    const newBytes = files.reduce((acc, f) => acc + f.size, 0);

    if (currentBytes + newBytes > MAX_TOTAL_BYTES) {
      setErrorMessage(`La taille totale des médias dépasse la limite de 50 Mo (sélection : ${((currentBytes + newBytes) / (1024 * 1024)).toFixed(1)} Mo).`);
      return;
    }

    const currentImages = attachedMediaList.filter((m) => m.type === 'image').length;
    const currentVideos = attachedMediaList.filter((m) => m.type === 'video').length;
    let newImages = 0;
    let newVideos = 0;

    for (const f of files) {
      if (f.type.startsWith('image/')) newImages++;
      else if (f.type.startsWith('video/')) newVideos++;
    }

    if (currentImages + newImages > 5) {
      setErrorMessage(`Limite de 5 images par message atteinte (actuel: ${currentImages}).`);
      return;
    }
    if (currentVideos + newVideos > 2) {
      setErrorMessage(`Limite de 2 vidéos par message atteinte (actuel: ${currentVideos}).`);
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      for (const file of files) {
        const res = await ApiService.uploadFile(file);
        if (res.url) {
          const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
          setAttachedMediaList((prev) => [...prev, { url: res.url, type, size: file.size }]);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors de l’envoi des fichiers.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** Heartbeat « en train d'écrire » : throttlé à 2,5 s pendant la saisie. */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    if (!activePartnerId || activePartnerBlocked) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2500) {
      lastTypingSentRef.current = now;
      ApiService.sendTyping(activePartnerId, true).catch(() => {});
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mode modification de message existant
    if (editingMessage) {
      const msgId = editingMessage.id;
      const originalContent = editingMessage.content;
      const newText = messageInput.trim();
      if (!newText || newText === originalContent) {
        setEditingMessage(null);
        setMessageInput('');
        return;
      }
      setIsSending(true);
      setErrorMessage(null);
      // Mise à jour optimiste
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, content: newText, is_edited: true, edited_at: new Date().toISOString() } : m
        )
      );
      setEditingMessage(null);
      setMessageInput('');
      try {
        await ApiService.editMessage(String(msgId), newText);
        if (activePartnerId) {
          fetchMessages(activePartnerId);
        }
        fetchConversations();
      } catch (err: any) {
        setErrorMessage(err.message || 'Impossible de modifier le message.');
        if (activePartnerId) fetchMessages(activePartnerId);
      } finally {
        setIsSending(false);
      }
      return;
    }

    const mediaUrls = attachedMediaList.map((m) => m.url).join(' ');
    const textToSend = mediaUrls
      ? `${messageInput.trim()} ${mediaUrls}`.trim()
      : messageInput.trim();

    if (!textToSend || !activePartnerId || isSending || activePartnerBlocked) return;

    // Cesse l'indicateur de frappe dès l'envoi
    lastTypingSentRef.current = 0;
    ApiService.sendTyping(activePartnerId, false).catch(() => {});

    if (isListening) {
      stopListening();
      resetTranscript();
    }

    const tempId = Date.now().toString();
    const optimisticMsg: DirectMessage = {
      id: tempId,
      conversation_id: 'temp',
      sender_id: user ? String(user.id) : 'me',
      sender_username: user?.username || 'me',
      recipient_id: String(activePartnerId),
      content: textToSend,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setMessageInput('');
    setAttachedMediaList([]);
    setIsSending(true);
    setErrorMessage(null);

    try {
      await ApiService.sendMessage(activePartnerId, textToSend, replyTo && !String(replyTo.id).startsWith('temp') ? String(replyTo.id) : undefined);
      setReplyTo(null);
      fetchMessages(activePartnerId);
      fetchConversations();
    } catch (err: any) {
      setErrorMessage(err.message || 'Impossible d’envoyer le message.');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsSending(false);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleToggleReaction = async (m: DirectMessage, emoji: string) => {
    if (String(m.id).startsWith('temp')) return;
    setActionMenuFor(null);
    // Mise à jour optimiste
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== m.id) return msg;
      const reactions: { emoji: string; count: number; mine: boolean }[] = [...((msg as any).reactions || [])];
      const g = reactions.find((r) => r.emoji === emoji);
      if (g) {
        if (g.mine) { g.count -= 1; g.mine = false; if (g.count <= 0) g.count = 0; }
        else { g.count += 1; g.mine = true; }
      } else {
        reactions.push({ emoji, count: 1, mine: true });
      }
      return { ...msg, reactions: reactions.filter((r) => r.count > 0) } as any;
    }));
    try {
      await ApiService.reactToMessage(String(m.id), emoji);
    } catch {
      fetchMessages(activePartnerId!); // resynchro en cas d'échec
    }
  };

  const handleCopyMessage = async (m: DirectMessage) => {
    setActionMenuFor(null);
    try {
      await navigator.clipboard.writeText(m.content);
      alert('Message copié dans le presse-papiers.');
    } catch {
      alert('Impossible de copier le message.');
    }
  };

  const handleForwardTo = async (conv: DMConversation) => {
    if (!forwardingMessage) return;
    try {
      await ApiService.sendMessage(conv.partner_id, forwardingMessage.content);
      setForwardingMessage(null);
      alert('Message transféré !');
    } catch (err: any) {
      alert(err.message || 'Erreur lors du transfert.');
    }
  };

  const PRESET_OPTIONS: { key: 'shorten' | 'extend' | 'tone' | 'improve' | 'custom'; label: string; icon: React.ReactNode }[] = [
    { key: 'shorten', label: 'Réduire', icon: <Scissors className="w-3.5 h-3.5" /> },
    { key: 'extend', label: 'Allonger', icon: <Expand className="w-3.5 h-3.5" /> },
    { key: 'tone', label: 'Changer le ton', icon: <Drama className="w-3.5 h-3.5" /> },
    { key: 'improve', label: 'Améliorer', icon: <Wand2 className="w-3.5 h-3.5" /> },
    { key: 'custom', label: 'Personnalisé…', icon: <PenLine className="w-3.5 h-3.5" /> },
  ];

  const handleGenerateSuggestion = async (
    preset: 'improve' | 'shorten' | 'extend' | 'tone' | 'custom' = 'improve',
    customPrompt?: string
  ) => {
    if (!activePartnerId || isGeneratingSuggestion) return;
    if (!messageInput.trim()) {
      setErrorMessage("Veuillez d'abord écrire un texte dans la bulle de message pour que mAI puisse l'améliorer.");
      return;
    }
    if (preset === 'custom' && !customPrompt?.trim()) {
      setCustomPresetOpen(true);
      setPlusMenuOpen(false);
      return;
    }
    setIsGeneratingSuggestion(true);
    setErrorMessage(null);
    setCustomPresetOpen(false);
    try {
      const res = await ApiService.generateDMReply(activePartnerId, messageInput.trim(), preset, customPrompt?.trim() || undefined);
      if (res?.suggestion) {
        const clean = res.suggestion
          .replace(/User Safety:\s*safe\.?/gi, '')
          .replace(/^User Safety:[^\n]*\n*/gi, '')
          .trim();
        if (clean) {
          setMessageInput(clean);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'mAI n’a pas pu améliorer le message.');
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="vibe-chat-page flex-1 flex min-h-screen border-r pb-16 md:pb-0 select-none">
      {/* Left Column: Conversations List */}
      <div className={`vibe-chat-sidebar w-full md:w-80 lg:w-96 border-r flex flex-col ${activePartnerId ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="vibe-chat-sidebar-header p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight">Messages</h1>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Privé
          </span>
        </div>

        {/* User Search Bar */}
        <div className="vibe-chat-search-bar p-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchUsers(e.target.value)}
              placeholder="Rechercher un membre (@nom)..."
              className="vibe-chat-search-input w-full py-2 pl-9 pr-8 rounded-2xl text-xs focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setIsSearchingUsers(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Loader pendant la recherche */}
          {isSearchingUsers && (
            <div className="mt-2 p-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-center text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black dark:text-white" />
              <span>Recherche des membres...</span>
            </div>
          )}

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && !isSearchingUsers && (
            <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-900 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleStartConversationWith(u)}
                  className="w-full p-2.5 flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors text-left"
                >
                  <ProfileAvatar
                    src={u.avatar_url}
                    alt={u.username}
                    fallbackName={u.username}
                    size="sm"
                    className="border border-zinc-200 dark:border-zinc-800 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-black dark:text-white truncate">{u.display_name || u.username}</span>
                      <VerifiedBadge isVerified={u.is_verified} tier={u.tier} size="xs" />
                    </div>
                    <p className="text-[11px] text-zinc-500 font-mono">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Aucun résultat */}
          {searchQuery.trim().length > 0 && searchResults.length === 0 && !isSearchingUsers && (
            <div className="mt-2 p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-center text-xs text-zinc-500">
              <p className="font-semibold text-zinc-600 dark:text-zinc-400">Aucun résultat</p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-0.5">Aucun compte trouvé pour « {searchQuery} »</p>
            </div>
          )}
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-black dark:text-white" />
              <span>Chargement des conversations...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 space-y-2">
              <Mail className="w-8 h-8 mx-auto text-zinc-400 dark:text-zinc-700" />
              <p className="text-xs">Aucun message direct pour le moment.</p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600">Recherchez un utilisateur ci-dessus pour engager la conversation.</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = activePartnerId === conv.partner_id;
              return (
                <div
                  key={conv.partner_id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`vibe-chat-conv-item p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'active' : ''
                  }`}
                >
                  <ProfileAvatar
                    src={conv.partner_avatar_url}
                    alt={conv.partner_username}
                    fallbackName={conv.partner_username}
                    size="md"
                    className="border border-zinc-200 dark:border-zinc-800 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-black dark:text-white truncate">
                        {conv.custom_name || conv.partner_display_name || conv.partner_username}
                        {conv.custom_name && <span className="ml-1 text-[10px] text-zinc-500 font-normal">@{conv.partner_username}</span>}
                      </h4>
                      <span className="text-[10px] text-zinc-500 font-mono">{formatTime(conv.last_message_at)}</span>
                    </div>
                    <p className="text-xs opacity-70 truncate mt-0.5">{conv.last_message_content || 'Nouveau message'}</p>
                  </div>
                  {conv.is_blocked && (
                    <span title="Utilisateur bloqué"><Ban className="w-3.5 h-3.5 text-zinc-500 shrink-0" /></span>
                  )}
                  {Boolean(conv.unread_count && conv.unread_count > 0 && String(conv.partner_id) !== String(activePartnerId)) && (
                    <span className="vibe-chat-badge-unread w-5 h-5 rounded-full font-bold text-[10px] flex items-center justify-center shrink-0 animate-pulse">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Active Conversation Chat */}
      <div className={`vibe-chat-main flex-1 flex flex-col ${!activePartnerId ? 'hidden md:flex' : 'flex'}`}>
        {activePartner ? (
          <>
            {/* Chat Top Header */}
            <div className="vibe-chat-header px-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3.5 border-b flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActivePartnerId(null)}
                  className="md:hidden p-1.5 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <ProfileAvatar
                  src={activePartner.avatar_url}
                  alt="Avatar"
                  fallbackName={activePartner.username}
                  size="sm"
                  className="border border-zinc-200 dark:border-zinc-800 shrink-0"
                />
                <div>
                  <h3 className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                    <span>{activeConv?.custom_name || activePartner.display_name || activePartner.username}</span>
                    {activeConv?.custom_name && <span className="text-[10px] text-zinc-500 font-normal">(@{activePartner.username})</span>}
                    <VerifiedBadge isVerified={(activePartner as any).is_verified} tier={(activePartner as any).tier} size="xs" />
                    {activePartnerBlocked && (
                      <span className="text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Ban className="w-2.5 h-2.5" /> Bloqué
                      </span>
                    )}
                  </h3>
                  <span className="text-[11px] text-zinc-500 font-mono">@{activePartner.username}</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setThemeModalOpen(true)}
                  className="p-2 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                  title="Personnaliser les couleurs et le fond de discussion"
                >
                  <Palette className="w-4 h-4" />
                </button>

                {/* Menu modération de la conversation */}
                <div className="relative">
                  <button
                    onClick={() => setConvMenuOpen(!convMenuOpen)}
                    className="p-2 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                    title="Options de la conversation"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                {convMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setConvMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-56 z-30 p-1.5 rounded-2xl vibe-menu shadow-2xl animate-fadeIn">
                      <button
                        onClick={() => { setRenameValue(activeConv?.custom_name || ''); setRenameModalOpen(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-left"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Renommer la conversation
                      </button>
                      <button
                        onClick={handleBlockPartner}
                        disabled={isModerating}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-left disabled:opacity-40"
                      >
                        <Ban className="w-3.5 h-3.5" /> {activePartnerBlocked ? 'Débloquer cet utilisateur' : 'Bloquer cet utilisateur'}
                      </button>
                      <button
                        onClick={() => setReportModalOpen(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-amber-500 hover:bg-amber-500/10 text-left"
                      >
                        <Flag className="w-3.5 h-3.5" /> Signaler la conversation
                      </button>
                      <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                      <button
                        onClick={handleDeleteConversation}
                        disabled={isModerating}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-red-500 hover:bg-red-500/10 text-left disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Supprimer la conversation
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="m-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Bandeau utilisateur bloqué */}
            {activePartnerBlocked && (
              <div className="m-3 p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  Vous avez bloqué <strong>@{activePartner.username}</strong>. Vous ne pouvez plus échanger de messages.
                  Débloquez-le depuis le menu <strong>⋮</strong> en haut à droite.
                </span>
              </div>
            )}

            {/* Indicateur de frappe du partenaire (temps réel) */}
            {partnerTyping && !activePartnerBlocked && (
              <div className="px-4 pt-1.5 pb-0.5 flex items-center gap-2 animate-fadeIn" aria-live="polite">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    @{activePartner?.username} est en train d'écrire…
                  </span>
                </div>
              </div>
            )}

            {/* Messages Thread */}
            <div
              className="vibe-chat-thread flex-1 p-4 space-y-3 overflow-y-auto max-h-[calc(100vh-140px)]"
              style={{ background: chatBackgroundTheme === 'default' ? undefined : CHAT_BACKGROUND_THEMES[chatBackgroundTheme]?.style }}
            >
              {messages.map((m) => {
                const isMe = user && (String(m.sender_id) === String(user.id) || m.sender_username === user.username);
                // Extract possible media URLs inside message
                const urls = m.content.match(/https?:\/\/[^\s]+/g) || [];
                const nonUrlText = m.content.replace(/https?:\/\/[^\s]+/g, '').trim();
                const isMediaOnly = urls.length > 0 && !nonUrlText && !(m as any).reply_to_content;
                const canEdit = isMe && !String(m.id).startsWith('temp') && (Date.now() - new Date(m.created_at).getTime()) <= 60 * 60 * 1000;

                const currentThemeConfig = MESSAGE_BUBBLE_THEMES[messageBubbleTheme] || MESSAGE_BUBBLE_THEMES.monochrome;
                const currentShapeConfig = MESSAGE_BUBBLE_SHAPES[messageBubbleShape] || MESSAGE_BUBBLE_SHAPES.pill;

                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative my-1 group`}>
                    {/* Ligne de message avec le bouton d'actions parfaitement aligné */}
                    <div className={`flex items-center gap-1.5 max-w-[85%] sm:max-w-[75%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* Bulle du message */}
                      {isMediaOnly ? (
                        <div
                          className={`vibe-msg-media-bubble relative overflow-hidden shadow-sm ${
                            isMe ? currentShapeConfig.meRadius : currentShapeConfig.partnerRadius
                          }`}
                        >
                          {urls.map((url, i) => {
                            const isVid = url.includes('.mp4') || url.includes('.webm') || url.includes('video');
                            return isVid ? (
                              <video key={i} src={url} controls className="rounded-2xl max-h-64 w-full object-cover" />
                            ) : (
                              <img key={i} src={url} alt="Pièce jointe" className="rounded-2xl max-h-64 w-full object-cover" />
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          style={
                            isMe && currentThemeConfig.id !== 'monochrome'
                              ? {
                                  background: currentThemeConfig.gradient,
                                  border: currentThemeConfig.border,
                                }
                              : undefined
                          }
                          className={`p-3 text-xs leading-relaxed relative shadow-sm min-w-[70px] ${
                            isMe
                              ? `${currentShapeConfig.meRadius} ${
                                  currentThemeConfig.id === 'monochrome'
                                    ? 'vibe-msg-bubble-me-mono'
                                    : currentThemeConfig.textColor === 'light'
                                    ? 'vibe-msg-text-light'
                                    : currentThemeConfig.textColor === 'dark'
                                    ? 'vibe-msg-text-dark'
                                    : 'vibe-msg-text-adaptive'
                                } font-medium`
                              : `${currentShapeConfig.partnerRadius} vibe-msg-bubble-partner`
                          }`}
                        >
                          {/* Citation du message auquel on répond */}
                          {(m as any).reply_to_content && (
                            <div
                              className={`mb-2 p-2 rounded-xl text-left border-l-4 transition-colors ${
                                isMe
                                  ? currentThemeConfig.id !== 'monochrome'
                                    ? 'vibe-msg-quote-gradient'
                                    : 'vibe-msg-quote-me-mono'
                                  : 'vibe-msg-quote-partner'
                              }`}
                            >
                              <p className="text-[10px] font-bold flex items-center gap-1 opacity-90 truncate">
                                <Reply className="w-3 h-3 shrink-0" />
                                <span>@{(m as any).reply_to_username || 'message'}</span>
                              </p>
                              <p className="text-[10px] opacity-90 truncate max-w-[240px] mt-0.5">
                                {(m as any).reply_to_content}
                              </p>
                            </div>
                          )}

                          {nonUrlText && <RichContent content={nonUrlText} className="leading-relaxed" />}

                          {urls.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {urls.map((url, i) => {
                                const isVid = url.includes('.mp4') || url.includes('.webm') || url.includes('video');
                                return isVid ? (
                                  <video key={i} src={url} controls className="rounded-xl max-h-48 w-full object-cover" />
                                ) : (
                                  <img key={i} src={url} alt="Pièce jointe" className="rounded-xl max-h-48 w-full object-cover" />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Bouton d'options (⋮) : centré verticalement, apparaît au survol sans décaler la page */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionMenuFor(actionMenuFor === m.id ? null : m.id);
                          }}
                          className="p-1.5 rounded-full text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
                          title="Options du message"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Menu d'actions flottant au-dessus du message avec backdrop click-outside */}
                    {actionMenuFor === m.id && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setActionMenuFor(null)}
                        />
                        <div
                          className={`absolute z-40 bottom-full ${
                            isMe ? 'right-0' : 'left-0'
                          } mb-2 p-1.5 rounded-2xl vibe-menu shadow-2xl flex flex-col gap-0.5 animate-fadeIn min-w-[210px]`}
                        >
                          <div className="flex items-center justify-between px-1.5 py-1">
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => handleToggleReaction(m, emoji)}
                                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-base transition-transform hover:scale-125"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          <div className="w-full border-t border-zinc-200 dark:border-zinc-800 my-0.5" />

                          {/* Option Modifier le message (limite 60 min) */}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessage(m);
                                setMessageInput(m.content);
                                setActionMenuFor(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-left"
                            >
                              <Pencil className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> Modifier le message
                            </button>
                          )}

                          {/* Option Informations */}
                          <button
                            type="button"
                            onClick={() => {
                              setInfoModalMessage(m);
                              setActionMenuFor(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-left"
                          >
                            <Info className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> Informations
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo(m);
                              setActionMenuFor(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-left"
                          >
                            <Reply className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> Répondre
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setForwardingMessage(m);
                              setActionMenuFor(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-left"
                          >
                            <Forward className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> Transférer
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyMessage(m)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-left"
                          >
                            <Copy className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> Copier le message
                          </button>

                          {isMe && !String(m.id).startsWith('temp') && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(m)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-red-500 hover:bg-red-500/10 transition-colors text-left"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Supprimer le message
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {/* Réactions affichées sous la bulle */}
                    {Array.isArray((m as any).reactions) && (m as any).reactions.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {(m as any).reactions.map((r: { emoji: string; count: number; mine: boolean }) => (
                          <button
                            key={r.emoji}
                            onClick={() => handleToggleReaction(m, r.emoji)}
                            className={`px-1.5 py-0.5 rounded-full text-[10px] border transition-colors ${
                              r.mine ? 'bg-sky-500/20 border-sky-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                            }`}
                          >
                            {r.emoji} {r.count}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-500 px-1 font-mono">
                      <span>{formatTime(m.created_at)}</span>
                      {m.is_edited && (
                        <span className="text-[9px] text-zinc-400 italic" title={m.edited_at ? `Modifié à ${formatTime(m.edited_at)}` : 'Modifié'}>
                          (modifié)
                        </span>
                      )}
                      {isMe && (
                        (m.is_read || (m as any).read_at) ? (
                          <span title="Vu" className="inline-flex items-center gap-0.5 text-sky-400 font-medium">
                            <Eye className="w-3 h-3" />
                            <span className="text-[9px]">Vu</span>
                          </span>
                        ) : (
                          <span title="Envoyé" className="inline-flex items-center gap-0.5 text-zinc-400">
                            <Check className="w-3 h-3" />
                            <span className="text-[9px]">Envoyé</span>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Attached Multi-Media Preview (Up to 5 images / 2 videos) */}
            {attachedMediaList.length > 0 && (
              <div className="vibe-chat-bottom-bar p-3 border-t-0 flex items-center gap-2 overflow-x-auto">
                {attachedMediaList.map((media, idx) => (
                  <div key={idx} className="relative group shrink-0">
                    {media.type === 'video' ? (
                      <video src={media.url} className="w-16 h-16 object-cover rounded-xl border border-zinc-200 dark:border-zinc-800" />
                    ) : (
                      <img src={media.url} alt="Aperçu" className="w-16 h-16 object-cover rounded-xl border border-zinc-200 dark:border-zinc-800" />
                    )}
                    <button
                      onClick={() => setAttachedMediaList((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1 -right-1 p-1 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black hover:bg-black dark:hover:bg-zinc-200 shadow"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <span className="text-[11px] text-zinc-500 pl-2">
                  {attachedMediaList.length} média(s) (max 50 Mo)
                </span>
              </div>
            )}

            {/* Message Input Box */}
            <form onSubmit={handleSendMessage} className="vibe-chat-bottom-bar p-3 space-y-2">
              {activePartnerBlocked && (
                <p className="text-center text-[11px] text-zinc-500 py-1">
                  Utilisateur bloqué — l'envoi de messages est désactivé.
                </p>
              )}

              {/* Bandeau d'édition de message */}
              {editingMessage && (
                <div className="vibe-chat-banner flex items-center justify-between px-3.5 py-2 rounded-2xl text-xs animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-3.5 h-3.5 text-black dark:text-white" />
                    <span>
                      Modification du message <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">(limite 60 min)</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMessage(null);
                      setMessageInput('');
                    }}
                    className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white"
                    title="Annuler la modification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Aperçu de réponse */}
              {replyTo && !editingMessage && (
                <div className="vibe-chat-banner flex items-center justify-between px-3 py-1.5 rounded-xl text-[11px]">
                  <span className="truncate">
                    Réponse à <strong>@{replyTo.sender_username}</strong> : {replyTo.content.slice(0, 60)}
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-black dark:hover:text-white shrink-0 ml-2">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {customPresetOpen && !isGeneratingSuggestion && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <PenLine className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                    <input
                      type="text"
                      value={customPresetText}
                      onChange={(e) => setCustomPresetText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleGenerateSuggestion('custom', customPresetText);
                        }
                      }}
                      autoFocus
                      placeholder="Votre consigne pour mAI (ex. : rends-le plus drôle)…"
                      className="flex-1 bg-transparent text-xs text-black dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateSuggestion('custom', customPresetText)}
                    disabled={!customPresetText.trim()}
                    className="p-1.5 rounded-full bg-black text-white dark:bg-white dark:text-black disabled:opacity-40 shrink-0 shadow"
                    title="Appliquer la consigne"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomPresetOpen(false)}
                    className="p-1.5 rounded-full text-zinc-500 hover:text-black dark:hover:text-white shrink-0"
                    title="Annuler"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 sm:gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAttachFiles}
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                  className="hidden"
                />

                {/* Bouton + séparé à gauche avec menu déroulant */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setPlusMenuOpen((prev) => !prev)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      plusMenuOpen
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black rotate-45 shadow-md'
                        : 'bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white border border-zinc-200 dark:border-zinc-800'
                    }`}
                    title="Ajouter des médias ou options mAI"
                  >
                    <Plus className="w-5 h-5 transition-transform" />
                  </button>

                  {/* Menu déroulant du bouton + */}
                  {plusMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setPlusMenuOpen(false)} />
                      <div className="absolute bottom-full left-0 mb-2.5 z-50 w-64 rounded-3xl vibe-menu p-2 shadow-2xl animate-fadeIn space-y-1">
                        {/* Importer fichiers / photos */}
                        <button
                          type="button"
                          onClick={() => {
                            setPlusMenuOpen(false);
                            fileInputRef.current?.click();
                          }}
                          disabled={isUploading}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-black dark:hover:text-white transition-colors text-left"
                        >
                          <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-white border border-zinc-200 dark:border-zinc-800 shrink-0">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-900 dark:text-white">Importer photos & vidéos</p>
                            <p className="text-[10px] text-zinc-500">Max 5 images ou 2 vidéos (50 Mo)</p>
                          </div>
                        </button>

                        <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />

                        {/* Presets mAI */}
                        <div className="px-3 pt-1 pb-1 text-[10px] uppercase font-bold tracking-wider text-zinc-500 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-zinc-700 dark:text-white" />
                          <span>Assistant mAI</span>
                        </div>
                        {PRESET_OPTIONS.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => {
                              setPlusMenuOpen(false);
                              handleGenerateSuggestion(opt.key);
                            }}
                            disabled={!messageInput.trim() && opt.key !== 'custom'}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-black dark:hover:text-white transition-colors text-left disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            <span className="text-zinc-500 dark:text-zinc-400">{opt.icon}</span>
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Bulle de message ronde et séparée du reste avec bouton de dictée à l'intérieur */}
                <div className="vibe-chat-input-pill flex-1 flex items-center px-4 py-1.5">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={handleInputChange}
                    placeholder={
                      isListening
                        ? 'Parlez, dictée en cours...'
                        : editingMessage
                        ? 'Modifier votre message...'
                        : 'Écrire un message...'
                    }
                    className="vibe-chat-input flex-1 py-1 text-xs"
                  />

                  {/* Bouton de dictée DANS la bulle de message */}
                  {isSupported && (
                    <button
                      type="button"
                      onClick={isListening ? stopListening : startListening}
                      className={`p-1.5 rounded-full transition-colors ml-1.5 shrink-0 ${
                        isListening
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800'
                      }`}
                      title={isListening ? 'Arrêter la dictée' : 'Dicter le message'}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Bouton d'envoi séparé : flèche allant vers le haut (ArrowUp) */}
                <button
                  type="submit"
                  disabled={activePartnerBlocked || (!messageInput.trim() && attachedMediaList.length === 0) || isSending}
                  className="vibe-chat-send-btn w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-40 shrink-0 shadow active:scale-95 cursor-pointer"
                  title={editingMessage ? 'Enregistrer la modification' : 'Envoyer le message'}
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUp className="w-5 h-5 stroke-[2.5]" />
                  )}
                </button>
              </div>
            </form>

            {/* Modale de renommage de conversation */}
            {renameModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn" onClick={() => setRenameModalOpen(false)}>
                <div className="w-full max-w-sm bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 space-y-3 animate-scaleUp text-zinc-900 dark:text-white" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-sm font-bold">Renommer la conversation</h3>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={50}
                    placeholder={activePartner?.display_name || activePartner?.username}
                    className="w-full p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
                    autoFocus
                  />
                  <p className="text-[10px] text-zinc-500">Laissez vide pour réafficher le nom d'origine. Ce nom n'est visible que par vous.</p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRenameModalOpen(false)} className="py-2 px-4 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[11px] font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800">
                      Annuler
                    </button>
                    <button
                      onClick={handleRenameConversation}
                      disabled={isModerating}
                      style={{ backgroundColor: 'var(--vibe-accent, #ffffff)' }}
                      className="py-2 px-4 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black text-[11px] font-bold hover:brightness-90 disabled:opacity-40"
                    >
                      {isModerating ? '...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modale de signalement */}
            {reportModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn" onClick={() => setReportModalOpen(false)}>
                <div className="w-full max-w-sm bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 space-y-3 animate-scaleUp text-zinc-900 dark:text-white" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <Flag className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold">Signaler @{activePartner?.username}</h3>
                  </div>
                  <div className="space-y-1.5">
                    {REPORT_REASONS.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setReportReason(reason)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-[11px] border transition-colors ${
                          reportReason === reason
                            ? 'bg-zinc-100 dark:bg-zinc-900 border-zinc-900 dark:border-white text-zinc-900 dark:text-white font-bold'
                            : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setReportModalOpen(false)} className="py-2 px-4 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[11px] font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800">
                      Annuler
                    </button>
                    <button
                      onClick={handleReportConversation}
                      disabled={isModerating}
                      className="py-2 px-4 rounded-full bg-amber-500 text-black text-[11px] font-bold hover:bg-amber-400 disabled:opacity-40"
                    >
                      {isModerating ? '...' : 'Signaler'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modale de transfert */}
            {forwardingMessage && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn" onClick={() => setForwardingMessage(null)}>
                <div className="w-full max-w-sm bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 space-y-3 animate-scaleUp text-zinc-900 dark:text-white" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">Transférer le message</h3>
                    <button onClick={() => setForwardingMessage(null)} className="p-1 rounded-full text-zinc-400 hover:text-black dark:hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 truncate">
                    {forwardingMessage.content.slice(0, 120)}
                  </p>
                  <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    {conversations.length === 0 && (
                      <p className="p-4 text-center text-xs text-zinc-500">Aucune conversation disponible.</p>
                    )}
                    {conversations.map((conv) => (
                      <button
                        key={conv.partner_id}
                        onClick={() => handleForwardTo(conv)}
                        className="w-full p-3 flex items-center gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-left"
                      >
                        <ProfileAvatar
                          src={conv.partner_avatar_url}
                          alt={conv.partner_username}
                          fallbackName={conv.partner_username}
                          size="sm"
                          className="border border-zinc-200 dark:border-zinc-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{conv.partner_display_name || conv.partner_username}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">@{conv.partner_username}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Modale d'informations sur le message */}
            {infoModalMessage && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
                onClick={() => setInfoModalMessage(null)}
              >
                <div
                  className="w-full max-w-sm bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 space-y-4 animate-scaleUp text-zinc-900 dark:text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-zinc-900 dark:text-white" />
                      <h3 className="text-sm font-bold">Informations du message</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInfoModalMessage(null)}
                      className="p-1 rounded-full text-zinc-400 hover:text-black dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Aperçu du message */}
                  <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-200">
                    <p className="line-clamp-4">{infoModalMessage.content}</p>
                  </div>

                  {/* Détails du cycle de vie du message */}
                  <div className="space-y-3 text-xs">
                    <div className="flex items-start justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-900">
                      <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-zinc-400" /> Envoyé
                      </span>
                      <span className="font-mono text-zinc-800 dark:text-zinc-200 text-right">
                        {new Date(infoModalMessage.created_at).toLocaleString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-900">
                      <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-zinc-400" /> Reçu / Délivré
                      </span>
                      <span className="text-emerald-500 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Reçu par le serveur
                      </span>
                    </div>

                    <div className="flex items-start justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-900">
                      <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-zinc-400" /> État de lecture
                      </span>
                      <div className="text-right">
                        {infoModalMessage.is_read || (infoModalMessage as any).read_at ? (
                          <span className="text-sky-500 font-semibold flex items-center gap-1 justify-end">
                            <Eye className="w-3.5 h-3.5" /> Lu
                            {(infoModalMessage as any).read_at && (
                              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 font-normal">
                                ({new Date((infoModalMessage as any).read_at).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-zinc-400 dark:text-zinc-500 font-medium">Non encore lu</span>
                        )}
                      </div>
                    </div>

                    {infoModalMessage.is_edited && (
                      <div className="flex items-start justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-900">
                        <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" /> Modifié
                        </span>
                        <span className="font-mono text-zinc-700 dark:text-zinc-300 text-right">
                          {infoModalMessage.edited_at
                            ? new Date(infoModalMessage.edited_at).toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : 'Oui'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setInfoModalMessage(null)}
                      className="py-2 px-4 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modale de personnalisation du thème de discussion */}
            {themeModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
                onClick={() => setThemeModalOpen(false)}
              >
                <div
                  className="w-full max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 space-y-4 animate-scaleUp text-zinc-900 dark:text-white max-h-[90vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-zinc-900 dark:text-white" />
                      <h3 className="text-sm font-bold">Personnaliser la discussion</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setThemeModalOpen(false)}
                      className="p-1 rounded-full text-zinc-400 hover:text-black dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Section 1 : Couleur ou Dégradé des bulles envoyées */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <span>Bulle des messages envoyés</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(MESSAGE_BUBBLE_THEMES).map((themeOpt) => {
                        const isSelected = messageBubbleTheme === themeOpt.id;
                        return (
                          <button
                            key={themeOpt.id}
                            type="button"
                            onClick={() => setMessageBubbleTheme(themeOpt.id)}
                            className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                              isSelected
                                ? 'border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-900 shadow-md ring-1 ring-zinc-900/30 dark:ring-white/30'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50'
                            }`}
                          >
                            <span
                              className="w-6 h-6 rounded-full shrink-0 border border-black/10 dark:border-white/20 shadow-inner"
                              style={{ background: themeOpt.gradient, border: themeOpt.border }}
                            />
                            <span className="text-[11px] font-semibold truncate text-zinc-800 dark:text-zinc-200">
                              {themeOpt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2 : Fond de la zone de messages */}
                  <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-900">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Fond de la discussion</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(CHAT_BACKGROUND_THEMES).map((bgOpt) => {
                        const isSelected = chatBackgroundTheme === bgOpt.id;
                        return (
                          <button
                            key={bgOpt.id}
                            type="button"
                            onClick={() => setChatBackgroundTheme(bgOpt.id)}
                            className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                              isSelected
                                ? 'border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-900 shadow-md ring-1 ring-zinc-900/30 dark:ring-white/30'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-full shrink-0 border border-black/10 dark:border-white/20 ${bgOpt.previewBg}`}
                              style={{ background: bgOpt.style || undefined }}
                            />
                            <span className="text-[11px] font-semibold truncate text-zinc-800 dark:text-zinc-200">
                              {bgOpt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 3 : Forme de la bulle */}
                  <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-900">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Forme de la bulle</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(Object.keys(MESSAGE_BUBBLE_SHAPES) as MessageBubbleShape[]).map((shapeKey) => {
                        const isSelected = messageBubbleShape === shapeKey;
                        const s = MESSAGE_BUBBLE_SHAPES[shapeKey];
                        return (
                          <button
                            key={shapeKey}
                            type="button"
                            onClick={() => setMessageBubbleShape(shapeKey)}
                            className={`py-2 px-2 rounded-2xl border text-center text-[11px] font-semibold transition-all ${
                              isSelected
                                ? 'border-zinc-900 dark:border-white bg-zinc-900 text-white dark:bg-white dark:text-black font-bold shadow'
                                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                            }`}
                          >
                            {s.label.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setThemeModalOpen(false)}
                      className="py-2 px-5 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow"
                    >
                      Terminer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-3">
            <Mail className="w-12 h-12 text-zinc-300 dark:text-zinc-800" />
            <h3 className="text-sm font-bold text-black dark:text-white">Sélectionnez une conversation</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
              Communiquez en direct avec les autres membres de la communauté Vibe.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
