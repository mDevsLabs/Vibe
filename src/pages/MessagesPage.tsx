/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — DIRECT MESSAGES (src/pages/MessagesPage.tsx)
 * Private chats with multi-media (up to 5 images / 2 videos / 50 MB), speech & privacy controls
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Image as ImageIcon,
  Video,
  Mic,
  MicOff,
  User,
  Search,
  ArrowLeft,
  CheckCheck,
  Check,
  Eye,
  Lock,
  Mail,
  Loader2,
  AlertCircle,
  X,
  Play,
  MoreVertical,
  Smile,
  Reply,
  Forward,
  Copy,
  Sparkles,
  Flag,
  Trash2,
  Ban,
  Pencil
} from 'lucide-react';
import { ApiService } from '../services/api';
import { DirectMessage, DMConversation } from '../types/vibe';
import { useAuth } from '../context/AuthContext';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { VerifiedBadge } from '../components/common/VerifiedBadge';
import { ProfileAvatar } from '../components/common/ProfileAvatar';

interface AttachedMedia {
  url: string;
  type: 'image' | 'video';
  size: number;
}

export const MessagesPage: React.FC = () => {
  const { user } = useAuth();
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

  // Interactions par message : réactions, réponse, transfert, copie
  const REACTION_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];
  const [actionMenuFor, setActionMenuFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<DirectMessage | null>(null);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);

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

  const fetchConversations = async () => {
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
  };

  const fetchMessages = async (partnerId: string | number) => {
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
  };

  useEffect(() => {
    fetchConversations();
    // Polling adaptatif : 10s avec conversation ouverte, 25s sinon, jamais en arrière-plan
    let timer: ReturnType<typeof setInterval>;
    const schedule = () => {
      clearInterval(timer);
      timer = setInterval(() => {
        if (document.hidden) return;
        if (activePartnerId) fetchMessages(activePartnerId);
        fetchConversations();
      }, activePartnerId ? 10000 : 25000);
    };
    schedule();
    return () => clearInterval(timer);
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const mediaUrls = attachedMediaList.map((m) => m.url).join(' ');
    const textToSend = mediaUrls
      ? `${messageInput.trim()} ${mediaUrls}`.trim()
      : messageInput.trim();

    if (!textToSend || !activePartnerId || isSending || activePartnerBlocked) return;

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

  const handleGenerateSuggestion = async () => {
    if (!activePartnerId || isGeneratingSuggestion) return;
    if (!messageInput.trim()) {
      setErrorMessage("Veuillez d'abord écrire un texte dans la bulle de message pour que mAI puisse l'améliorer.");
      return;
    }
    setIsGeneratingSuggestion(true);
    setErrorMessage(null);
    try {
      const res = await ApiService.generateDMReply(activePartnerId, messageInput.trim());
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
    <div className="flex-1 flex min-h-screen border-r border-zinc-800 bg-black pb-16 md:pb-0 select-none">
      {/* Left Column: Conversations List */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-zinc-800 flex flex-col bg-zinc-950/40 ${activePartnerId ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-white tracking-tight">Messages</h1>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Privé
          </span>
        </div>

        {/* User Search Bar */}
        <div className="p-3 border-b border-zinc-900 bg-black/40">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchUsers(e.target.value)}
              placeholder="Rechercher un membre (@nom)..."
              className="w-full py-2 pl-9 pr-8 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setIsSearchingUsers(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Loader pendant la recherche */}
          {isSearchingUsers && (
            <div className="mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded-2xl text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              <span>Recherche des membres...</span>
            </div>
          )}

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && !isSearchingUsers && (
            <div className="mt-2 divide-y divide-zinc-900 bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleStartConversationWith(u)}
                  className="w-full p-2.5 flex items-center gap-3 hover:bg-zinc-900 cursor-pointer transition-colors text-left"
                >
                  <ProfileAvatar
                    src={u.avatar_url}
                    alt={u.username}
                    fallbackName={u.username}
                    size="sm"
                    className="border border-zinc-800 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate">{u.display_name || u.username}</span>
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
            <div className="mt-2 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-center text-xs text-zinc-500">
              <p className="font-semibold text-zinc-400">Aucun résultat</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">Aucun compte trouvé pour « {searchQuery} »</p>
            </div>
          )}
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Chargement des conversations...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 space-y-2">
              <Mail className="w-8 h-8 mx-auto text-zinc-700" />
              <p className="text-xs">Aucun message direct pour le moment.</p>
              <p className="text-[11px] text-zinc-600">Recherchez un utilisateur ci-dessus pour engager la conversation.</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = activePartnerId === conv.partner_id;
              return (
                <div
                  key={conv.partner_id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-zinc-900/90 border-l-2 border-white' : 'hover:bg-zinc-900/40'
                  }`}
                >
                  <ProfileAvatar
                    src={conv.partner_avatar_url}
                    alt={conv.partner_username}
                    fallbackName={conv.partner_username}
                    size="md"
                    className="border border-zinc-800 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white truncate">
                        {conv.custom_name || conv.partner_display_name || conv.partner_username}
                        {conv.custom_name && <span className="ml-1 text-[10px] text-zinc-500 font-normal">@{conv.partner_username}</span>}
                      </h4>
                      <span className="text-[10px] text-zinc-500 font-mono">{formatTime(conv.last_message_at)}</span>
                    </div>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">{conv.last_message_content || 'Nouveau message'}</p>
                  </div>
                  {conv.is_blocked && (
                    <span title="Utilisateur bloqué"><Ban className="w-3.5 h-3.5 text-zinc-600 shrink-0" /></span>
                  )}
                  {Boolean(conv.unread_count && conv.unread_count > 0 && String(conv.partner_id) !== String(activePartnerId)) && (
                    <span className="w-5 h-5 rounded-full bg-white text-black font-bold text-[10px] flex items-center justify-center shrink-0 animate-pulse">
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
      <div className={`flex-1 flex flex-col bg-black ${!activePartnerId ? 'hidden md:flex' : 'flex'}`}>
        {activePartner ? (
          <>
            {/* Chat Top Header */}
            <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActivePartnerId(null)}
                  className="md:hidden p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <ProfileAvatar
                  src={activePartner.avatar_url}
                  alt="Avatar"
                  fallbackName={activePartner.username}
                  size="sm"
                  className="border border-zinc-800 shrink-0"
                />
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>{activeConv?.custom_name || activePartner.display_name || activePartner.username}</span>
                    {activeConv?.custom_name && <span className="text-[10px] text-zinc-500 font-normal">(@{activePartner.username})</span>}
                    <VerifiedBadge isVerified={(activePartner as any).is_verified} tier={(activePartner as any).tier} size="xs" />
                    {activePartnerBlocked && (
                      <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Ban className="w-2.5 h-2.5" /> Bloqué
                      </span>
                    )}
                  </h3>
                  <span className="text-[11px] text-zinc-500 font-mono">@{activePartner.username}</span>
                </div>
              </div>

              {/* Menu modération de la conversation */}
              <div className="relative">
                <button
                  onClick={() => setConvMenuOpen(!convMenuOpen)}
                  className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                  title="Options de la conversation"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {convMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setConvMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-56 z-30 p-1.5 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl animate-fadeIn">
                      <button
                        onClick={() => { setRenameValue(activeConv?.custom_name || ''); setRenameModalOpen(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-900 text-left"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Renommer la conversation
                      </button>
                      <button
                        onClick={handleBlockPartner}
                        disabled={isModerating}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-900 text-left disabled:opacity-40"
                      >
                        <Ban className="w-3.5 h-3.5" /> {activePartnerBlocked ? 'Débloquer cet utilisateur' : 'Bloquer cet utilisateur'}
                      </button>
                      <button
                        onClick={() => setReportModalOpen(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-amber-400 hover:bg-zinc-900 text-left"
                      >
                        <Flag className="w-3.5 h-3.5" /> Signaler la conversation
                      </button>
                      <div className="border-t border-zinc-900 my-1" />
                      <button
                        onClick={handleDeleteConversation}
                        disabled={isModerating}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-red-400 hover:bg-zinc-900 text-left disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Supprimer la conversation
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="m-3 p-3 rounded-2xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-white shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Bandeau utilisateur bloqué */}
            {activePartnerBlocked && (
              <div className="m-3 p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  Vous avez bloqué <strong>@{activePartner.username}</strong>. Vous ne pouvez plus échanger de messages.
                  Débloquez-le depuis le menu <strong>⋮</strong> en haut à droite.
                </span>
              </div>
            )}

            {/* Messages Thread */}
            <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[calc(100vh-140px)]">
              {messages.map((m) => {
                const isMe = user && (String(m.sender_id) === String(user.id) || m.sender_username === user.username);
                // Extract possible media URLs inside message
                const urls = m.content.match(/https?:\/\/[^\s]+/g) || [];
                const nonUrlText = m.content.replace(/https?:\/\/[^\s]+/g, '').trim();

                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* Citation du message auquel on répond */}
                    {(m as any).reply_to_content && (
                      <div className={`max-w-[80%] mb-1 pl-2 border-l-2 ${isMe ? 'border-zinc-600' : 'border-zinc-700'}`}>
                        <p className="text-[10px] font-bold text-zinc-400">@{(m as any).reply_to_username || 'message'}</p>
                        <p className="text-[10px] text-zinc-500 truncate max-w-[220px]">{(m as any).reply_to_content}</p>
                      </div>
                    )}

                    <div
                      className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed relative group ${
                        isMe
                          ? 'bg-white text-black font-medium rounded-tr-sm'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-sm'
                      }`}
                    >
                      {nonUrlText && <p className="whitespace-pre-wrap break-words">{nonUrlText}</p>}

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

                      {/* Bouton menu d'actions */}
                      <button
                        onClick={() => setActionMenuFor(actionMenuFor === m.id ? null : m.id)}
                        className={`absolute -top-2 ${isMe ? '-left-8' : '-right-8'} p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors opacity-60 group-hover:opacity-100`}
                        title="Actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Menu d'actions */}
                    {actionMenuFor === m.id && (
                      <div className={`mt-1 p-1.5 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col gap-0.5 animate-fadeIn ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className="flex gap-0.5 p-1">
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => handleToggleReaction(m, emoji)}
                              className="p-1 rounded-lg hover:bg-zinc-800 text-base transition-transform hover:scale-125"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <div className="w-full border-t border-zinc-900 my-0.5" />
                        <button onClick={() => { setReplyTo(m); setActionMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-900">
                          <Reply className="w-3.5 h-3.5" /> Répondre
                        </button>
                        <button onClick={() => { setForwardingMessage(m); setActionMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-900">
                          <Forward className="w-3.5 h-3.5" /> Transférer
                        </button>
                        <button onClick={() => handleCopyMessage(m)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-900">
                          <Copy className="w-3.5 h-3.5" /> Copier le message
                        </button>
                        {isMe && !String(m.id).startsWith('temp') && (
                          <button onClick={() => handleDeleteMessage(m)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] text-red-400 hover:bg-zinc-900">
                            <Trash2 className="w-3.5 h-3.5" /> Supprimer le message
                          </button>
                        )}
                      </div>
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
                      {isMe && (
                        Boolean(m.is_read || (m as any).read_at) ? (
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
              <div className="p-3 bg-zinc-950 border-t border-zinc-900 flex items-center gap-2 overflow-x-auto">
                {attachedMediaList.map((media, idx) => (
                  <div key={idx} className="relative group shrink-0">
                    {media.type === 'video' ? (
                      <video src={media.url} className="w-16 h-16 object-cover rounded-xl border border-zinc-800" />
                    ) : (
                      <img src={media.url} alt="Aperçu" className="w-16 h-16 object-cover rounded-xl border border-zinc-800" />
                    )}
                    <button
                      onClick={() => setAttachedMediaList((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1 -right-1 p-1 rounded-full bg-black text-white hover:bg-zinc-800"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <span className="text-[11px] text-zinc-400 pl-2">
                  {attachedMediaList.length} média(s) (max 50 Mo)
                </span>
              </div>
            )}

            {/* Message Input Box */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-800 bg-zinc-950 space-y-2">
              {activePartnerBlocked && (
                <p className="text-center text-[11px] text-zinc-500 py-1">
                  Utilisateur bloqué — l'envoi de messages est désactivé.
                </p>
              )}
              {/* Aperçu de réponse */}
              {replyTo && (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400">
                  <span className="truncate">
                    Réponse à <strong className="text-white">@{replyTo.sender_username}</strong> : {replyTo.content.slice(0, 60)}
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-white shrink-0 ml-2">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAttachFiles}
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                title="Joindre images (max 5) ou vidéos (max 2, limite 50 Mo)"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              </button>

              {isSupported && (
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`p-2 rounded-full transition-colors ${
                    isListening ? 'bg-red-500 text-white animate-pulse' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                  title={isListening ? 'Arrêter dictée' : 'Dicter message'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}

              {/* Amélioration de message par mAI */}
              <button
                type="button"
                onClick={handleGenerateSuggestion}
                disabled={isGeneratingSuggestion || !messageInput.trim()}
                className={`p-2 rounded-full transition-colors ${
                  !messageInput.trim()
                    ? 'text-zinc-600 opacity-40 cursor-not-allowed'
                    : 'text-white hover:bg-zinc-900 cursor-pointer shadow-sm'
                }`}
                title={
                  !messageInput.trim()
                    ? "Veuillez d'abord écrire un texte dans la bulle pour que mAI l'améliore"
                    : "Améliorer mon message avec mAI"
                }
              >
                {isGeneratingSuggestion ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Sparkles className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder={isListening ? 'Parlez, dictée en cours...' : 'Écrire un message...'}
                className="flex-1 py-2 px-3.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />

              <button
                type="submit"
                disabled={activePartnerBlocked || (!messageInput.trim() && attachedMediaList.length === 0) || isSending}
                style={{ backgroundColor: 'var(--vibe-accent, #ffffff)' }}
                className="p-2.5 rounded-full bg-white text-black hover:brightness-90 transition-all disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
              </div>
            </form>

            {/* Modale de renommage de conversation */}
            {renameModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn" onClick={() => setRenameModalOpen(false)}>
                <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-3 animate-scaleUp" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-sm font-bold text-white">Renommer la conversation</h3>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={50}
                    placeholder={activePartner?.display_name || activePartner?.username}
                    className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                    autoFocus
                  />
                  <p className="text-[10px] text-zinc-500">Laissez vide pour réafficher le nom d'origine. Ce nom n'est visible que par vous.</p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRenameModalOpen(false)} className="py-2 px-4 rounded-full bg-zinc-900 text-zinc-300 text-[11px] font-semibold hover:bg-zinc-800">
                      Annuler
                    </button>
                    <button
                      onClick={handleRenameConversation}
                      disabled={isModerating}
                      style={{ backgroundColor: 'var(--vibe-accent, #ffffff)' }}
                      className="py-2 px-4 rounded-full bg-white text-black text-[11px] font-bold hover:brightness-90 disabled:opacity-40"
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
                <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-3 animate-scaleUp" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <Flag className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">Signaler @{activePartner?.username}</h3>
                  </div>
                  <div className="space-y-1.5">
                    {REPORT_REASONS.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setReportReason(reason)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-[11px] border transition-colors ${
                          reportReason === reason
                            ? 'bg-zinc-900 border-white text-white font-bold'
                            : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setReportModalOpen(false)} className="py-2 px-4 rounded-full bg-zinc-900 text-zinc-300 text-[11px] font-semibold hover:bg-zinc-800">
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
                <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-4 space-y-3 animate-scaleUp" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Transférer le message</h3>
                    <button onClick={() => setForwardingMessage(null)} className="p-1 rounded-full text-zinc-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500 p-2 rounded-xl bg-zinc-900 border border-zinc-800 truncate">
                    {forwardingMessage.content.slice(0, 120)}
                  </p>
                  <div className="max-h-64 overflow-y-auto divide-y divide-zinc-900 rounded-2xl border border-zinc-800">
                    {conversations.length === 0 && (
                      <p className="p-4 text-center text-xs text-zinc-500">Aucune conversation disponible.</p>
                    )}
                    {conversations.map((conv) => (
                      <button
                        key={conv.partner_id}
                        onClick={() => handleForwardTo(conv)}
                        className="w-full p-3 flex items-center gap-3 hover:bg-zinc-900 transition-colors text-left"
                      >
                        <ProfileAvatar
                          src={conv.partner_avatar_url}
                          alt={conv.partner_username}
                          fallbackName={conv.partner_username}
                          size="sm"
                          className="border border-zinc-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{conv.partner_display_name || conv.partner_username}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">@{conv.partner_username}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-3">
            <Mail className="w-12 h-12 text-zinc-800" />
            <h3 className="text-sm font-bold text-white">Sélectionnez une conversation</h3>
            <p className="text-xs text-zinc-400 max-w-sm">
              Communiquez en direct avec les autres membres de la communauté Vibe.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
