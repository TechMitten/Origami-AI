import React, { useCallback, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDropzone } from 'react-dropzone';
import { Layers, Loader2, BrainCircuit, Video, ArrowUpRight, Sparkles, Clapperboard, AudioLines, FileCog, ChevronDown } from 'lucide-react';
import { renderPdfToImages } from '../services/pdfService';
import type { RenderedPage } from '../services/pdfService';
import { ocrEvents, type OCRProgressEventDetail } from '../services/ocrService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CreateSlidesModal } from './CreateSlidesModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Set by App.tsx once a PDF upload completes (or a saved session is restored).
// The Slide Studio group uses it to decide whether the Editor card is revealed.
const HAS_UPLOADED_PDF_KEY = 'has_uploaded_pdf';

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
  /** Whether the one-time setup (TTS/FFmpeg/WebLLM) is still downloading. */
  isDownloadingResources?: boolean;
  /** Called instead of launching a feature while resources are still downloading. */
  onBlockedByDownload?: (actionLabel: string) => void;
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

export const PDFUploader: React.FC<PDFUploaderProps> = ({ onUploadComplete, onOpenAssistant, onOpenSlideEditor, onOpenShorts, onOpenVoiceStudio, onOpenConverter, isDownloadingResources, onBlockedByDownload }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateSlidesModalOpen, setIsCreateSlidesModalOpen] = useState(false);
  const [launchingOption, setLaunchingOption] = useState<SecondaryOption | null>(null);
  const [isSlideStudioExpanded, setIsSlideStudioExpanded] = useState(false);
  const [hasUploadedPdf, setHasUploadedPdf] = useState(false);
  const launchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FLIP bookkeeping for the Slide Studio gateway card morph (see useLayoutEffect below).
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gatewayRef = useRef<HTMLDivElement | null>(null);
  const gatewayFirstRectRef = useRef<DOMRect | null>(null);
  const gatewayMorphCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
    };
  }, []);

  // The Editor card only belongs in the Slide Studio group once this browser
  // has actually produced a deck from a PDF before.
  useEffect(() => {
    try {
      setHasUploadedPdf(localStorage.getItem(HAS_UPLOADED_PDF_KEY) === 'true');
    } catch {
      // localStorage unavailable (e.g. private browsing) — the card just stays hidden.
    }
  }, []);

  // OCR progress state
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrCurrentPage, setOcrCurrentPage] = useState(0);
  const [ocrTotalPages, setOcrTotalPages] = useState(0);

  // Listen to OCR events
  useEffect(() => {
    const handleInitStart = () => {
      setOcrStatus('initializing');
    };

    const handleInitComplete = () => {
      setOcrStatus('ready');
    };

    const handlePageStart = (e: Event) => {
      const detail = (e as CustomEvent<OCRProgressEventDetail>).detail;
      setOcrStatus('processing');
      setOcrCurrentPage(detail.currentPage);
      setOcrTotalPages(detail.totalPages);
      setOcrProgress(detail.progress);
    };

    const handlePageProgress = (e: Event) => {
      const detail = (e as CustomEvent<OCRProgressEventDetail>).detail;
      setOcrProgress(detail.progress);
    };

    const handlePageComplete = () => {};

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

  const createSlidesOption: SecondaryOption = {
    key: 'create-slides',
    icon: Sparkles,
    title: 'Create Slides',
    description: 'Generate your presentation with our suggested AI slide makers.',
    cta: 'View providers',
    onClick: () => setIsCreateSlidesModalOpen(true),
    accent: 'foil',
  };

  const editorOption: SecondaryOption | null = hasUploadedPdf
    ? {
        key: 'editor',
        icon: Video,
        title: 'Editor',
        description: 'Build with Slide Media directly, no PDF required.',
        cta: 'Open editor',
        onClick: onOpenSlideEditor,
        accent: 'foil',
        launchApp: true,
      }
    : null;

  const secondaryOptions: SecondaryOption[] = [
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
    if (opt.launchApp && isDownloadingResources) {
      onBlockedByDownload?.(opt.title);
      return;
    }
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

  const toggleSlideStudio = () => {
    const el = gatewayRef.current;
    gatewayFirstRectRef.current = el ? el.getBoundingClientRect() : null;
    setIsSlideStudioExpanded((v) => !v);
  };

  // Gateway card morph (FLIP): the first rect is captured in toggleSlideStudio
  // before the re-render, then here — once the new layout has settled but before
  // paint — the card is pinned at its old position/size and eased into the slot
  // it now occupies.
  useLayoutEffect(() => {
    const el = gatewayRef.current;
    const root = rootRef.current;
    const first = gatewayFirstRectRef.current;
    gatewayFirstRectRef.current = null;
    if (!el || !root || !first) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Abort any morph that is still in flight from a rapid double-toggle.
    gatewayMorphCleanupRef.current?.();
    gatewayMorphCleanupRef.current = null;

    // The page-load unfold animation keeps its final transform (fill: both),
    // which would override the inline transform below — drop it first.
    el.classList.remove('origami-unfold');

    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (!dx && !dy && first.width === last.width && first.height === last.height) return;

    let fallbackId = 0;
    const restoreStyles = () => {
      el.removeEventListener('transitionend', onEnd);
      window.clearTimeout(fallbackId);
      el.style.transition = '';
      el.style.transform = '';
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.height = '';
      el.style.minHeight = '';
      el.style.zIndex = '';
      gatewayMorphCleanupRef.current = null;
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el) return;
      if (e.propertyName !== 'transform' && e.propertyName !== 'width') return;
      restoreStyles();
    };

    const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

    if (isSlideStudioExpanded) {
      // Expanding: pin the card out of the flex flow. Keeping it in flow with a
      // full-width inline width changes flex line breaking — the card wraps onto
      // its own row below the group and the layout re-wraps mid-animation. Out
      // of flow it flies freely from the old slot into the empty cell.
      // The root carries `perspective`, which makes it the containing block for
      // absolutely positioned descendants, so coords are root-relative.
      const rootRect = root.getBoundingClientRect();
      const fromLeft = first.left - rootRect.left;
      const fromTop = first.top - rootRect.top;
      const dLeft = last.left - first.left;
      const dTop = last.top - first.top;

      el.style.transition = 'none';
      el.style.position = 'absolute';
      el.style.left = `${fromLeft}px`;
      el.style.top = `${fromTop}px`;
      el.style.width = `${first.width}px`;
      el.style.height = `${first.height}px`;
      el.style.minHeight = '0';
      el.style.zIndex = '30';
      el.style.transform = 'translate(0px, 0px)';
      void el.offsetWidth; // Commit the pinned state before easing.

      el.style.transition = `transform 600ms ${EASE}, width 600ms ${EASE}, height 600ms ${EASE}`;
      el.style.transform = `translate(${dLeft}px, ${dTop}px)`;
      el.style.width = `${last.width}px`;
      el.style.height = `${last.height}px`;
    } else {
      // Collapsing: the gateway is the only card left in the group, so the
      // in-flow FLIP can't disturb line breaking — glide it back to full width.
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.width = `${first.width}px`;
      el.style.minHeight = `${first.height}px`;
      void el.offsetWidth; // Commit the inverted state before easing.

      el.style.transition = `transform 600ms ${EASE}, width 600ms ${EASE}, min-height 600ms ${EASE}`;
      el.style.transform = 'translate(0px, 0px)';
      el.style.width = `${last.width}px`;
      el.style.minHeight = `${last.height}px`;
    }

    el.addEventListener('transitionend', onEnd);
    fallbackId = window.setTimeout(restoreStyles, 700);
    gatewayMorphCleanupRef.current = restoreStyles;
  }, [isSlideStudioExpanded]);

  const renderOptionCard = (opt: SecondaryOption, delayMs: number, cardClassName?: string) => {
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
          "fold-card origami-unfold group relative border bg-white/5 backdrop-blur-md p-6 sm:p-8 flex flex-col min-h-[188px] sm:min-h-[210px] transition-all duration-300 shadow-xl",
          cardClassName,
          opt.disabled
            ? "border-white/5 cursor-not-allowed select-none opacity-80"
            : "cursor-pointer border-white/10 hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
        )}
        style={{ animationDelay: `${delayMs}ms`, ...(isAmber && !opt.disabled ? ({ '--fold-glow': 'linear-gradient(135deg, #f59e0b, #fb923c)' } as React.CSSProperties) : {}), ...(opt.disabled ? { '--fold-glow': 'transparent' } : {}) }}
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
          'mt-auto inline-flex items-center gap-1.5 self-start text-xs font-semibold border px-3.5 py-2.5 transition-all duration-300 bg-white/5 text-white/60 border-white/10',
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
  };

  // The PDF dropzone, dressed as a card inside the Slide Studio group. Carries
  // the same upload + OCR progress flow the old primary card had.
  const uploadPdfCard = (
    <div
      {...getRootProps()}
      className={cn(
        'fold-card origami-unfold group relative cursor-pointer overflow-hidden border bg-white/5 backdrop-blur-md p-6 sm:p-8 flex flex-col w-full sm:w-[calc(50%-10px)] min-h-[188px] sm:min-h-[210px] transition-all duration-300 shadow-xl',
        isDragActive
          ? 'border-cyan-400/40 bg-cyan-500/[0.08]'
          : 'border-white/10 hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50'
      )}
      style={{ animationDelay: '250ms' }}
    >
      <input {...getInputProps()} />

      <div className="mb-5">
        {isProcessing ? (
          <Loader2 className="w-7 h-7 text-cyan-300 animate-spin" />
        ) : (
          <Layers className={cn(
            'w-7 h-7 text-white/50 transition-colors duration-300',
            isDragActive ? 'text-cyan-300' : 'group-hover:text-cyan-300'
          )} />
        )}
      </div>

      <h3 className={cn(
        'font-display text-lg font-semibold text-white mb-2 transition-colors duration-300',
        isDragActive && 'text-cyan-200'
      )}>
        Upload PDF
      </h3>
      <p className="text-sm text-white/50 leading-relaxed mb-5 max-w-md">
        {isDragActive
          ? 'Release to upload your PDF.'
          : 'Drop a PDF and Origami extracts every slide, then writes the narration for you.'}
      </p>

      {isProcessing ? (
        <div className="mt-auto max-w-xs">
          <div className="h-1 bg-white/10 overflow-hidden mb-1.5">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <p className="text-[11px] font-mono tracking-wide text-white/40">
            {ocrStatus === 'processing'
              ? `PAGE ${ocrCurrentPage}/${ocrTotalPages} — ${overallProgress}%`
              : 'PREPARING…'}
          </p>
        </div>
      ) : (
        <div className="mt-auto flex flex-col items-start gap-1.5">
          <div className={cn(
            'inline-flex items-center gap-1.5 self-start text-xs font-semibold border px-3.5 py-2.5 transition-all duration-300',
            isDragActive
              ? 'bg-cyan-500/10 text-cyan-200 border-cyan-400/30'
              : 'bg-white/5 text-white/60 border-white/10 group-hover:border-cyan-400/30 group-hover:text-cyan-200'
          )}>
            Select PDF file
            <ArrowUpRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          {/* Drag & drop has no equivalent on touch, so the hint only earns its place on pointer devices. */}
          <span className="hidden sm:block text-[11px] text-white/30">or drag &amp; drop</span>
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="w-full max-w-6xl mx-auto"
      style={{ fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif', perspective: '1200px' }}
    >
      {/* Header */}
      <div className="mb-7 sm:mb-10 origami-unfold">
        <span className="block text-[11px] font-mono uppercase tracking-[0.2em] text-white/35 mb-3">
          New project
        </span>
        <h2 className="font-display text-[1.7rem] leading-tight sm:text-4xl font-bold text-white mb-3 tracking-tight">
          Let's get started
        </h2>
        <p className="text-sm sm:text-base text-white/55 max-w-md">
          Most projects start with a PDF — everything else is one click away.
        </p>
      </div>

      {/* Slide Studio group — the gateway card reveals the studio options, then
          morphs into a sibling-sized cell and plugs the gap in the odd row. */}
      <div className={cn('flex flex-wrap items-stretch gap-4 sm:gap-5', isSlideStudioExpanded && 'mt-4')}>
        {isSlideStudioExpanded && (
          <>
            {renderOptionCard(createSlidesOption, 160, 'w-full sm:w-[calc(50%-10px)]')}
            {uploadPdfCard}
            {editorOption && renderOptionCard(editorOption, 340, 'w-full sm:w-[calc(50%-10px)]')}
          </>
        )}

        <div
          ref={gatewayRef}
          onClick={toggleSlideStudio}
          role="button"
          aria-expanded={isSlideStudioExpanded}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleSlideStudio();
            }
          }}
          className={cn(
            'fold-card origami-unfold group relative cursor-pointer overflow-hidden border bg-white/5 backdrop-blur-md shadow-xl',
            'w-full p-6 sm:p-8 flex items-center gap-5 sm:gap-8 transition-all duration-300',
            isSlideStudioExpanded
              ? 'sm:w-[calc(50%-10px)] min-h-[188px] sm:min-h-[210px] border-cyan-400/30 bg-white/10 focus-visible:outline-none'
              : 'min-h-[104px] border-white/10 hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50'
          )}
          style={{
            animationDelay: '0ms',
            backgroundImage: 'linear-gradient(105deg, transparent 49.4%, rgba(255,255,255,0.05) 50%, transparent 50.6%)',
          }}
        >
          <div className="shrink-0">
            <Layers className="w-8 h-8 sm:w-9 sm:h-9 text-white/50 transition-colors duration-300 group-hover:text-cyan-300" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl sm:text-2xl font-semibold text-white mb-1.5 transition-colors duration-300 group-hover:text-cyan-200">
              Slide Studio
            </h3>
            <p className="text-sm text-white/55 max-w-md">
              Start from a PDF or generate slides with AI — pick how you want to begin.
            </p>
          </div>

          <div className={cn(
            'shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border transition-all duration-300',
            isSlideStudioExpanded
              ? 'bg-cyan-500/10 text-cyan-200 border-cyan-400/30'
              : 'bg-white/5 text-white/70 border-white/15 group-hover:border-cyan-400/30 group-hover:text-cyan-200'
          )}>
            <span className="hidden sm:inline">{isSlideStudioExpanded ? 'Collapse' : 'Get started'}</span>
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-300', isSlideStudioExpanded && 'rotate-180')} />
          </div>
        </div>
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
        {secondaryOptions.map((opt, i) => renderOptionCard(opt, 160 + i * 90))}
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
