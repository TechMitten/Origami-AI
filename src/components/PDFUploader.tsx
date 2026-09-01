import React, { useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDropzone } from 'react-dropzone';
import { Layers, Loader2, BrainCircuit, Video, ArrowUpRight, Sparkles, Clapperboard, AudioLines, FileCog } from 'lucide-react';
import { renderPdfToImages } from '../services/pdfService';
import type { RenderedPage } from '../services/pdfService';
import { ocrEvents, type OCRProgressEventDetail } from '../services/ocrService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CreateSlidesModal } from './CreateSlidesModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PDFUploaderProps {
  onUploadComplete: (pages: RenderedPage[]) => void;
  onImportProject?: () => void;
  onStartScreenRecord?: () => void;
  onOpenAssistant?: () => void;
  onOpenIssueReporter?: () => void;
  onOpenSlideEditor?: () => void;
  onOpenShorts?: () => void;
  onOpenVoiceStudio?: () => void;
  onOpenConverter?: () => void;
}

interface SecondaryOption {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  cta: string;
  onClick?: () => void;
  accent: 'foil' | 'amber';
  disabled?: boolean;
  badge?: string;
  /** Shows the loading splash for a moment before firing onClick, instead of navigating instantly. */
  launchApp?: boolean;
}

// How long the loading splash stays up before the destination app actually opens.
const LAUNCH_SPLASH_DELAY_MS = 1100;

