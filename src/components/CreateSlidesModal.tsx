import React, { useEffect } from 'react';
import { X, Sparkles, LayoutTemplate, Palette, Zap, ArrowUpRight, FileDown, CornerDownLeft, PenLine } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Provider {
  id: string;
  name: string;
  description: string;
  url: string;
  domain: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  accentText: string;
  chip: string;
  hoverBorder: string;
  foldGlow: string;
  badge: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'google-slides',
    name: 'Google Slides',
    description: 'The familiar editor. Draft and collaborate in the browser, then export a clean PDF.',
    url: 'https://docs.google.com/presentation',
    domain: 'docs.google.com',
    icon: LayoutTemplate,
    iconColor: 'text-yellow-300 group-hover:text-yellow-200',
    accentText: 'group-hover:text-yellow-200',
    chip: 'bg-yellow-500/15 border-yellow-500/30 group-hover:bg-yellow-500/25',
    hoverBorder: 'group-hover:border-yellow-500/30',
    foldGlow: 'linear-gradient(135deg, #facc15, #f59e0b)',
    badge: 'Best quality',
  },
  {
    id: 'gamma',
    name: 'Gamma AI',
    description: 'Describe your deck and get a designed draft back, with none of the formatting work.',
    url: 'https://gamma.app',
    domain: 'gamma.app',
    icon: Sparkles,
    iconColor: 'text-pink-300 group-hover:text-pink-200',
    accentText: 'group-hover:text-pink-200',
    chip: 'bg-pink-500/15 border-pink-500/30 group-hover:bg-pink-500/25',
    hoverBorder: 'group-hover:border-pink-500/30',
    foldGlow: 'linear-gradient(135deg, #ec4899, #f472b6)',
    badge: 'Most flexible',
  },
  {
    id: 'beautiful-ai',
    name: 'Beautiful.ai',
    description: 'Smart templates that keep themselves aligned and on-brand as you edit.',
    url: 'https://www.beautiful.ai',
    domain: 'beautiful.ai',
    icon: Palette,
    iconColor: 'text-blue-300 group-hover:text-blue-200',
    accentText: 'group-hover:text-blue-200',
    chip: 'bg-blue-500/15 border-blue-500/30 group-hover:bg-blue-500/25',
    hoverBorder: 'group-hover:border-blue-500/30',
    foldGlow: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    badge: 'Easiest',
  },
  {
    id: 'z-ai',
    name: 'Z.ai',
    description: 'AI drafting for free. Expect slower renders and simpler layouts.',
    url: 'https://z.ai',
    domain: 'z.ai',
    icon: Zap,
    iconColor: 'text-emerald-300 group-hover:text-emerald-200',
    accentText: 'group-hover:text-emerald-200',
    chip: 'bg-emerald-500/15 border-emerald-500/30 group-hover:bg-emerald-500/25',
    hoverBorder: 'group-hover:border-emerald-500/30',
    foldGlow: 'linear-gradient(135deg, #10b981, #34d399)',
    badge: 'Free · slower',
  }
];

interface CreateSlidesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROUTE_STEPS = [
  { icon: PenLine, label: 'Draft in a tool' },
  { icon: FileDown, label: 'Export as PDF' },
  { icon: CornerDownLeft, label: 'Drop it back here' },
];

export const CreateSlidesModal: React.FC<CreateSlidesModalProps> = ({ isOpen, onClose }) => {
  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Escape closes, matching every other dismissal path
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create slides"
        className="relative w-full max-w-3xl bg-[#14161B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] origami-unfold"
      >
        {/* Header */}
        <div className="px-6 sm:px-8 pt-6 sm:pt-7 pb-5 border-b border-white/5 flex items-start justify-between gap-4">
          <div>
            <span className="block text-[11px] font-mono uppercase tracking-[0.2em] text-white/35 mb-2">
              Slide sources
            </span>
            <h2 className="font-display text-2xl font-bold text-white mb-2 tracking-tight">
              Create slides
            </h2>
            <p className="text-sm text-white/55 max-w-md">
              Four suggested tools for drafting a deck from scratch.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-2 -mr-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-5 sm:py-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Providers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROVIDERS.map((provider, i) => {
              const Icon = provider.icon;
              return (
                <a
                  key={provider.id}
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "fold-card origami-unfold group relative border bg-white/5 backdrop-blur-md p-5 sm:p-6 flex flex-col min-h-[172px] transition-all duration-300 shadow-xl",
                    "cursor-pointer border-white/10 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                    provider.hoverBorder
                  )}
                  style={{ animationDelay: `${160 + i * 90}ms`, '--fold-glow': provider.foldGlow } as React.CSSProperties}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className={cn(
                      'flex items-center justify-center w-10 h-10 border transition-colors duration-300',
                      provider.chip
                    )}>
                      <Icon className={cn('w-5 h-5 transition-colors duration-300', provider.iconColor)} />
                    </div>
                    <span className="px-1.5 py-0.5 text-[10px] font-mono tracking-wider uppercase text-white/40 border border-white/10">
                      {provider.badge}
                    </span>
                  </div>

                  <h3 className={cn(
                    'font-display text-base sm:text-lg font-semibold text-white transition-colors duration-300',
                    provider.accentText
                  )}>
                    {provider.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-white/50 leading-relaxed mt-2 flex-1">
                    {provider.description}
                  </p>

                  <div className="mt-4 inline-flex items-center gap-1.5 self-start text-[11px] font-mono text-white/40 transition-colors duration-300 group-hover:text-white/70">
                    {provider.domain}
                    <ArrowUpRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </a>
              );
            })}
          </div>

          {/* The round trip: this modal exists to hand work out and take it back.
              The steps are a real sequence, so they are numbered. The last node
              lands in Origami's cyan — the deck arrives home. */}
          <div className="mt-5 border border-white/10 bg-white/[0.03] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0">
            {ROUTE_STEPS.map((step, i) => {
              const Icon = step.icon;
              const isLast = i === ROUTE_STEPS.length - 1;
              return (
                <React.Fragment key={step.label}>
                  {i > 0 && (
                    <>
                      <div className="hidden sm:block flex-1 mx-3 border-t border-dashed border-white/15" />
                      <div className="sm:hidden h-4 w-px ml-[13px] border-l border-dashed border-white/15" />
                    </>
                  )}
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      'flex items-center justify-center w-[26px] h-[26px] border',
                      isLast
                        ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                        : 'border-white/10 bg-white/5 text-white/50'
                    )}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="leading-tight">
                      <span className="block text-[9px] font-mono text-white/30 tracking-widest">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className={cn(
                        'text-xs font-medium',
                        isLast ? 'text-cyan-200' : 'text-white/70'
                      )}>
                        {step.label}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Footer small print */}
        <div className="px-6 sm:px-8 py-3.5 border-t border-white/5">
          <p className="text-[10px] text-white/30 leading-relaxed">
            These are independent third-party services with their own pricing (free tiers and paid plans). Origami is not affiliated with them and is not responsible for their services or billing.
          </p>
        </div>
      </div>
    </div>
  );
};
