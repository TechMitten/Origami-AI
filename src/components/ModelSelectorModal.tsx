import React from 'react';
import { X } from 'lucide-react';
import { ModelSelectorGrid } from './ModelSelectorGrid';
import { type ModelInfo } from '../services/webLlmService';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelInfo[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isOpen,
  onClose,
  models,
  value,
  onChange,
  disabled
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-bold text-white">Select WebLLM Model</h2>
          <button
            onClick={onClose}
            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <ModelSelectorGrid
            models={models}
            value={value}
            onChange={(modelId) => {
              onChange(modelId);
              onClose();
            }}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};