export const PDFUploader: React.FC<PDFUploaderProps> = ({ onUploadComplete, onOpenAssistant, onOpenSlideEditor, onOpenShorts, onOpenVoiceStudio, onOpenConverter }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateSlidesModalOpen, setIsCreateSlidesModalOpen] = useState(false);
  const [launchingOption, setLaunchingOption] = useState<SecondaryOption | null>(null);
  const launchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
    };
  }, []);

  // OCR progress state
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrCurrentPage, setOcrCurrentPage] = useState(0);
  const [ocrTotalPages, setOcrTotalPages] = useState(0);

  // Listen to OCR events
  useEffect(() => {
    const handleInitStart = () => {
      console.log('[PDFUploader] OCR initialization started');
      setOcrStatus('initializing');
    };

    const handleInitComplete = () => {
      console.log('[PDFUploader] OCR initialization complete');
      setOcrStatus('ready');
    };

    const handlePageStart = (e: Event) => {
      const detail = (e as CustomEvent<OCRProgressEventDetail>).detail;
      console.log('[PDFUploader] OCR page start:', detail);
      setOcrStatus('processing');
      setOcrCurrentPage(detail.currentPage);
      setOcrTotalPages(detail.totalPages);
      setOcrProgress(detail.progress);
    };

    const handlePageProgress = (e: Event) => {
      const detail = (e as CustomEvent<OCRProgressEventDetail>).detail;
      setOcrProgress(detail.progress);
    };

    const handlePageComplete = () => {
      console.log('[PDFUploader] OCR page complete');
    };

    const handleError = (e: Event) => {
      const detail = (e as CustomEvent<{ error: string }>).detail;
      console.error('[PDFUploader] OCR error:', detail.error);
      setError(`OCR failed: ${detail.error}. Please try again.`);
      setOcrStatus(null);
    };

    ocrEvents.addEventListener('init-start', handleInitStart);
    ocrEvents.addEventListener('init-complete', handleInitComplete);
    ocrEvents.addEventListener('page-start', handlePageStart);
    ocrEvents.addEventListener('page-progress', handlePageProgress);
    ocrEvents.addEventListener('page-complete', handlePageComplete);
    ocrEvents.addEventListener('error', handleError);

    return () => {
      ocrEvents.removeEventListener('init-start', handleInitStart);
      ocrEvents.removeEventListener('init-complete', handleInitComplete);
      ocrEvents.removeEventListener('page-start', handlePageStart);
      ocrEvents.removeEventListener('page-progress', handlePageProgress);
      ocrEvents.removeEventListener('page-complete', handlePageComplete);
      ocrEvents.removeEventListener('error', handleError);
    };
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setOcrStatus(null);
    setOcrProgress(0);

    try {
      const pages = await renderPdfToImages(file);
      onUploadComplete(pages);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to process PDF. Please try again.');
    } finally {
      setIsProcessing(false);
      setOcrStatus(null);
      setOcrProgress(0);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const secondaryOptions: SecondaryOption[] = [
    {
      key: 'create-slides',
      icon: Sparkles,
      title: 'Create Slides',
      description: 'Generate your presentation with our suggested AI slide makers.',
      cta: 'View providers',
      onClick: () => setIsCreateSlidesModalOpen(true),
      accent: 'foil',
    },
    {
      key: 'editor',
      icon: Video,
      title: 'Editor',
      description: 'Build with Slide Media directly, no PDF required.',
      cta: 'Open editor',
      onClick: onOpenSlideEditor,
      accent: 'foil',
      launchApp: true,
    },
    {
      key: 'assistant',
      icon: BrainCircuit,
      title: 'Assistant',
      description: 'Chat with the local WebLLM workspace to write and revise.',
      cta: 'Open assistant',
      onClick: onOpenAssistant,
      accent: 'foil',
      launchApp: true,
    },
    {
      key: 'voice',
      icon: AudioLines,
      title: 'Voice Studio',
      description: 'Turn any text into on-device narration and download it as an MP3.',
      cta: 'Open voice studio',
      onClick: onOpenVoiceStudio,
      accent: 'foil',
      launchApp: true,
    },
    {
      key: 'converter',
      icon: FileCog,
      title: 'File Studio',
      description: 'Convert images and audio between formats — PNG or JPG to WebP, WAV to MP3, all on-device.',
      cta: 'Open file studio',
      onClick: onOpenConverter,
      accent: 'foil',
      launchApp: true,
    },
    {
      key: 'shorts',
      icon: Clapperboard,
      title: 'Shorts',
      description: 'Turn any topic into a narrated, captioned vertical video.',
      cta: 'Open shorts',
      onClick: onOpenShorts,
      accent: 'amber',
      badge: 'Beta',
      launchApp: true,
    },
  ];

  const handleOptionActivate = (opt: SecondaryOption) => {
    if (opt.disabled || launchingOption) return;
    if (opt.launchApp) {
      setLaunchingOption(opt);
      launchTimeoutRef.current = setTimeout(() => {
        opt.onClick?.();
      }, LAUNCH_SPLASH_DELAY_MS);
    } else {
      opt.onClick?.();
    }
  };

  // The OCR service reports progress per page (each page sweeps 0 → 100% and
  // resets on the next page). Binding the bar to that raw value makes it jump
  // back and forth. Derive a monotonic overall progress across all pages so the
  // bar only ever moves forward.
  const overallProgress = ocrTotalPages > 0
    ? Math.round((((ocrCurrentPage - 1) + ocrProgress / 100) / ocrTotalPages) * 100)
    : ocrProgress;

  return (
    <div
      className="w-full max-w-6xl mx-auto px-4 sm:px-0"
      style={{ fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif', perspective: '1200px' }}
    >
      {/* Header */}
      <div className="mb-8 sm:mb-10 origami-unfold">
        <span className="block text-[11px] font-mono uppercase tracking-[0.2em] text-white/35 mb-3">
          New project
        </span>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
          Let's get started
        </h2>
        <p className="text-sm sm:text-base text-white/55 max-w-md">
          Most projects start with a PDF — everything else is one click away.
        </p>
      </div>

      {/* Primary option: PDF upload */}
      <div
        {...getRootProps()}
        className={cn(
          'fold-card origami-unfold group relative cursor-pointer overflow-hidden border transition-all duration-300',
          'bg-white/5 backdrop-blur-md border-white/10 shadow-xl hover:border-white/20 hover:bg-white/10',
          'p-7 sm:p-10 flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10',
          isDragActive && 'border-cyan-400/40 bg-cyan-500/[0.08]'
        )}
        style={{
          backgroundImage: 'linear-gradient(105deg, transparent 49.4%, rgba(255,255,255,0.05) 50%, transparent 50.6%)',
        }}
      >
        <input {...getInputProps()} />

        <div className="shrink-0 flex items-center justify-center">
          {isProcessing ? (
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-cyan-300 animate-spin" />
          ) : (
            <Layers className={cn(
              'w-8 h-8 sm:w-10 sm:h-10 transition-colors duration-300',
              isDragActive ? 'text-cyan-300' : 'text-white/50 group-hover:text-cyan-300'
            )} />
          )}
        </div>

        <div className="flex-1 text-left">
          <h3 className={cn(
            'font-display text-xl sm:text-2xl font-semibold text-white mb-1.5 transition-colors duration-300',
            isDragActive && 'text-cyan-200'
          )}>
            Slide Studio
          </h3>
          <p className="text-sm text-white/55 max-w-md">
            {isDragActive
              ? 'Release to upload your PDF.'
              : 'Drop a PDF and Origami extracts every slide, then writes the narration for you.'
            }
          </p>

          {isProcessing && (
            <div className="mt-4 max-w-xs">
              <div className="h-1 bg-white/10 overflow-hidden mb-1.5">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <p className="text-[11px] font-mono text-white/40 tracking-wide">
                {ocrStatus === 'processing'
                  ? `PAGE ${ocrCurrentPage}/${ocrTotalPages} — ${overallProgress}%`
                  : 'PREPARING…'}
              </p>
            </div>
          )}
        </div>

        {!isProcessing && (
          <div className="shrink-0 flex flex-col items-start sm:items-end gap-1.5">
            <div className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border transition-all duration-300',
              isDragActive
                ? 'bg-cyan-500/10 text-cyan-200 border-cyan-400/30'
                : 'bg-white/5 text-white/70 border-white/15 group-hover:border-cyan-400/30 group-hover:text-cyan-200'
            )}>
              Select PDF file
              <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <span className="text-[11px] text-white/30">or drag &amp; drop</span>
          </div>
        )}
      </div>

      {/* Secondary row label */}
      <div className="flex items-center gap-3 mt-8 mb-4">
        <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/35 whitespace-nowrap">
          Or jump straight to
        </span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      {/* Secondary options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        {secondaryOptions.map((opt, i) => {
          const Icon = opt.icon;
          const isAmber = opt.accent === 'amber';
          return (
            <div
              key={opt.key}
              onClick={opt.disabled ? undefined : () => handleOptionActivate(opt)}
              role={opt.disabled ? undefined : "button"}
              tabIndex={opt.disabled ? -1 : 0}
              onKeyDown={(e) => {
                if (opt.disabled) return;
                if (e.key === 'Enter' || e.key === ' ') handleOptionActivate(opt);
              }}
              className={cn(
                "fold-card origami-unfold group relative border bg-white/5 backdrop-blur-md p-7 sm:p-8 flex flex-col min-h-[210px] transition-all duration-300 shadow-xl",
                opt.disabled
                  ? "border-white/5 cursor-not-allowed select-none opacity-80"
                  : "cursor-pointer border-white/10 hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
              )}
              style={{ animationDelay: `${160 + i * 90}ms`, ...(isAmber && !opt.disabled ? ({ '--fold-glow': 'linear-gradient(135deg, #f59e0b, #fb923c)' } as React.CSSProperties) : {}), ...(opt.disabled ? { '--fold-glow': 'transparent' } : {}) }}
            >
              <div className="mb-5">
                <Icon className={cn(
                  'w-7 h-7 text-white/50 transition-colors duration-300',
                  opt.disabled ? '' : (isAmber ? 'group-hover:text-amber-300' : 'group-hover:text-cyan-300')
                )} />
              </div>

              <div className="flex items-center gap-2 mb-2">
                <h3 className={cn(
                  'font-display text-lg font-semibold text-white transition-colors duration-300',
                  opt.disabled ? '' : (isAmber ? 'group-hover:text-amber-200' : 'group-hover:text-cyan-200')
                )}>
                  {opt.title}
                </h3>
                {opt.badge && (
                  <span className={cn(
                    "px-1.5 py-0.5 text-[9px] font-mono tracking-wider font-bold rounded uppercase",
                    isAmber ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  )}>
                    {opt.badge}
                  </span>
                )}
              </div>
              <p className="text-sm text-white/50 leading-relaxed mb-5 max-w-md">
                {opt.description}
              </p>

              <div className={cn(
                'mt-auto inline-flex items-center gap-1.5 self-start text-xs font-semibold border px-3.5 py-2 transition-all duration-300 bg-white/5 text-white/60 border-white/10',
                opt.disabled ? '' : (isAmber ? 'group-hover:border-amber-400/30 group-hover:text-amber-200' : 'group-hover:border-cyan-400/30 group-hover:text-cyan-200')
              )}>
                {opt.cta}
                {!opt.disabled && <ArrowUpRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />}
              </div>

              {opt.disabled && (
                <div className="absolute inset-0 bg-[#14161B]/80 backdrop-blur-[1.5px] flex items-center justify-center rounded-[inherit] pointer-events-none select-none">
                  <span className="px-3 py-1.5 text-[10px] font-mono tracking-widest font-semibold text-amber-400 border border-amber-500/30 bg-amber-500/10 uppercase rounded shadow-lg shadow-black/50">
                    Coming Soon
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-6 p-4 border border-red-500/10 bg-red-500/5 text-red-400 text-xs font-medium text-center">
          {error}
        </div>
      )}

      <CreateSlidesModal
        isOpen={isCreateSlidesModalOpen}
        onClose={() => setIsCreateSlidesModalOpen(false)}
      />

      {launchingOption && createPortal(
        <div className="fixed inset-0 z-[200] w-screen h-screen bg-black flex flex-col items-center justify-center gap-5">
          <div className="relative flex items-center justify-center">
            <Loader2 className="w-16 h-16 text-cyan-300/40 animate-spin" />
            <launchingOption.icon className="absolute w-6 h-6 text-cyan-200" />
          </div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/90">
            Opening {launchingOption.title}…
          </p>
        </div>,
        document.body
      )}
    </div>
  );
};
