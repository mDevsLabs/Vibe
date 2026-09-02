import React from 'react';
import {
  Image as ImageIcon,
  Globe,
  FileText,
  ShieldCheck,
  Sparkles,
  Languages,
  Send,
  TrendingUp,
  BarChart3,
  Zap
} from 'lucide-react';
import { AVAILABLE_MAI_TOOLS, MAITool } from '../../data/maiTools';

interface ToolAutocompleteProps {
  query: string;
  trigger: '/' | '@';
  onSelect: (tool: MAITool) => void;
  onClose: () => void;
}

const iconMap: Record<string, React.ElementType> = {
  Image: ImageIcon,
  Globe: Globe,
  FileText: FileText,
  ShieldCheck: ShieldCheck,
  Sparkles: Sparkles,
  Languages: Languages,
  Send: Send,
  TrendingUp: TrendingUp,
  BarChart3: BarChart3,
  Zap: Zap,
};

export const ToolAutocomplete: React.FC<ToolAutocompleteProps> = ({
  query,
  trigger,
  onSelect,
}) => {
  const cleanQ = query.toLowerCase().replace(/^[/@]/, '');

  const matches = AVAILABLE_MAI_TOOLS.filter((t) => {
    if (!cleanQ) return true;
    const tag = trigger === '/' ? t.slashCommand : t.mentionTag;
    return (
      tag.toLowerCase().includes(cleanQ) ||
      t.name.toLowerCase().includes(cleanQ) ||
      t.description.toLowerCase().includes(cleanQ)
    );
  }).slice(0, 6);

  if (matches.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-scaleUp">
      <div className="p-2 border-b border-zinc-900 bg-zinc-900/50 flex items-center justify-between text-[11px] font-mono text-zinc-400">
        <span>Outils & Actions mAI ({trigger === '/' ? 'Commandes /' : 'Mentions @'})</span>
        <span>{matches.length} suggéré(s)</span>
      </div>

      <div className="divide-y divide-zinc-900 max-h-56 overflow-y-auto">
        {matches.map((tool) => {
          const Icon = iconMap[tool.iconName] || Sparkles;
          const label = trigger === '/' ? tool.slashCommand : tool.mentionTag;

          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelect(tool)}
              className="w-full p-2.5 flex items-center gap-3 text-left hover:bg-zinc-900 transition-colors group"
            >
              <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 group-hover:bg-white group-hover:text-black transition-colors text-white shrink-0">
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-white group-hover:text-white">
                    {label}
                  </span>
                  <span className="text-[11px] text-zinc-400 truncate font-semibold">
                    {tool.name}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                  {tool.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
