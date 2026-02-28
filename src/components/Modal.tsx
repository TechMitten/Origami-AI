
import React, { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export type ModalType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

interface ModalProps {
  isOpen: boolean;
  type: ModalType;
  title?: string;
  message: React.ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  type,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'OK',
  cancelText = 'Cancel',
  className = ''
}) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsRendered(true);
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      requestAnimationFrame(() => setIsVisible(false));
      const timer = setTimeout(() => setIsRendered(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isRendered) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-6 h-6 text-emerald-400" />;
      case 'error': return <AlertCircle className="w-6 h-6 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-400" />;
      case 'confirm': return <Info className="w-6 h-6 text-blue-400" />;
      default: return <Info className="w-6 h-6 text-blue-400" />;
    }
  };

  const getHeaderColor = () => {
    switch (type) {
      case 'success': return 'bg-emerald-500/10 border-emerald-500/20';
      case 'error': return 'bg-red-500/10 border-red-500/20';
      case 'warning': return 'bg-amber-500/10 border-amber-500/20';
      case 'confirm': return 'bg-blue-500/10 border-blue-500/20';
      default: return 'bg-blue-500/10 border-blue-500/20';
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={type === 'confirm' ? onCancel : onConfirm}
      />

      {/* Modal Content */}
      <div className={`relative w-full max-w-md my-4 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl transform transition-all duration-300 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'} ${className}`}>

        {/* Header */}
        <div className={`px-6 py-4 flex items-center gap-3 rounded-t-2xl border-b ${getHeaderColor()}`}>
          {getIcon()}
          <h3 className="text-lg font-bold text-white tracking-tight">
            {title || (type.charAt(0).toUpperCase() + type.slice(1))}
          </h3>
          <button
            onClick={type === 'confirm' ? onCancel : onConfirm}
            className="ml-auto p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-w-11 min-h-11 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <div className="text-white/80 leading-relaxed text-sm">
            {message}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/5 rounded-b-2xl border-t border-white/5 flex flex-col-reverse sm:flex-row items-center justify-end gap-2 sm:gap-3">
          {(type === 'confirm' || onCancel) && (
            <button
              onClick={onCancel}
              className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`w-full sm:w-auto px-6 py-2 rounded-lg text-sm font-bold text-white transition-all shadow-lg ${type === 'error' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' :
                type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20' :
                  'bg-branding-primary hover:bg-cyan-400 text-black shadow-cyan-500/20'
              }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
