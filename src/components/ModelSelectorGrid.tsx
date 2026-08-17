import React, { useState, useMemo } from 'react';
import {
  Search,
  Sparkles,
  Shirt,
  Wand2,
  Activity,
  Zap,
  Layers,
  X,
  Trash2,
  ArrowLeft,
  Eye,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import { AVAILABLE_WEB_LLM_MODELS, type ModelInfo } from '../services/webLlmService';

export interface ModelFamily {
  id: string;
  name: string;
  matchName?: string;
  company?: string;
  iconUrl?: string;
  icon?: React.ReactNode;
}

export const FAMILIES: ModelFamily[] = [
  { id: 'llama', name: 'Llama', company: 'Meta', iconUrl: 'https://cdn.simpleicons.org/meta' },
  { id: 'deepseek', name: 'DeepSeek', company: 'DeepSeek AI', iconUrl: 'https://cdn.simpleicons.org/deepseek' },
  { id: 'qwen', name: 'Qwen', company: 'Alibaba Cloud', iconUrl: 'https://cdn.simpleicons.org/qwen' },
  {
    id: 'gemma',
    name: 'Gemma',
    company: 'Google',
    icon: (
      <svg viewBox="0 0 24 24" className="w-full h-full shrink-0">
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
    company: 'Microsoft',
    icon: (
      <svg viewBox="0 0 24 24" className="w-full h-full shrink-0">
        <rect x="1" y="1" width="10" height="10" fill="#f25022" rx="1" />
        <rect x="13" y="1" width="10" height="10" fill="#7fba00" rx="1" />
        <rect x="1" y="13" width="10" height="10" fill="#00a4ef" rx="1" />
        <rect x="13" y="13" width="10" height="10" fill="#ffb900" rx="1" />
      </svg>
    ),
  },
  { id: 'mistral', name: 'Mistral', company: 'Mistral AI', iconUrl: 'https://cdn.simpleicons.org/mistralai' },
  { id: 'smollm', name: 'SmolLM', company: 'Hugging Face', iconUrl: 'https://cdn.simpleicons.org/huggingface' },
  { id: 'stablelm', name: 'StableLM', company: 'Stability AI', icon: <Sparkles className="w-full h-full text-purple-400" /> },
  { id: 'redpajama', name: 'RedPajama', company: 'Together AI', icon: <Shirt className="w-full h-full text-red-400" /> },
  { id: 'wizard', name: 'Wizard Math', matchName: 'Wizard', company: 'WizardLM', icon: <Wand2 className="w-full h-full text-amber-400" /> },
];

export const getModelFamily = (modelName: string): ModelFamily => {
  const lower = modelName.toLowerCase();
  if (lower.includes('deepseek')) return FAMILIES.find(f => f.id === 'deepseek')!;
  if (lower.includes('qwen')) return FAMILIES.find(f => f.id === 'qwen')!;
  if (lower.includes('gemma')) return FAMILIES.find(f => f.id === 'gemma')!;
  if (lower.includes('phi')) return FAMILIES.find(f => f.id === 'phi')!;
  if (lower.includes('mistral') || lower.includes('neuralhermes') || lower.includes('openhermes')) return FAMILIES.find(f => f.id === 'mistral')!;
  if (lower.includes('smollm')) return FAMILIES.find(f => f.id === 'smollm')!;
  if (lower.includes('stablelm')) return FAMILIES.find(f => f.id === 'stablelm')!;
  if (lower.includes('redpajama')) return FAMILIES.find(f => f.id === 'redpajama')!;
  if (lower.includes('wizard')) return FAMILIES.find(f => f.id === 'wizard')!;
  if (lower.includes('llama') || lower.includes('tinyllama') || lower.includes('hermes')) return FAMILIES.find(f => f.id === 'llama')!;
  return FAMILIES[0];
};

const FamilyIcon: React.FC<{ family: ModelFamily; className?: string }> = ({ family, className = 'w-5 h-5' }) => {
  const [imgError, setImgError] = useState(false);

  if (family.icon) {
    return <div className={`flex items-center justify-center shrink-0 ${className}`}>{family.icon}</div>;
  }

  if (family.iconUrl && !imgError) {
    return (
      <img
        src={family.iconUrl}
        alt={family.name}
        onError={() => setImgError(true)}
        className={`${className} object-contain shrink-0`}
      />
    );
  }

  return <Sparkles className={`${className} text-white/70 shrink-0`} />;
};

export const PrecisionInfoCard: React.FC<{
  title: string;
  description: string;
  environment?: string;
  side?: 'top' | 'bottom';
}> = ({ title, description, environment, side = 'top' }) => {
  return (
    <span className="group/info relative inline-flex items-center cursor-help shrink-0">
      <span className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center">
        <Info className="w-3.5 h-3.5" />
      </span>
      <span
        className={`pointer-events-none opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible group-hover/info:pointer-events-auto transition-all duration-150 absolute left-1/2 -translate-x-1/2 w-64 sm:w-72 p-3.5 rounded-xl bg-[#1c1c1c] border border-white/20 shadow-2xl text-left z-50 normal-case tracking-normal ${
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
        }`}
      >
        <span className="block text-xs font-bold text-white mb-1">{title}</span>
        <span className="block text-[11px] text-white/70 leading-relaxed">{description}</span>
        {environment && (
          <span className="block text-[10px] font-medium text-sky-400 mt-2 pt-2 border-t border-white/10">
            {environment}
          </span>
        )}
        <span
          className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
            side === 'top' ? 'top-full -mt-px border-t-[#1c1c1c]' : 'bottom-full -mb-px border-b-[#1c1c1c]'
          }`}
        />
      </span>
    </span>
  );
};

export const QuantCornerBadge: React.FC<{ precision: ModelInfo['precision'] }> = ({ precision }) => {
  if (precision === 'f16') {
    return (
      <span
        title="f16 Precision (16-bit Float)"
        className="absolute bottom-1.5 right-2 flex items-center justify-center text-emerald-400 opacity-75 group-hover:opacity-100 transition-opacity"
      >
        <Zap className="w-3 h-3" />
      </span>
    );
  }
  if (precision === 'f32') {
    return (
      <span
        title="f32 Precision (32-bit Float)"
        className="absolute bottom-1.5 right-2 flex items-center justify-center text-sky-400 opacity-75 group-hover:opacity-100 transition-opacity"
      >
        <Layers className="w-3 h-3" />
      </span>
    );
  }
  return (
    <span
      title="Alternative Precision"
      className="absolute bottom-1.5 right-2 flex items-center justify-center text-white/45 opacity-75 group-hover:opacity-100 transition-opacity"
    >
      <Activity className="w-3 h-3" />
    </span>
  );
};

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
    infoTitle: 'f16 (Half-Precision)',
    infoDesc: 'Uses ~50% less GPU memory (VRAM) and delivers faster token generation. Best for modern dedicated GPUs (NVIDIA RTX, Apple Silicon M1-M4, recent AMD).',
    environment: 'Environment: Requires WebGPU f16 shader support.',
  },
  f32: {
    title: 'f32 Models',
    badge: '32-bit Float',
    subtitle: 'Maximum Hardware Compatibility',
    icon: <Layers className="w-3.5 h-3.5 text-sky-400" />,
    infoTitle: 'f32 (Single-Precision)',
    infoDesc: 'Universal hardware compatibility. Recommended for Intel Integrated GPUs, older graphics cards, or systems lacking f16 shader extensions.',
    environment: 'Environment: Compatible with virtually all WebGPU hardware (uses ~2x more VRAM).',
  },
  other: {
    title: 'Other Models',
    badge: 'Custom',
    subtitle: 'Alternative Precision',
    icon: <Activity className="w-3.5 h-3.5 text-white/60" />,
    infoTitle: 'Custom Precision',
    infoDesc: 'Models utilizing specialized quantizations or alternative precisions.',
    environment: 'Environment: Compatibility depends on specific model requirements.',
  },
};

export const ModelSelectorGrid: React.FC<ModelSelectorGridProps> = ({
  models,
  value,
  onChange,
  disabled,
  loadedModelId,
  onUnload,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  // Determine which family currently owns the selected model
  const selectedModelObj = useMemo(() => {
    return AVAILABLE_WEB_LLM_MODELS.find(m => m.id === value) || models.find(m => m.id === value);
  }, [models, value]);

  const selectedModelFamily = useMemo(() => {
    return selectedModelObj ? getModelFamily(selectedModelObj.name) : null;
  }, [selectedModelObj]);

  const loadedModelObj = useMemo(() => {
    return loadedModelId ? AVAILABLE_WEB_LLM_MODELS.find(m => m.id === loadedModelId) || models.find(m => m.id === loadedModelId) : null;
  }, [models, loadedModelId]);

  const loadedModelFamily = useMemo(() => {
    return loadedModelObj ? getModelFamily(loadedModelObj.name) : null;
  }, [loadedModelObj]);

  // Model-to-Family map for active models
  const familyModelMap = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const fam of FAMILIES) {
      map.set(fam.id, []);
    }
    for (const model of models) {
      const fam = getModelFamily(model.name);
      const list = map.get(fam.id) || [];
      list.push(model);
      map.set(fam.id, list);
    }
    return map;
  }, [models]);

  // Available families that have models matching current parent filters
  const availableFamilies = useMemo(() => {
    return FAMILIES.map(fam => {
      const famModels = familyModelMap.get(fam.id) || [];
      return {
        ...fam,
        models: famModels,
        count: famModels.length,
        hasSelected: selectedModelFamily?.id === fam.id,
        hasLoaded: loadedModelFamily?.id === fam.id,
      };
    }).filter(fam => fam.count > 0);
  }, [familyModelMap, selectedModelFamily, loadedModelFamily]);

  // Search filtered models
  const searchMatchingModels = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return models.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [models, searchQuery]);

  // Selected family object
  const currentFamilyObj = useMemo(() => {
    if (!selectedFamilyId) return null;
    return availableFamilies.find(f => f.id === selectedFamilyId) || FAMILIES.find(f => f.id === selectedFamilyId) || null;
  }, [availableFamilies, selectedFamilyId]);

  // Models to display when a family is selected
  const currentFamilyModels = useMemo(() => {
    if (!selectedFamilyId) return [];
    return familyModelMap.get(selectedFamilyId) || [];
  }, [familyModelMap, selectedFamilyId]);

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div className={`space-y-4 rounded-xl ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Designated Selection & VRAM Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Selected:</span>
          <span className="font-semibold text-white text-xs">
            {selectedModelObj?.name || value}
          </span>
          {selectedModelObj?.precision && (
            <span
              className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                selectedModelObj.precision === 'f16'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
              }`}
            >
              {selectedModelObj.precision.toUpperCase()}
            </span>
          )}
          {selectedModelObj?.capabilities?.includes('vision') && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/70 border border-white/10 flex items-center gap-1">
              <Eye className="w-2.5 h-2.5" />
              Vision
            </span>
          )}
        </div>

        {loadedModelId ? (
          <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-medium">Loaded:</span>
              <strong className="text-white font-medium text-xs">{loadedModelObj?.name || loadedModelId}</strong>
            </div>
            {onUnload && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnload();
                }}
                title="Unload model from GPU memory"
                className="ml-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors text-[9px] font-medium uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-2.5 h-2.5" />
                Unload
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-white/50 bg-white/[0.02] px-2 py-1 rounded-lg border border-white/5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span>Memory: Idle</span>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
        <input
          type="text"
          placeholder="Search models by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2 pl-9 pr-8 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-white/30 transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* MAIN CONTENT AREA */}
      {isSearchActive ? (
        /* SEARCH RESULTS VIEW */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-white/70 uppercase tracking-wider flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-white/50" />
              Search Results ({searchMatchingModels.length})
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-white/60 hover:text-white transition-colors"
            >
              Clear search
            </button>
          </div>

          {searchMatchingModels.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {searchMatchingModels.map(model => {
                const family = getModelFamily(model.name);
                const isSelected = value === model.id;
                const isLoaded = loadedModelId === model.id;

                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => onChange(model.id)}
                    className={`group relative flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white/[0.09] border-white/45 shadow-sm ring-1 ring-white/20'
                        : isLoaded
                          ? 'bg-white/[0.05] border-emerald-500/30 hover:border-white/35 hover:bg-white/[0.08]'
                          : 'bg-white/[0.05] border-white/20 hover:border-white/35 hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="shrink-0 flex items-center justify-center">
                        <FamilyIcon family={family} className="w-5 h-5 shrink-0" />
                      </div>
                      <div className="overflow-hidden">
                        <span className="text-sm block truncate font-semibold text-white">
                          {model.name}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-white/65 font-medium">
                          {model.size && <span>{model.size}</span>}
                          {model.capabilities?.includes('vision') && (
                            <span className="text-purple-300 font-medium flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              Vision
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2 ml-2 mb-auto">
                      {isLoaded && (
                        <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                          Memory
                        </span>
                      )}
                      {/* Subtle radio indicator */}
                      <div
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                          isSelected
                            ? 'border-white bg-white'
                            : 'border-white/30 group-hover:border-white/50'
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </div>
                    </div>

                    {/* Quant icon in bottom right corner */}
                    <QuantCornerBadge precision={model.precision} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-white/15 bg-white/[0.05] p-6 text-center text-xs text-white/60">
              No models match "{searchQuery}".
            </div>
          )}
        </div>
      ) : selectedFamilyId === null ? (
        /* PRIMARY VIEW: GRID OF LARGE FAMILY TILES */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-white/50" />
              Choose Model Family
            </span>
            <span className="text-xs text-white/50 font-medium">
              {availableFamilies.length} {availableFamilies.length === 1 ? 'family' : 'families'} available
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {availableFamilies.map(family => {
              const isSelectedFamily = family.hasSelected;
              const isLoadedFamily = family.hasLoaded;

              return (
                <button
                  key={family.id}
                  type="button"
                  onClick={() => setSelectedFamilyId(family.id)}
                  className={`group relative flex flex-col items-center justify-between text-center p-4 rounded-xl border transition-all cursor-pointer min-h-[125px] ${
                    isSelectedFamily
                      ? 'bg-white/[0.09] border-white/40 shadow-sm'
                      : isLoadedFamily
                        ? 'bg-white/[0.05] border-emerald-500/30 hover:border-white/35 hover:bg-white/[0.08]'
                        : 'bg-white/[0.05] border-white/20 hover:border-white/35 hover:bg-white/[0.08]'
                  }`}
                >
                  {/* Top Status Indicators */}
                  <div className="w-full flex items-center justify-start gap-1 h-3 mb-1">
                    {isLoadedFamily && (
                      <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        Active
                      </span>
                    )}
                  </div>

                  {/* Icon (No square background) */}
                  <div className="my-1 flex items-center justify-center">
                    <FamilyIcon family={family} className="w-8 h-8 shrink-0" />
                  </div>

                  {/* Name & Count */}
                  <div className="mt-2 w-full">
                    <span className="text-sm font-semibold block truncate text-white">
                      {family.name}
                    </span>
                    <span className="text-xs text-white/65 block mt-0.5 font-medium">
                      {family.count} {family.count === 1 ? 'model' : 'models'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* DETAIL VIEW: MODELS WITHIN SELECTED FAMILY */
        <div className="space-y-3">
          {/* Header with Back Button and Family Switcher */}
          <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedFamilyId(null)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/70 hover:text-white transition-all cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-white/50" />
                <span>All Families</span>
              </button>

              <div className="flex items-center gap-2">
                {currentFamilyObj && <FamilyIcon family={currentFamilyObj} className="w-4 h-4 shrink-0" />}
                <span className="text-sm font-semibold text-white tracking-wide">
                  {currentFamilyObj?.name} Models
                </span>
                <span className="text-xs text-white/50">
                  ({currentFamilyModels.length})
                </span>
              </div>
            </div>

            {/* Quick Family Switcher Pill Strip (Other Families) */}
            {availableFamilies.filter(fam => fam.id !== selectedFamilyId).length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 pt-1 border-t border-white/5 no-scrollbar">
                <span className="text-[9px] uppercase tracking-wider font-medium text-white/40 shrink-0 mr-1">
                  Switch:
                </span>
                {availableFamilies
                  .filter(fam => fam.id !== selectedFamilyId)
                  .map(fam => (
                    <button
                      key={fam.id}
                      type="button"
                      onClick={() => setSelectedFamilyId(fam.id)}
                      className="px-2 py-0.5 rounded-md text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer bg-white/[0.02] border border-white/5 text-white/50 hover:bg-white/[0.06] hover:text-white"
                    >
                      <FamilyIcon family={fam} className="w-3 h-3" />
                      <span>{fam.name}</span>
                      <span className="text-[9px] opacity-50">({fam.count})</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Model Cards Grouped by Precision */}
          <div className="space-y-3">
            {[
              { key: 'f16' as const, models: currentFamilyModels.filter(m => m.precision === 'f16') },
              { key: 'f32' as const, models: currentFamilyModels.filter(m => m.precision === 'f32') },
              { key: 'other' as const, models: currentFamilyModels.filter(m => m.precision !== 'f16' && m.precision !== 'f32') },
            ]
              .filter(group => group.models.length > 0)
              .map(group => {
                const config = GROUP_CONFIGS[group.key];
                return (
                  <div key={group.key} className="space-y-1.5">
                    <div className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-white/5 flex items-center justify-center">
                          {config.icon}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white/80 tracking-wide uppercase">
                            {config.title}
                          </span>
                          <span className="text-xs text-white/50 hidden sm:inline">
                            — {config.subtitle}
                          </span>
                          <PrecisionInfoCard
                            title={config.infoTitle}
                            description={config.infoDesc}
                            environment={config.environment}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {group.models.map(model => {
                        const isSelected = value === model.id;
                        const isLoaded = loadedModelId === model.id;
                        return (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => onChange(model.id)}
                            className={`group relative flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-white/[0.09] border-white/45 shadow-sm ring-1 ring-white/20'
                                : isLoaded
                                  ? 'bg-white/[0.05] border-emerald-500/30 hover:border-white/35 hover:bg-white/[0.08]'
                                  : 'bg-white/[0.05] border-white/20 hover:border-white/35 hover:bg-white/[0.08]'
                            }`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="shrink-0 flex items-center justify-center">
                                {currentFamilyObj && <FamilyIcon family={currentFamilyObj} className="w-5 h-5 shrink-0" />}
                              </div>
                              <div className="overflow-hidden">
                                <span className="text-sm block truncate font-semibold text-white">
                                  {model.name}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5 text-xs text-white/65 font-medium">
                                  {model.size && <span>{model.size}</span>}
                                  {model.capabilities?.includes('vision') && (
                                    <span className="text-purple-300 font-medium flex items-center gap-1">
                                      <Eye className="w-3 h-3" />
                                      Vision
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2 ml-2 mb-auto">
                              {isLoaded && (
                                <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                                  Memory
                                </span>
                              )}
                              {/* Subtle radio indicator */}
                              <div
                                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                                  isSelected
                                    ? 'border-white bg-white'
                                    : 'border-white/30 group-hover:border-white/50'
                                }`}
                              >
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                              </div>
                            </div>

                            {/* Quant icon in bottom right corner */}
                            <QuantCornerBadge precision={model.precision} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {availableFamilies.length === 0 && !isSearchActive && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-xs text-white/50">
          No WebLLM models match the current precision and type filters.
        </div>
      )}
    </div>
  );
};
