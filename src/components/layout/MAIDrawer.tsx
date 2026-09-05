/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — mAI DRAWER (src/components/layout/MAIDrawer.tsx)
 * Retractable slide-over AI assistant with tools, @ and / support & live quotas
 * ============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Sparkles,
  Zap,
  Image as ImageIcon,
  CheckCircle2,
  Mic,
  MicOff,
  FileText,
  Search,
  Loader2,
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { ToolAutocomplete } from './ToolAutocomplete';
import { AVAILABLE_MAI_TOOLS, MAITool } from '../../data/maiTools';
import { ModelDropdown, AIModel } from '../common/ModelDropdown';
import type { Post } from '../../types/vibe';

interface MAIDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
  /** Post pré-attaché (bouton « Mentionner dans mAI » depuis une publication). */
  attachedPostId?: string | null;
  onClearAttachedPost?: () => void;
}

interface AttachedPostInfo {
  id: string;
  username: string;
  excerpt: string;
}

interface MessageItem {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  toolResult?: any;
  attachment?: AttachedPostInfo;
  timestamp: string;
}

const DEFAULT_MODELS: AIModel[] = [
  { id: 'poolside/laguna-xs-2.1:free', name: 'Laguna XS 2.1', description: 'Modèle IA par défaut haute performance', provider: 'Poolside' },
  { id: 'mai-1.5-apex', name: 'mAI 1.5 Apex', description: 'Modèle IA d\'élite mAI — Raisonnement profond & Vision', provider: 'mDevsLabs' },
  { id: 'mai-1.5-light', name: 'mAI 1.5 Light', description: 'Modèle agile mAI ultra-rapide', provider: 'mDevsLabs' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Vitesse instantanée et compréhension multimodale', provider: 'Google' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Raisonnement avancé et synthèse complexe', provider: 'Google' },
  { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', description: 'Écriture élégante et codage expert', provider: 'Anthropic' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'Modèle polyvalent haut de gamme', provider: 'OpenAI' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', description: 'Performances logiques et mathématiques', provider: 'DeepSeek' },
];

const generateMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const formatCurrentTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const MAIDrawer: React.FC<MAIDrawerProps> = ({
  isOpen,
  onClose,
  onPostCreated,
  attachedPostId,
  onClearAttachedPost,
}) => {
  const { user, quotas, refreshQuotas } = useAuth();
  const [selectedModel, setSelectedModel] = useState<string>('poolside/laguna-xs-2.1:free');
  const [availableModels, setAvailableModels] = useState<AIModel[]>(DEFAULT_MODELS);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Publication mentionnée jointe à la conversation
  const [attachedPost, setAttachedPost] = useState<AttachedPostInfo | null>(null);
  // Sélecteur de posts (« Mentionner un post »)
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [postPickerQuery, setPostPickerQuery] = useState('');
  const [postPickerResults, setPostPickerResults] = useState<Post[]>([]);
  const [postPickerLoading, setPostPickerLoading] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await ApiService.getModels();
        if (res?.models && res.models.length > 0) {
          const list = [...res.models];
          const lagunaIdx = list.findIndex((m) => m.id === 'poolside/laguna-xs-2.1:free');
          if (lagunaIdx > 0) {
            const [laguna] = list.splice(lagunaIdx, 1);
            list.unshift(laguna);
          }
          setAvailableModels(list);
        }
      } catch {}
    };
    if (isOpen) {
      loadModels();
    }
  }, [isOpen]);

  // Post pré-attaché depuis l'extérieur (bouton « Mentionner dans mAI »)
  useEffect(() => {
    if (!isOpen || !attachedPostId) return;
    if (attachedPost?.id === attachedPostId) return;
    let cancelled = false;
    ApiService.getPost(attachedPostId)
      .then((data) => {
        if (cancelled || !data?.post) return;
        setAttachedPost({
          id: data.post.id,
          username: data.post.username || 'utilisateur',
          excerpt: (data.post.content || '').slice(0, 90),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, attachedPostId, attachedPost?.id]);

  // Recherche de publications pour le sélecteur (debounce 300 ms)
  useEffect(() => {
    if (!showPostPicker) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setPostPickerLoading(true);
      try {
        if (postPickerQuery.trim()) {
          const res = await ApiService.searchPosts(postPickerQuery.trim(), 12);
          if (!cancelled) setPostPickerResults(res.posts || []);
        } else {
          const feed = await ApiService.getFeed('for_you');
          if (!cancelled) setPostPickerResults(feed.posts?.slice(0, 12) || []);
        }
      } catch {
        if (!cancelled) setPostPickerResults([]);
      } finally {
        if (!cancelled) setPostPickerLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showPostPicker, postPickerQuery]);

  // Autocomplete state
  const [autocompleteTrigger, setAutocompleteTrigger] = useState<'/' | '@' | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    onResult: (text) => {
      setInputValue((prev) => (prev ? `${prev} ${text}` : text));
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputValue(text);

    const cursor = e.target.selectionStart || text.length;
    const textBeforeCursor = text.slice(0, cursor);
    const lastWord = textBeforeCursor.split(/\s+/).pop() || '';

    if (lastWord.startsWith('/') || lastWord.startsWith('@')) {
      setAutocompleteTrigger(lastWord[0] as '/' | '@');
      setAutocompleteQuery(lastWord);
    } else {
      setAutocompleteTrigger(null);
      setAutocompleteQuery('');
    }
  };

  const handleSelectTool = (tool: MAITool) => {
    const tag = autocompleteTrigger === '/' ? tool.slashCommand : tool.mentionTag;
    const words = inputValue.split(/\s+/);
    words.pop();
    const newPrefix = words.length > 0 ? `${words.join(' ')} ` : '';
    const updated = `${newPrefix}${tag} `;

    setInputValue(updated);
    setAutocompleteTrigger(null);
    setAutocompleteQuery('');
    inputRef.current?.focus();
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputValue).trim();
    if (!textToSend || isLoading) return;

    if (isListening) {
      stopListening();
      resetTranscript();
    }

    const currentAttachment = attachedPost;
    const userMsg: MessageItem = {
      id: generateMessageId(),
      sender: 'user',
      content: textToSend,
      attachment: currentAttachment
        ? { id: currentAttachment.id, username: currentAttachment.username, excerpt: currentAttachment.excerpt }
        : undefined,
      timestamp: formatCurrentTime(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setAutocompleteTrigger(null);
    setShowPostPicker(false);
    setIsLoading(true);

    try {
      const response = await ApiService.chatMAI(
        textToSend,
        undefined,
        selectedModel,
        currentAttachment ? { post_id: currentAttachment.id } : undefined
      );
      const assistantMsg: MessageItem = {
        id: generateMessageId(),
        sender: 'assistant',
        content: response.reply,
        toolResult: response.toolExecuted,
        timestamp: formatCurrentTime(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      refreshQuotas();

      if (response.toolExecuted?.name === 'create_post' && onPostCreated) {
        onPostCreated();
      }
    } catch (err: any) {
      const errorMsg: MessageItem = {
        id: generateMessageId(),
        sender: 'assistant',
        content: `⚠️ Une erreur est survenue : ${err.message || 'Impossible de joindre mAI'}`,
        timestamp: formatCurrentTime(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn select-none">
      <div className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl animate-slideLeft">
        {/* Header */}
        <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between bg-black/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white text-black font-black flex items-center justify-center text-sm shrink-0">
              <Sparkles className="w-4 h-4 text-black" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs text-white truncate">Assistant mAI</div>
              <div className="text-[10px] text-zinc-500 font-mono">Multi-modèles</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ModelDropdown
              models={availableModels}
              selectedModelId={selectedModel}
              onSelectModel={setSelectedModel}
            />

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quota Strip */}
        <div className="px-4 py-2.5 bg-zinc-900/50 border-b border-zinc-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <Zap className="w-3.5 h-3.5 text-white" />
            <span>Tokens hebdo : <strong className="text-white font-mono">{quotas?.weeklyTokens.percent || 0}%</strong></span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <ImageIcon className="w-3.5 h-3.5 text-white" />
            <span>Images : <strong className="text-white font-mono">{quotas?.dailyImages.used || 0}/{quotas?.dailyImages.limit || 5}</strong></span>
          </div>
        </div>

        {/* Bannière utilisateur */}
        <div className="mx-3 mt-3 p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center gap-3 animate-fadeIn">
          <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-black shrink-0">
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">
              Bienvenue, @{user?.username || 'utilisateur'} !
            </div>
            <div className="text-[10px] text-zinc-400 truncate">
              Laguna XS 2.1 sélectionné par défaut.
            </div>
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
              <Sparkles className="w-6 h-6 text-zinc-600 animate-pulse" />
              <p className="text-xs font-medium text-zinc-400">Prêt à répondre à vos requêtes.</p>
              <p className="text-[11px] text-zinc-600 max-w-xs">
                Tapez votre question ou utilisez les commandes @ ou /.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-white text-black font-medium'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Publication mentionnée jointe au message */}
                {msg.attachment && (
                  <div className="mt-2.5 p-2 rounded-xl bg-zinc-100 text-zinc-600 border border-zinc-200 flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-500" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-zinc-800 truncate">
                        Publication de @{msg.attachment.username}
                      </div>
                      <p className="text-[10px] leading-snug line-clamp-2">{msg.attachment.excerpt}…</p>
                    </div>
                  </div>
                )}

                {/* Tool Execution Visual Card if applicable */}
                {msg.toolResult && msg.toolResult.result?.result && (
                  <div className="mt-3 p-2.5 rounded-xl bg-black/60 border border-zinc-700/80 text-xs text-zinc-300 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-white font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      <span>Action mAI effectuée</span>
                    </div>

                    {msg.toolResult.result.result.imageUrl && (
                      <img
                        src={msg.toolResult.result.result.imageUrl}
                        alt="Généré"
                        className="w-full h-36 rounded-lg object-cover mt-2 border border-zinc-800"
                      />
                    )}
                  </div>
                )}
                {/* Interactive Actions (Copy / Edit) */}
                <div className={`flex items-center gap-2 pt-2 mt-2 border-t text-[10px] font-mono ${msg.sender === 'user' ? 'border-zinc-200 text-zinc-600 justify-end' : 'border-zinc-800 text-zinc-400 justify-start'}`}>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    className="hover:underline flex items-center gap-1"
                  >
                    <span>Copier</span>
                  </button>
                  {msg.sender === 'user' && (
                    <button
                      type="button"
                      onClick={() => {
                        setInputValue(msg.content);
                        inputRef.current?.focus();
                      }}
                      className="hover:underline flex items-center gap-1"
                    >
                      <span>Modifier</span>
                    </button>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-zinc-600 mt-1 px-1 font-mono">{msg.timestamp}</span>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono p-2">
              <Sparkles className="w-3.5 h-3.5 animate-spin text-white" />
              <span>mAI exécute la commande...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Tools Strip */}
        <div className="px-3 py-2 flex gap-1.5 overflow-x-auto no-scrollbar border-t border-zinc-800/60 bg-black/40">
          {AVAILABLE_MAI_TOOLS.slice(0, 5).map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleSendMessage(tool.samplePrompt)}
              className="py-1 px-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] font-mono whitespace-nowrap hover:text-white hover:border-zinc-700 transition-colors"
            >
              {tool.slashCommand}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-zinc-800 bg-black/90 relative">
          {autocompleteTrigger && !showPostPicker && (
            <ToolAutocomplete
              trigger={autocompleteTrigger}
              query={autocompleteQuery}
              onSelect={handleSelectTool}
              onClose={() => setAutocompleteTrigger(null)}
              specialAction={
                attachedPost
                  ? undefined
                  : {
                      label: autocompleteTrigger === '/' ? '/post' : '@post',
                      description:
                        'Joindre une publication Vibe (contenu, médias, stats, commentaires) et poser une question dessus',
                      onSelect: () => {
                        const words = inputValue.split(/\s+/);
                        words.pop();
                        setInputValue(words.length > 0 ? `${words.join(' ')} ` : '');
                        setAutocompleteTrigger(null);
                        setAutocompleteQuery('');
                        setPostPickerQuery('');
                        setPostPickerResults([]);
                        setShowPostPicker(true);
                      },
                    }
              }
            />
          )}

          {/* Sélecteur de publications à mentionner */}
          {showPostPicker && (
            <div className="absolute bottom-full left-0 mb-2 w-full bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-scaleUp">
              <div className="p-2 border-b border-zinc-900 bg-zinc-900/50 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={postPickerQuery}
                  onChange={(e) => setPostPickerQuery(e.target.value)}
                  placeholder="Rechercher une publication à mentionner…"
                  className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPostPicker(false)}
                  className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                  title="Fermer le sélecteur"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-zinc-900">
                {postPickerLoading && (
                  <div className="p-3 flex items-center justify-center gap-2 text-[11px] text-zinc-500 font-mono">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Recherche…
                  </div>
                )}
                {!postPickerLoading && postPickerResults.length === 0 && (
                  <div className="p-3 text-center text-[11px] text-zinc-500">
                    Aucune publication trouvée.
                  </div>
                )}
                {!postPickerLoading &&
                  postPickerResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setAttachedPost({
                          id: p.id,
                          username: p.username || 'utilisateur',
                          excerpt: (p.content || '').slice(0, 90),
                        });
                        setShowPostPicker(false);
                        inputRef.current?.focus();
                      }}
                      className="w-full p-2.5 flex items-start gap-2.5 text-left hover:bg-zinc-900 transition-colors"
                    >
                      <FileText className="w-4 h-4 mt-0.5 text-zinc-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">
                          @{p.username} · {p.display_name || p.username}
                        </div>
                        <p className="text-[11px] text-zinc-500 line-clamp-2 leading-snug">
                          {p.content || '—'}
                        </p>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Chip de la publication mentionnée */}
          {attachedPost && (
            <div className="mb-2 flex items-center gap-2 p-2 rounded-xl bg-zinc-900 border border-zinc-800 animate-fadeIn">
              <FileText className="w-4 h-4 text-white shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-white truncate">
                  Publication de @{attachedPost.username}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">{attachedPost.excerpt}…</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttachedPost(null);
                  onClearAttachedPost?.();
                }}
                className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Retirer la publication jointe"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            {isSupported && (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`p-2.5 rounded-full transition-colors ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
                title={isListening ? 'Arrêter l’enregistrement' : 'Dicter le message'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="Tapez @ ou / pour un outil ou écrivez..."
              className="flex-1 p-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />

            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="p-2.5 rounded-full bg-white text-black hover:bg-zinc-200 disabled:opacity-40 transition-all shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
