import React, { useState } from 'react';
import { Search, ChevronDown, Sparkles, Shirt, Wand2, Activity } from 'lucide-react';
import { AVAILABLE_WEB_LLM_MODELS, type ModelInfo } from '../services/webLlmService';

export interface ModelFamily {
  id: string;
  name: string;
  matchName?: string;
  iconUrl?: string;
  icon?: React.ReactNode;
}

export const FAMILIES: ModelFamily[] = [
  { id: 'llama', name: 'Llama', iconUrl: 'https://cdn.simpleicons.org/meta' },
  { id: 'deepseek', name: 'DeepSeek', iconUrl: 'https://cdn.simpleicons.org/deepseek' },
  { id: 'qwen', name: 'Qwen', iconUrl: 'https://cdn.simpleicons.org/qwen' },
  { id: 'gemma', name: 'Gemma', iconUrl: 'https://cdn.simpleicons.org/google' },
  { id: 'phi', name: 'Phi', iconUrl: 'https://cdn.simpleicons.org/microsoft' },
  { id: 'mistral', name: 'Mistral', iconUrl: 'https://cdn.simpleicons.org/mistralai' },
  { id: 'smollm', name: 'SmolLM', iconUrl: 'https://cdn.simpleicons.org/huggingface' },
  { id: 'stablelm', name: 'StableLM', icon: <Sparkles className="w-4 h-4 text-purple-400" /> },
  { id: 'redpajama', name: 'RedPajama', icon: <Shirt className="w-4 h-4 text-red-400" /> },
  { id: 'wizard', name: 'Wizard Math', matchName: 'Wizard', icon: <Wand2 className="w-4 h-4 text-amber-400" /> },
];

interface ModelSelectorGridProps {
  models: ModelInfo[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export const ModelSelectorGrid: React.FC<ModelSelectorGridProps> = ({ models, value, onChange, disabled }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<string | null>(null);

  const displayModels = models.filter(m => {
    const matchesSearch = searchQuery ? m.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
    const familyObj = FAMILIES.find(f => f.id === familyFilter);
    const matchesFamily = familyFilter && familyObj ? m.name.toLowerCase().includes((familyObj.matchName || familyObj.name).toLowerCase()) : true;
    return matchesSearch && matchesFamily;
  });

  return (
    <div className={`space-y-4 rounded-xl ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          type="text"
          placeholder="Search model..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FAMILIES.map(family => (
          <button
            key={family.id}
            type="button"
            onClick={() => setFamilyFilter(familyFilter === family.id ? null : family.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${familyFilter === family.id ? 'bg-white/20 border-white/30 text-white' : 'bg-transparent border-white/10 text-white/60 hover:bg-white/5 hover:text-white'}`}
          >
            {family.iconUrl ? (
              <img src={family.iconUrl} alt={family.name} className="w-4 h-4" />
            ) : (
              <div className="flex items-center justify-center">{family.icon}</div>
            )}
            {family.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {displayModels.map(model => {
          const family = FAMILIES.find(f => model.name.toLowerCase().includes((f.matchName || f.name).toLowerCase())) || FAMILIES[0];
          const isSelected = value === model.id;
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => onChange(model.id)}
              className={`flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${isSelected ? 'bg-sky-500/20 border-sky-500/50' : 'bg-black/20 border-white/10 hover:bg-white/5'}`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="shrink-0 w-6 h-6 rounded-md bg-white/5 flex items-center justify-center">
                  {family.iconUrl ? (
                    <img src={family.iconUrl} alt={family.name} className="w-3.5 h-3.5" />
                  ) : (
                    <div className="scale-75 flex items-center justify-center">{family.icon}</div>
                  )}
                </div>
                <span className="text-xs text-white/80 font-medium truncate">{model.name}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />
            </button>
          );
        })}
      </div>

      {displayModels.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
          No WebLLM models match the current filters.
        </div>
      )}

      {AVAILABLE_WEB_LLM_MODELS.find(m => m.id === value) && (
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/40 pt-2 pl-1">
          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3" />
            Est. VRAM Usage: {AVAILABLE_WEB_LLM_MODELS.find(m => m.id === value)?.vram_required_MB} MB
          </div>
          <div>
            Mode: {AVAILABLE_WEB_LLM_MODELS.find(m => m.id === value)?.capabilities?.includes('vision') ? 'Vision + text' : 'Text only'}
          </div>
        </div>
      )}
    </div>
  );
};
