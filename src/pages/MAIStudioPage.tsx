/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — mAI STUDIO & CHAT (src/pages/MAIStudioPage.tsx)
 * AI Multi-Model Hub, Copy/Edit Prompt, Model Selector, @ and / Command Support
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Send,
  RefreshCw,
  Zap,
  Loader2,
  Copy,
  Check,
  Edit2,
  Share2,
  ShieldCheck,
  ShieldAlert,
  SquarePen,
  XCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiService } from '../services/api';
import { ToolAutocomplete } from '../components/layout/ToolAutocomplete';
import { MAITool } from '../data/maiTools';
import { ModelDropdown } from '../components/common/ModelDropdown';

interface ChatMessage {
  id: string;
  sender: 'user' | 'mai';
  content: string;
  toolExecuted?: any;
  modelUsed?: string;
  time: string;
  requiresApproval?: boolean;
}

const DEFAULT_MODELS = [
  { id: 'openrouter/free', name: 'mAI Auto Free', description: 'Sélection automatique du meilleur modèle gratuit actif', provider: 'mDevsLabs' },
  { id: 'poolside/laguna-xs-2.1:free', name: 'Laguna XS 2.1', description: 'Modèle IA par défaut haute performance', provider: 'Poolside' },
  { id: 'mai-1.5-apex', name: 'mAI 1.5 Apex', description: 'Modèle IA d\'élite mAI — Raisonnement profond & Vision', provider: 'mDevsLabs' },
  { id: 'mai-1.5-light', name: 'mAI 1.5 Light', description: 'Modèle agile mAI ultra-rapide', provider: 'mDevsLabs' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Vitesse instantanée et compréhension multimodale', provider: 'Google' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Raisonnement avancé et synthèse complexe', provider: 'Google' },
  { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', description: 'Écriture élégante et codage expert', provider: 'Anthropic' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'Modèle polyvalent haut de gamme', provider: 'OpenAI' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', description: 'Performances logiques et mathématiques', provider: 'DeepSeek' },
];

