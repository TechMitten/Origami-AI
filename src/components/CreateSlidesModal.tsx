import React, { useEffect } from 'react';
import { X, Sparkles, LayoutTemplate, Palette, Zap, ArrowUpRight } from 'lucide-react';
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
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  logoBg: string;
  badge?: string;
  badgeBg?: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'google-slides',
    name: 'Google Slides',
    description: 'Create, edit, and collaborate on presentations online. Reliable, familiar, and everywhere.',
    url: 'https://docs.google.com/presentation',
    icon: LayoutTemplate,
    accentColor: 'text-yellow-400 group-hover:text-yellow-300',
    logoBg: 'bg-yellow-500/10 border-yellow-500/20 group-hover:bg-yellow-500/20 group-hover:border-yellow-500/30',
    badge: 'Best Quality',
    badgeBg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
  {
    id: 'gamma',
    name: 'Gamma AI',
    description: 'A new medium for presenting ideas, powered by AI. Create beautiful, engaging content with none of the formatting and design work.',
    url: 'https://gamma.app',
    icon: Sparkles,
    accentColor: 'text-pink-400 group-hover:text-pink-300',
    logoBg: 'bg-pink-500/10 border-pink-500/20 group-hover:bg-pink-500/20 group-hover:border-pink-500/30',
    badge: 'Most Customizable',
    badgeBg: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  },
  {
    id: 'beautiful-ai',
    name: 'Beautiful.ai',
    description: 'The AI presentation platform built for enterprise teams. Beautiful.ai keeps every deck on-brand and ready to share across the whole company.',
    url: 'https://www.beautiful.ai',
    icon: Palette,
    accentColor: 'text-blue-400 group-hover:text-blue-300',
    logoBg: 'bg-blue-500/10 border-blue-500/20 group-hover:bg-blue-500/20 group-hover:border-blue-500/30',
    badge: 'Easy to Use',
    badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  {
    id: 'z-ai',
    name: 'Z.ai',
    description: 'An AI-powered presentation assistant that helps you design and structure your slides.',
    url: 'https://z.ai',
    icon: Zap,
    accentColor: 'text-emerald-400 group-hover:text-emerald-300',
    logoBg: 'bg-emerald-500/10 border-emerald-500/20 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30',
    badge: 'Free (Slower)',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  }
];

interface CreateSlidesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-3xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-4 sm:px-8 sm:py-6 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-branding-primary/20 text-branding-primary">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Create Slides</h2>
              <p className="text-xs text-white/40 font-medium">Generate your presentation with these suggested providers.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROVIDERS.map((provider) => {
              const Icon = provider.icon;
              return (
                <a
                  key={provider.id}
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group relative border bg-white/5 backdrop-blur-md p-4 sm:p-5 flex flex-col min-h-[175px] transition-all duration-300 shadow-xl rounded-xl cursor-pointer border-white/10 hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                  )}
                >
                  {provider.badge && (
                    <span className={cn(
                      "absolute top-3 right-3 px-1.5 py-0.5 text-[9px] font-mono tracking-wider font-bold rounded uppercase border",
                      provider.badgeBg || "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                    )}>
                      {provider.badge}
                    </span>
                  )}

                  <div className={cn(
                    'mb-3 flex items-center justify-center w-10 h-10 border transition-all duration-300 rounded-lg',
                    provider.logoBg
                  )}>
                    <Icon className={cn('w-5 h-5 transition-colors duration-300', provider.accentColor)} />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <h3 className={cn(
                      'font-display text-lg font-semibold text-white transition-colors duration-300',
                      provider.accentColor
                    )}>
                      {provider.name}
                    </h3>
                  </div>
                  <p className="text-sm text-white/50 leading-relaxed mb-4 flex-1">
                    {provider.description}
                  </p>

                  <div className={cn(
                    'mt-auto inline-flex items-center gap-1.5 self-start text-xs font-semibold border px-3 py-1.5 transition-all duration-300 bg-white/5 text-white/60 border-white/10 rounded-lg',
                    'group-hover:border-white/30 group-hover:text-white group-hover:bg-white/10'
                  )}>
                    Visit website
                    <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </a>
              );
            })}
          </div>
          
          <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-sm text-cyan-200/80">
            <strong>Pro Tip:</strong> After generating your presentation with any of these tools, export it as a PDF and upload it back here to Origami to continue!
          </div>

          <div className="text-[10px] text-white/35 leading-relaxed text-center px-4 pt-1">
            Disclaimer: The suggested tools are independent third-party services with their own pricing models (including free trials/tiers and paid plans). Origami is not affiliated with these platforms and is not responsible for their services, billing, or operations.
          </div>
        </div>
      </div>
    </div>
  );
};
