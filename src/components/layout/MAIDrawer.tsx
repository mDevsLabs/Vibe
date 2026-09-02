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
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { ToolAutocomplete } from './ToolAutocomplete';
import { AVAILABLE_MAI_TOOLS, MAITool } from '../../data/maiTools';
import { ModelDropdown, AIModel } from '../common/ModelDropdown';

interface MAIDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
}

interface MessageItem {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  toolResult?: any;
  timestamp: string;
}

const DEFAULT_MODELS: AIModel[] = [
  { id: 'mai-1.5-apex', name: 'mAI 1.5 Apex', description: 'Modèle IA d\'élite mAI — Raisonnement profond & Vision', provider: 'mDevsLabs' },
  { id: 'mai-1.5-light', name: 'mAI 1.5 Light', description: 'Modèle agile mAI ultra-rapide', provider: 'mDevsLabs' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Vitesse instantanée et compréhension multimodale', provider: 'Google' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Raisonnement avancé et synthèse complexe', provider: 'Google' },
  { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', description: 'Écriture élégante et codage expert', provider: 'Anthropic' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'Modèle polyvalent haut de gamme', provider: 'OpenAI' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', description: 'Performances logiques et mathématiques', provider: 'DeepSeek' },
];

export const MAIDrawer: React.FC<MAIDrawerProps> = ({
  isOpen,
  onClose,
  onPostCreated,
}) => {
  const { user, quotas, refreshQuotas } = useAuth();
  const [selectedModel, setSelectedModel] = useState<string>('mai-1.5-apex');
  const [availableModels, setAvailableModels] = useState<AIModel[]>(DEFAULT_MODELS);
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: '1',
      sender: 'assistant',
      content: `Bonjour @${user?.username || 'vous'} ! Je suis mAI. Utilisez @ ou / pour exécuter des outils réels (ex: /image, /search, /trends, /stats, /quotas...). Comment puis-je vous aider ?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await ApiService.getModels();
        if (res?.models && res.models.length > 0) {
          setAvailableModels(res.models);
        }
      } catch {}
    };
    if (isOpen) {
      loadModels();
    }
  }, [isOpen]);

  // Autocomplete state
  const [autocompleteTrigger, setAutocompleteTrigger] = useState<'/' | '@' | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    isListening,
    transcript,
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

    const userMsg: MessageItem = {
      id: Date.now().toString(),
      sender: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setAutocompleteTrigger(null);
    setIsLoading(true);

    try {
      const response = await ApiService.chatMAI(textToSend, undefined, selectedModel);
      const assistantMsg: MessageItem = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        content: response.reply,
        toolResult: response.toolExecuted,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      refreshQuotas();

      if (response.toolExecuted?.name === 'create_post' && onPostCreated) {
        onPostCreated();
      }
    } catch (err: any) {
      const errorMsg: MessageItem = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        content: `⚠️ Une erreur est survenue : ${err.message || 'Impossible de joindre mAI'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-white text-black font-medium'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

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
          {autocompleteTrigger && (
            <ToolAutocomplete
              trigger={autocompleteTrigger}
              query={autocompleteQuery}
              onSelect={handleSelectTool}
              onClose={() => setAutocompleteTrigger(null)}
            />
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
