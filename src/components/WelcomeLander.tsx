import React from 'react';
import { Layers, BrainCircuit, ArrowRight, Video, Github, Cpu, ExternalLink, Clapperboard } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WelcomeLanderProps {
  onContinue: () => void;
}

export const WelcomeLander: React.FC<WelcomeLanderProps> = ({ onContinue }) => {
  const features = [
    {
      icon: Layers,
      title: 'Slide Studio',
      description: 'Convert standard PDF decks into fully narrated, animated video presentations in minutes. Our pipeline handles the heavy lifting, saving hours of manual editing.',
      color: 'text-cyan-300',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-400/30',
    },
    {
      icon: BrainCircuit,
      title: 'Local AI Assistant',
      description: 'Collaborate with a secure local LLM executing directly in your browser. Draft scripts, restructure narration, and optimize your lessons privately.',
      color: 'text-violet-300',
      bg: 'bg-violet-500/10',
      border: 'border-violet-400/30',
    },
    {
      icon: Video,
      title: 'Screen & Media Editor',
      description: 'Record interactive video clips from your browser or desktop and organize them in a unified slide timeline. Mix static slides and dynamic video clips easily.',
      color: 'text-fuchsia-300',
      bg: 'bg-fuchsia-500/10',
      border: 'border-fuchsia-400/30',
    },
    {
      icon: Clapperboard,
      title: 'Shorts Generator',
      description: 'Turn a topic into a faceless short in minutes. A local model writes the script, Pollinations generates the images or video clips, and Kokoro TTS voices it with captions.',
      color: 'text-amber-300',
      bg: 'bg-amber-500/10',
      border: 'border-amber-400/30',
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-700 pb-12">
      {/* Hero Section */}
      <div className="text-center mb-16 relative">
        <div className="absolute inset-0 -top-24 bg-gradient-to-b from-cyan-500/20 via-violet-500/10 to-transparent blur-3xl rounded-full opacity-50 w-3/4 mx-auto h-64 -z-10" />
        
        <span className="inline-block px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-200 mb-6 shadow-[0_0_15px_rgba(34,211,238,0.15)]">
          Welcome to Origami
        </span>
        
        <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white mb-6 tracking-tight leading-tight">
          Your Local <br className="sm:hidden" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400">
            AI Studio
          </span>
        </h1>
        
        <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
          Create stunning tutorials, draft scripts securely, edit presentation media, and generate
          faceless shorts. Everything runs entirely in your browser for maximum privacy and performance.
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full mb-8">
        {features.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="group relative aspect-square bg-[#14161B]/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl overflow-hidden hover:border-white/25 transition-all duration-500 hover:shadow-[0_0_30px_rgba(255,255,255,0.03)]"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {/* Subtle hover gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10 flex flex-col items-start h-full">
                <div className={cn(
                  'w-12 h-12 rounded-2xl flex items-center justify-center border mb-4 shrink-0 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3',
                  feature.bg,
                  feature.border
                )}>
                  <Icon className={cn('w-6 h-6', feature.color)} />
                </div>

                <h3 className="text-xl font-display font-semibold text-white mb-3">
                  {feature.title}
                </h3>

                <p className="text-white/55 leading-relaxed text-sm">
                  {feature.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* WebLLM / WebGPU Explainer */}
      <div className="w-full bg-[#14161B]/40 backdrop-blur-xl border border-white/5 p-8 rounded-3xl mb-6 flex flex-col sm:flex-row items-center justify-between gap-6 hover:border-white/10 transition-all duration-300">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center shrink-0">
            <Cpu className="w-6 h-6 text-cyan-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Powered by WebGPU &amp; WebLLM</h3>
            <p className="text-xs sm:text-sm text-white/50 max-w-xl">
              WebGPU lets your browser tap into your graphics card, and WebLLM uses it to run an AI model
              right on your device &mdash; no server, no account, nothing sent to the cloud. It needs a recent
              browser and a reasonably modern GPU, so check your support before you start.
            </p>
          </div>
        </div>
        <a
          href="https://webgpureport.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm rounded-full transition-all duration-300 whitespace-nowrap shrink-0 hover:scale-105 active:scale-95"
        >
          Check WebGPU Support
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* GitHub Open Source Section */}
      <div className="w-full bg-[#14161B]/40 backdrop-blur-xl border border-white/5 p-8 rounded-3xl mb-16 flex flex-col sm:flex-row items-center justify-between gap-6 hover:border-white/10 transition-all duration-300">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <Github className="w-6 h-6 text-white/70" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Proudly Open Source</h3>
            <p className="text-xs sm:text-sm text-white/50 max-w-xl">
              Origami is built by the community, for the community. View the source code, check dependencies, report issues, or contribute to the project directly on GitHub.
            </p>
          </div>
        </div>
        <a
          href="https://github.com/TechMitten/Origami-AI"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm rounded-full transition-all duration-300 whitespace-nowrap shrink-0 hover:scale-105 active:scale-95"
        >
          <Github className="w-4 h-4" />
          View Repository
        </a>
      </div>

      {/* CTA Button */}
      <button
        onClick={onContinue}
        className="group relative flex items-center justify-center gap-3 px-10 py-5 bg-white text-black rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)] overflow-hidden"
      >
        <span className="relative z-10">Get Started</span>
        <ArrowRight className="w-5 h-5 relative z-10 transition-transform duration-300 group-hover:translate-x-1" />
        
        {/* Button hover effect */}
        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
      </button>
      
      <p className="mt-6 text-sm text-white/30 text-center max-w-sm">
        By continuing, you agree to run AI models locally on your device.
      </p>
    </div>
  );
};
