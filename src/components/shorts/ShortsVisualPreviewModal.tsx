import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ShortsVisualPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  isVideo: boolean;
  label: string;
}

/**
 * Full-screen look at a single scene's generated image or clip. The storyboard
 * thumbnail is only ~7rem wide, too small to judge framing or catch artifacts —
 * this is the same asset at as large as the viewport allows.
 */
export const ShortsVisualPreviewModal: React.FC<ShortsVisualPreviewModalProps> = ({
  isOpen,
  onClose,
  url,
  isVideo,
  label,
}) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen && url) {
      setIsRendered(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, url]);

  useEffect(() => {
    if (!isRendered) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isRendered, onClose]);

  if (!isRendered || !url) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm transition-opacity duration-200 sm:p-10 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className={`relative max-h-full max-w-full transition-all duration-200 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={url}
            className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl"
            controls
            autoPlay
            loop
            playsInline
          />
        ) : (
          <img src={url} alt={label} className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl" />
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="focus-ring absolute -right-3 -top-3 rounded-full border border-white/10 bg-black/80 p-2 text-white/70 shadow-lg transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
};
