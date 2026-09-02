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
  CheckCircle,
  Play
} from 'lucide-react';
import { ApiService } from '../services/api';
import { DirectMessage, DMConversation } from '../types/vibe';
import { useAuth } from '../context/AuthContext';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { VerifiedBadge } from '../components/common/VerifiedBadge';

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
      setConversations(res.conversations || []);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMessages = async (partnerId: string | number) => {
    try {
      const res = await ApiService.getMessages(partnerId);
      setMessages(res.messages || []);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err: any) {
      setErrorMessage(err.message || 'Impossible de charger les messages.');
    }
  };

  useEffect(() => {
    fetchConversations();
    const timer = setInterval(() => {
      if (activePartnerId) {
        fetchMessages(activePartnerId);
      }
      fetchConversations();
    }, 5000);
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
    setErrorMessage(null);
    setAttachedMediaList([]);
    fetchMessages(conv.partner_id);
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

    if (!textToSend || !activePartnerId || isSending) return;

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
      await ApiService.sendMessage(activePartnerId, textToSend);
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
                  <img
                    src={u.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80'}
                    alt={u.username}
                    className="w-9 h-9 rounded-full object-cover border border-zinc-800 shrink-0"
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
                  <img
                    src={conv.partner_avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80'}
                    alt={conv.partner_username}
                    className="w-11 h-11 rounded-full object-cover border border-zinc-800 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white truncate">{conv.partner_display_name || conv.partner_username}</h4>
                      <span className="text-[10px] text-zinc-500 font-mono">{formatTime(conv.last_message_at)}</span>
                    </div>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">{conv.last_message_content || 'Nouveau message'}</p>
                  </div>
                  {Boolean(conv.unread_count && conv.unread_count > 0) && (
                    <span className="w-5 h-5 rounded-full bg-white text-black font-bold text-[10px] flex items-center justify-center shrink-0">
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

                <img
                  src={activePartner.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80'}
                  alt="Avatar"
                  className="w-9 h-9 rounded-full object-cover border border-zinc-800 shrink-0"
                />
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>{activePartner.display_name || activePartner.username}</span>
                    <VerifiedBadge isVerified={(activePartner as any).is_verified} tier={(activePartner as any).tier} size="xs" />
                  </h3>
                  <span className="text-[11px] text-zinc-500 font-mono">@{activePartner.username}</span>
                </div>
              </div>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="m-3 p-3 rounded-2xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-white shrink-0" />
                <span>{errorMessage}</span>
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
                    <div
                      className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed ${
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
                    </div>

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
            <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-800 bg-zinc-950 flex items-center gap-2">
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

              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Écrire un message..."
                className="flex-1 py-2 px-3.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />

              <button
                type="submit"
                disabled={(!messageInput.trim() && attachedMediaList.length === 0) || isSending}
                className="p-2.5 rounded-full bg-white text-black hover:bg-zinc-200 transition-all disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
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
