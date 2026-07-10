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
  },
  {
    id: 'gamma',
    name: 'Gamma AI',
    description: 'A new medium for presenting ideas, powered by AI. Create beautiful, engaging content with none of the formatting and design work.',
    url: 'https://gamma.app',
    icon: Sparkles,
    accentColor: 'text-purple-400 group-hover:text-purple-300',
    logoBg: 'bg-purple-500/10 border-purple-500/20 group-hover:bg-purple-500/20 group-hover:border-purple-500/30',
  },
  {
    id: 'beautiful-ai',
    name: 'Beautiful.ai',
    description: 'Expert deck designer, so you don\'t have to be. Make your business look brilliant.',
    url: 'https://www.beautiful.ai',
    icon: Palette,
    accentColor: 'text-blue-400 group-hover:text-blue-300',
    logoBg: 'bg-blue-500/10 border-blue-500/20 group-hover:bg-blue-500/20 group-hover:border-blue-500/30',
  },
  {
    id: 'z-ai',
    name: 'Z.ai',
    description: 'Generate presentations instantly with AI. Completely free and incredibly fast.',
    url: 'https://z.ai',
    icon: Zap,
    accentColor: 'text-emerald-400 group-hover:text-emerald-300',
    logoBg: 'bg-emerald-500/10 border-emerald-500/20 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30',
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
      <div className="w-full max-w-3xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh]">
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
        <div className="p-4 sm:p-8 overflow-y-auto space-y-6 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROVIDERS.map((provider) => {
              const Icon = provider.icon;
              return (
                <a
                  key={provider.id}
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group relative border bg-white/5 backdrop-blur-md p-6 flex flex-col min-h-[220px] transition-all duration-300 shadow-xl rounded-xl cursor-pointer border-white/10 hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                  )}
                >
                  <div className={cn(
                    'mb-4 flex items-center justify-center w-12 h-12 border transition-all duration-300 rounded-lg',
                    provider.logoBg
                  )}>
                    <Icon className={cn('w-6 h-6 transition-colors duration-300', provider.accentColor)} />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <h3 className={cn(
                      'font-display text-lg font-semibold text-white transition-colors duration-300',
                      provider.accentColor
                    )}>
                      {provider.name}
                    </h3>
                  </div>
                  <p className="text-sm text-white/50 leading-relaxed mb-6 flex-1">
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
        </div>
      </div>
    </div>
  );
};