export const MAIStudioPage: React.FC = () => {
  const { user, quotas, refreshQuotas } = useAuth();
  const [selectedModel, setSelectedModel] = useState<string>('openrouter/free');
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; description: string; provider?: string }>>(DEFAULT_MODELS);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [promptInput, setPromptInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Approbation des outils sensibles : l'IA doit demander l'accord de
  // l'utilisateur, sauf si l'auto-approbation a été activée en paramètre.
  const [pendingTool, setPendingTool] = useState<{ name: string; args: any } | null>(null);
  const [autoApprove, setAutoApprove] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState(false);

  // Autocomplete state
  const [autocompleteTrigger, setAutocompleteTrigger] = useState<'/' | '@' | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await ApiService.getModels();
        if (res.models && res.models.length > 0) {
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
    loadModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Chargement de l'historique persisté de la conversation mAI
  useEffect(() => {
    ApiService.getMAIHistory()
      .then((res) => {
        if (res.messages && res.messages.length > 0) {
          setMessages(
            res.messages.map((m) => ({
              id: m.id,
              sender: m.role === 'assistant' ? ('mai' as const) : ('user' as const),
              content: m.content,
              time: new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Démarrer une nouvelle conversation mAI (vide l'historique actif)
  const handleNewConversation = async () => {
    try {
      await ApiService.newMAIConversation();
      setMessages([]);
      setPendingTool(null);
      inputRef.current?.focus();
    } catch {}
  };

  // Charger le réglage d'auto-approbation des outils mAI
  useEffect(() => {
    ApiService.getSettings()
      .then((res) => setAutoApprove(Boolean(res?.settings?.mai_auto_approve_tools)))
      .catch(() => {});
  }, []);

  const toggleAutoApprove = async () => {
    const next = !autoApprove;
    setAutoApprove(next);
    try {
      await ApiService.updateSettings({ mai_auto_approve_tools: next });
    } catch {
      setAutoApprove(!next);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setPromptInput(text);

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
    const words = promptInput.split(/\s+/);
    words.pop();
    const newPrefix = words.length > 0 ? `${words.join(' ')} ` : '';
    const updated = `${newPrefix}${tag} `;

    setPromptInput(updated);
    setAutocompleteTrigger(null);
    setAutocompleteQuery('');
    inputRef.current?.focus();
  };

  const handleSendPrompt = async (textToSend?: string) => {
    const query = (textToSend || promptInput).trim();
    if (!query || isExecuting) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      content: query,
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPromptInput('');
    setAutocompleteTrigger(null);
    setIsExecuting(true);

    try {
      const res = await ApiService.chatMAI(query, undefined, selectedModel);
      const maiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'mai',
        content: res.reply,
        toolExecuted: res.toolExecuted,
        modelUsed: res.modelUsed || selectedModel,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        requiresApproval: Boolean(res.requiresApproval),
      };
      setMessages((prev) => [...prev, maiMsg]);
      if (res.requiresApproval && res.pendingTool) {
        setPendingTool(res.pendingTool);
      }
      refreshQuotas();
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'mai',
        content: `⚠️ Erreur : ${err.message || 'Impossible de joindre mAI.'}`,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleApproveTool = async (approved: boolean) => {
    if (!pendingTool || isApproving) return;
    setIsApproving(true);
    const tool = pendingTool;
    setPendingTool(null);

    const pushMaiMsg = (content: string, toolExecuted?: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          sender: 'mai',
          content,
          toolExecuted,
          modelUsed: selectedModel,
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    };

    if (!approved) {
      pushMaiMsg(`🚫 Très bien, je n'exécute pas l'outil « ${tool.name} ». Dites-moi si je peux faire autre chose pour vous.`);
      setIsApproving(false);
      return;
    }

    try {
      const res = await ApiService.executeMAITool(tool.name, tool.args, selectedModel);
      pushMaiMsg(res.reply, res.toolExecuted);
      refreshQuotas();
    } catch (err: any) {
      pushMaiMsg(`⚠️ Erreur lors de l'exécution de « ${tool.name} » : ${err.message || 'réessayez plus tard.'}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleEditPrompt = (text: string) => {
    setPromptInput(text);
    inputRef.current?.focus();
  };

  const handlePublishAsPost = (content: string, imageUrl?: string) => {
    // Préremplit le composer Vibe — l'utilisateur valide la publication lui-même
    window.dispatchEvent(
      new CustomEvent('vibe:open_composer', { detail: { content, imageUrl } })
    );
  };

  return (
    <div className="flex-1 h-screen border-r border-zinc-800 bg-black flex flex-col select-none">
      {/* Top Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/80 border-b border-zinc-800 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center font-black">
            <Sparkles className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">
              <span>mAI</span>
            </h1>
            <p className="text-xs text-zinc-400">Assistant IA unifié & modèles intelligents</p>
          </div>
        </div>

        {/* Model Selector Bar */}
        <div className="flex items-center gap-2">
          <ModelDropdown
            models={availableModels}
            selectedModelId={selectedModel}
            onSelectModel={setSelectedModel}
          />

          <button
            onClick={handleNewConversation}
            title="Nouvelle discussion mAI"
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <SquarePen className="w-4 h-4" />
          </button>

          <button
            onClick={toggleAutoApprove}
            title={autoApprove ? 'Auto-approbation des outils mAI activée' : 'Approbation manuelle des outils mAI'}
            className={`p-2 rounded-full transition-colors ${
              autoApprove ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            {autoApprove ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          </button>

          <button
            onClick={refreshQuotas}
            title="Actualiser les quotas"
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Quotas Quick Strip */}
      {quotas && (
        <div className="px-4 py-2 border-b border-zinc-900 bg-black/40 flex items-center justify-between text-xs text-zinc-400 font-mono">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-zinc-300">
              <Zap className="w-3.5 h-3.5 text-white" />
              <span>Tokens : {quotas.weeklyTokens.used.toLocaleString()} / {quotas.weeklyTokens.limit.toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-1 text-zinc-300">
              <ImageIcon className="w-3.5 h-3.5 text-white" />
              <span>Images : {quotas.dailyImages.used} / {quotas.dailyImages.limit}</span>
            </span>
          </div>
          <span className="text-zinc-500">Forfait {quotas.tier}</span>
        </div>
      )}

      {/* Bannière utilisateur */}
      <div className="mx-4 mt-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900/80 to-zinc-950 border border-zinc-800 shadow-xl flex items-center justify-between gap-4 animate-fadeIn">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center font-black shrink-0 shadow-md">
            <Sparkles className="w-5 h-5 text-black" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
              Bienvenue, <span className="text-white font-black">@{user?.username || 'utilisateur'}</span> !
            </h2>
            <p className="text-xs text-zinc-400 truncate">
              Assistant mAI configuré sur Laguna XS 2.1 — Posez vos questions ou utilisez les commandes @ et /.
            </p>
          </div>
        </div>
      </div>

      {/* Chat Messages Log */}
      <div className="flex-1 min-h-0 p-4 space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-2">
            <Sparkles className="w-8 h-8 text-zinc-600 animate-pulse" />
            <p className="text-sm font-medium text-zinc-400">Comment puis-je vous aider aujourd'hui ?</p>
            <p className="text-xs text-zinc-600 max-w-sm">
              Posez une question, ou tapez <span className="font-mono text-zinc-400">/image</span> pour créer un visuel, <span className="font-mono text-zinc-400">/search</span> pour chercher sur le web.
            </p>
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.sender === 'user';
          const isCopied = copiedId === m.id;

          return (
            <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}>
              <div
                className={`max-w-[85%] rounded-3xl p-4 text-xs sm:text-sm leading-relaxed relative ${
                  isMe
                    ? 'bg-white text-black font-medium rounded-tr-sm shadow-lg'
                    : 'bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-tl-sm'
                }`}
              >
                {!isMe && (
                  <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-zinc-900 text-[11px] font-mono text-zinc-400">
                    <span className="flex items-center gap-1 font-bold text-white">
                      <Sparkles className="w-3 h-3" />
                      mAI ({m.modelUsed || selectedModel})
                    </span>
                    <span>{m.time}</span>
                  </div>
                )}

                <div className="whitespace-pre-wrap leading-relaxed space-y-2">
                  {m.content}
                </div>

                {/* Panneau d'approbation utilisateur pour les outils sensibles */}
                {m.requiresApproval && pendingTool && (
                  <div className="mt-3 p-3 rounded-2xl bg-zinc-900 border border-amber-500/40 space-y-2">
                    <p className="text-[11px] font-mono text-amber-300 uppercase tracking-wide">
                      🔐 Outil sensible : {pendingTool.name}
                    </p>
                    <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                      {JSON.stringify(pendingTool.args, null, 2)}
                    </pre>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApproveTool(true)}
                        disabled={isApproving}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-colors disabled:opacity-50"
                      >
                        {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Approuver
                      </button>
                      <button
                        onClick={() => handleApproveTool(false)}
                        disabled={isApproving}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold hover:bg-zinc-700 transition-colors disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Refuser
                      </button>
                    </div>
                  </div>
                )}

                {/* Rich Tool Execution Display */}
                {m.toolExecuted?.result?.result?.imageUrl && (
                  <div className="mt-3 rounded-2xl overflow-hidden border border-zinc-800">
                    <img
                      src={m.toolExecuted.result.result.imageUrl}
                      alt="Génération mAI"
                      className="w-full max-h-96 object-cover"
                    />
                  </div>
                )}

                {/* Interactive Message Actions (Copy / Edit / Share) */}
                <div className={`flex items-center gap-2 pt-2.5 mt-2 border-t text-[11px] font-mono ${isMe ? 'border-zinc-200 text-zinc-600 justify-end' : 'border-zinc-900 text-zinc-400 justify-between'}`}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyText(m.id, m.content)}
                      className="flex items-center gap-1 hover:text-white transition-colors p-1 rounded-md"
                      title="Copier le texte"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'Copié !' : 'Copier'}</span>
                    </button>

                    {isMe && (
                      <button
                        type="button"
                        onClick={() => handleEditPrompt(m.content)}
                        className="flex items-center gap-1 hover:text-black transition-colors p-1 rounded-md"
                        title="Modifier le prompt"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Modifier</span>
                      </button>
                    )}
                  </div>

                  {!isMe && (
                    <button
                      type="button"
                      onClick={() => handlePublishAsPost(m.content, m.toolExecuted?.result?.result?.imageUrl)}
                      className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors p-1"
                      title="Publier sur Vibe"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Publier sur Vibe</span>
                    </button>
                  )}
                </div>
              </div>

              {isMe && (
                <span className="text-[10px] text-zinc-500 px-2 mt-1 font-mono">{m.time}</span>
              )}
            </div>
          );
        })}

        {isExecuting && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 p-3 bg-zinc-950 border border-zinc-800 rounded-2xl w-fit">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
            <span>mAI analyse votre requête ({selectedModel})...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Prompt Input Form with @ and / autocomplete */}
      <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-950 sticky bottom-0 z-20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendPrompt();
          }}
          className="relative flex items-center gap-2"
        >
          {autocompleteTrigger && (
            <ToolAutocomplete
              trigger={autocompleteTrigger}
              query={autocompleteQuery}
              onSelect={handleSelectTool}
              onClose={() => setAutocompleteTrigger(null)}
            />
          )}

          <input
            ref={inputRef}
            type="text"
            value={promptInput}
            onChange={handleInputChange}
            placeholder="Écrivez un message, ou tapez @ ou / pour un outil (ex: /image, /search, /trends)..."
            className="flex-1 py-3 px-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />

          <button
            type="submit"
            disabled={!promptInput.trim() || isExecuting}
            className="py-3 px-6 rounded-2xl bg-white text-black font-bold text-xs hover:bg-zinc-200 transition-all flex items-center gap-1.5 shadow-lg disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Envoyer</span>
          </button>
        </form>
      </div>
    </div>
  );
};
