import React, { useState } from 'react';
import { Search, Sparkles, Shirt, Wand2, Activity, Zap, Layers, Filter, X, Trash2 } from 'lucide-react';
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
  {
    id: 'gemma',
    name: 'Gemma',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17Z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z" />
        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z" />
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" />
      </svg>
    ),
  },
  {
    id: 'phi',
    name: 'Phi',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
        <rect x="1" y="1" width="10" height="10" fill="#f25022" rx="1" />
        <rect x="13" y="1" width="10" height="10" fill="#7fba00" rx="1" />
        <rect x="1" y="13" width="10" height="10" fill="#00a4ef" rx="1" />
        <rect x="13" y="13" width="10" height="10" fill="#ffb900" rx="1" />
      </svg>
    ),
  },
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
  showPrecisionBadges?: boolean;
  loadedModelId?: string | null;
  onUnload?: () => void;
}

const GROUP_CONFIGS = {
  f16: {
    title: 'f16 Models',
    badge: '16-bit Float',
    subtitle: 'High Performance & Lower VRAM',
    icon: <Zap className="w-3.5 h-3.5 text-emerald-400" />,
  },
  f32: {
    title: 'f32 Models',
    badge: '32-bit Float',
    subtitle: 'Maximum Hardware Compatibility',
    icon: <Layers className="w-3.5 h-3.5 text-sky-400" />,
  },
  other: {
    title: 'Other Models',
    badge: 'Custom',
    subtitle: 'Alternative Precision',
    icon: <Activity className="w-3.5 h-3.5 text-white/60" />,
  },
};

export const ModelSelectorGrid: React.FC<ModelSelectorGridProps> = ({ models, value, onChange, disabled, showPrecisionBadges, loadedModelId, onUnload }) => {
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
      {/* Designated Selection & VRAM Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-black/30 border border-white/10 shadow-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Selected Model:</span>
          <span className="font-bold text-white text-sm">
            {models.find(m => m.id === value)?.name || value}
          </span>
          {models.find(m => m.id === value)?.precision && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              models.find(m => m.id === value)?.precision === 'f16'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {models.find(m => m.id === value)?.precision.toUpperCase()}
            </span>
          )}
        </div>

        {loadedModelId ? (
          <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Active in Memory:</span>
              <strong className="text-white font-semibold">{models.find(m => m.id === loadedModelId)?.name || loadedModelId}</strong>
            </div>
            {onUnload && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnload();
                }}
                title="Unload model from GPU memory"
                className="ml-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Unload
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-white/60 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            <span>Memory: Idle (Not loaded)</span>
          </div>
        )}
      </div>

      {/* Contained Filter & Search Toolbar with Colored Border */}
      <div className="p-3.5 rounded-xl bg-black/30 border border-sky-500/40 ring-1 ring-sky-500/15 space-y-3 shadow-sm">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search model name (e.g. Gemma, Llama, Qwen)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-lg py-2 pl-9 pr-8 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-0.5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Section Header & Filter Pills */}
        <div className="space-y-2 pt-1 border-t border-white/5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-white/70 uppercase tracking-widest">
              <Filter className="w-3 h-3 text-white/60" />
              Filter by Family
            </span>
            {familyFilter && (
              <button
                type="button"
                onClick={() => setFamilyFilter(null)}
                className="text-[10px] font-semibold text-white/50 hover:text-white transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {/* 'All Families' Pill */}
            <button
              type="button"
              onClick={() => setFamilyFilter(null)}
              className={`px-2.5 py-1 rounded-full text-xs transition-all flex items-center gap-1.5 ${
                familyFilter === null
                  ? 'bg-white/20 border border-white/30 text-white font-semibold shadow-xs'
                  : 'bg-white/[0.03] border border-white/10 text-white/60 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              All Families
            </button>

            {/* Individual Family Pills */}
            {FAMILIES.map(family => {
              const isActive = familyFilter === family.id;
              return (
                <button
                  key={family.id}
                  type="button"
                  onClick={() => setFamilyFilter(isActive ? null : family.id)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-white/20 border border-white/30 text-white font-semibold shadow-xs'
                      : 'bg-white/[0.03] border border-white/10 text-white/60 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                    {family.iconUrl ? (
                      <img src={family.iconUrl} alt="" className="w-3.5 h-3.5 object-contain" />
                    ) : (
                      <div className="[&>svg]:w-3.5 [&>svg]:h-3.5 flex items-center justify-center">{family.icon}</div>
                    )}
                  </div>
                  <span>{family.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {[
          { key: 'f16' as const, models: displayModels.filter(m => m.precision === 'f16') },
          { key: 'f32' as const, models: displayModels.filter(m => m.precision === 'f32') },
          { key: 'other' as const, models: displayModels.filter(m => m.precision !== 'f16' && m.precision !== 'f32') },
        ]
          .filter(group => group.models.length > 0)
          .map(group => {
            const config = GROUP_CONFIGS[group.key];
            return (
              <div key={group.key} className="space-y-2">
                <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-white/5 border border-white/5 flex items-center justify-center">
                      {config.icon}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-white tracking-wide uppercase">
                        {config.title}
                      </span>
                      <span className="text-[11px] text-white/70 font-medium hidden sm:inline">
                        — {config.subtitle}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {group.models.map(model => {
                    const family = FAMILIES.find(f => model.name.toLowerCase().includes((f.matchName || f.name).toLowerCase())) || FAMILIES[0];
                    const isSelected = value === model.id;
                    const isLoaded = loadedModelId === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => onChange(model.id)}
                        className={`group flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-sky-500/15 border-sky-500/50 shadow-md shadow-sky-500/5 ring-1 ring-sky-500/20'
                            : isLoaded
                              ? 'bg-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/50'
                              : 'bg-black/20 border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-sky-500/20 text-sky-300' : isLoaded ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/70 group-hover:bg-white/10'
                          }`}>
                            {family.iconUrl ? (
                              <img src={family.iconUrl} alt={family.name} className="w-3.5 h-3.5" />
                            ) : (
                              <div className="flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">{family.icon}</div>
                            )}
                          </div>
                          <span className={`text-xs truncate transition-colors ${isSelected ? 'text-white font-semibold' : 'text-white/80 group-hover:text-white font-medium'}`}>
                            {model.name}
                          </span>
                        </div>
                        {isLoaded && (
                          <span className="shrink-0 flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Loaded
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      {displayModels.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
          No WebLLM models match the current filters.
        </div>
      )}
    </div>
  );
};
