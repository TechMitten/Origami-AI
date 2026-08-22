import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Layers,
  BrainCircuit,
  ArrowRight,
  Video,
  Github,
  Cpu,
  ExternalLink,
  Clapperboard,
  Scale,
  Lock,
  Chrome,
  Sliders,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  type LucideIcon,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TransitionLink } from './TransitionLink';
import { AXIS, LANDER_LABEL, LanderPanel, type LanderPanelId } from './lander/LanderPanels';
import landerBg from '../assets/images/landerbg.webp';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WelcomeLanderProps {
  onContinue: () => void;
}

interface Feature {
  id: LanderPanelId;
  icon: LucideIcon;
  title: string;
  tagline: string;
  body: string;
}

/**
 * Ordered along the fold axis by how much of the finished video the machine
 * makes: Slide Studio only adds a voice to slides you drew, Shorts invents every
 * frame from one sentence. The tab order, the accent colors, and the spine
 * running down the page are all that same ramp.
 */
const FEATURES: Feature[] = [
  {
    id: 'slides',
    icon: Layers,
    title: 'Slide Studio',
    tagline: 'Your deck, narrated',
    body:
      'Drop in a PDF. Origami writes the narration, speaks it with Kokoro, times every slide to its own voice track, and renders a 1080p MP4. Each step runs in this tab.',
  },
  {
    id: 'screen',
    icon: Video,
    title: 'Screen Capture',
    tagline: 'Recording that zooms itself',
    body:
      'Capture a browser tab or a whole desktop. When the cursor settles, Origami places pan and zoom keyframes on the spot it settled, so the finished take moves like it was edited. Install the Chrome extension and it also reads clicks and scrolling.',
  },
  {
    id: 'assistant',
    icon: BrainCircuit,
    title: 'Assistant',
    tagline: 'A model on your own GPU',
    body:
      'Run Gemma 2, Llama 3.2, or Phi 3.5 Vision through WebGPU. Ask it to read an image, break down a recording, or draft a script. It keeps working with the network off.',
  },
  {
    id: 'shorts',
    icon: Clapperboard,
    title: 'Shorts',
    tagline: 'One sentence to a vertical video',
    body:
      'Give it a topic. Origami cuts the script into scenes, generates the imagery through Pollinations, speaks the voiceover, burns in the captions, and ducks the music under the voice.',
  },
];

const PIPELINE = [
  { step: '01', title: 'Read the deck', desc: 'PDF.js rasterizes each page and pulls the text off it.' },
  { step: '02', title: 'Write the script', desc: 'A local model, or your own endpoint, drafts spoken narration per slide.' },
  { step: '03', title: 'Speak it', desc: 'Kokoro.js voices the script. Pick a voice and trade quality for speed (q8/q4).' },
  { step: '04', title: 'Render the file', desc: 'FFmpeg.wasm composes slides, voice, music, and transitions into an MP4.' },
];

const CLAIMS = [
  {
    icon: Lock,
    title: 'Your files stay put',
    desc: 'Slides, recordings, audio, and model weights live in this browser. Generating Shorts imagery is the one step that calls out to Pollinations.',
  },
  {
    icon: Sliders,
    title: 'Or bring your own key',
    desc: 'Works offline on local WebGPU models. Point it at Gemini, Groq, Ollama, or any OpenAI-compatible endpoint when you would rather.',
  },
  {
    icon: HardDrive,
    title: 'Projects are one file',
    desc: 'Export a whole project — slides, audio, timeline — as a single .origami archive, and open it back up anywhere.',
  },
];

const MODELS = [
  { name: 'Gemma 2 2B', size: '1.4 GB', desc: 'Quick slide scripts and general drafting.' },
  { name: 'Llama 3.2 1B', size: '800 MB', desc: 'Smallest footprint, loads fast on a laptop.' },
  { name: 'Llama 3.2 3B', size: '1.7 GB', desc: 'Better reasoning and steadier phrasing.' },
  { name: 'Phi 3.5 Vision', size: '3.9 GB', desc: 'Reads images and video frames.' },
];

/**
 * The dog-ear foil on each tab points at that feature's place on the axis, and
 * the row unfolds left to right along it rather than all at once.
 */
function foldStyle(hex: string, index: number): React.CSSProperties {
  return {
    ['--fold-glow' as string]: `linear-gradient(135deg, ${hex}, ${hex}AA 55%, ${hex}33)`,
    animationDelay: `${80 + index * 70}ms`,
  } as React.CSSProperties;
}

export const WelcomeLander: React.FC<WelcomeLanderProps> = ({ onContinue }) => {
  const [current, setCurrent] = useState(0);
  // Pausing is the reader's decision and only the Pause button changes it.
  // Hover and focus suspend the timer separately, so moving the mouse away can
  // never restart a carousel the reader deliberately stopped.
  const [isPaused, setIsPaused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const isPlaying = !isPaused && !isHovering && !isFocusWithin && !reduceMotion;

  // Keyed on `current`, so advancing by hand restarts the full interval rather
  // than inheriting whatever was left of the previous one.
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => setCurrent((c) => (c + 1) % FEATURES.length), 5000);
    return () => clearTimeout(timer);
  }, [isPlaying, current]);

  const goTo = useCallback((index: number, moveFocus = false) => {
    const next = (index + FEATURES.length) % FEATURES.length;
    setCurrent(next);
    if (moveFocus) tabRefs.current[next]?.focus();
  }, []);

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowDown: current + 1,
      ArrowLeft: current - 1,
      ArrowUp: current - 1,
      Home: 0,
      End: FEATURES.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    goTo(next, true);
  };

  const active = FEATURES[current];

  return (
    <div className="relative w-full min-h-screen">
      {/* Backdrop. Two layers: the plate, and one overlay carrying both the
          darkening ramp and the vignette. A full-viewport backdrop-filter used
          to sit between them to blur the plate by 1.5px, which is the most
          expensive way to buy the least visible thing on the page. */}
      <div
        className="fixed inset-0 -z-20 pointer-events-none bg-cover bg-center bg-no-repeat scale-105"
        style={{ backgroundImage: `url(${landerBg})` }}
      />
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          backgroundImage: [
            'radial-gradient(ellipse at 50% 0%, rgb(8 9 12 / 0.25) 20%, rgb(8 9 12 / 0.85) 95%)',
            'linear-gradient(to bottom, rgb(8 9 12 / 0.78), rgb(12 14 20 / 0.72) 45%, rgb(8 9 12 / 0.92))',
          ].join(', '),
        }}
      />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-16">
        {/* The crease. It heats from cold to ember over the height of the page,
            so where you are on the page and where you are on the axis agree. */}
        <div
          className="fold-spine hidden sm:block absolute left-0 top-6 bottom-6 w-px pointer-events-none"
          aria-hidden="true"
        />

        {/* Hero ------------------------------------------------------------ */}
        <header className="origami-unfold text-center max-w-3xl mx-auto mb-14 sm:mb-20">
          <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.08] mb-5">
            Your studio runs
            <br className="hidden sm:inline" /> in{' '}
            <span style={{ color: AXIS[3] }}>this tab</span>.
          </h1>
          <p className="text-base sm:text-lg text-white/65 leading-relaxed max-w-2xl mx-auto">
            Turn a slide deck, a screen recording, or a single prompt into narrated video. Your files never leave
            this browser — the script, the voice, and the render all run on your own machine.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto sm:max-w-none">
            <button
              onClick={onContinue}
              className="focus-ring group w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 bg-white text-black rounded-full font-bold text-base transition-transform duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_35px_rgba(255,255,255,0.2)]"
            >
              Launch Studio
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>

            <a
              href="https://webgpureport.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm rounded-full transition-colors"
            >
              <Cpu className="w-4 h-4" style={{ color: AXIS[0] }} />
              Check WebGPU support
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
          </div>
        </header>

        {/* Explore --------------------------------------------------------- */}
        <section
          className="mb-14 sm:mb-20"
          aria-labelledby="lander-explore-heading"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onFocus={() => setIsFocusWithin(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocusWithin(false);
          }}
        >
          <h2 id="lander-explore-heading" className="sr-only">
            What Origami makes
          </h2>

          {/* The tabs are the indicators. Ordered cold to ember. */}
          <div
            role="tablist"
            aria-label="What Origami makes"
            onKeyDown={onTabKeyDown}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-5"
          >
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              const selected = i === current;
              const hex = AXIS[i];
              return (
                <button
                  key={feature.id}
                  ref={(node) => {
                    tabRefs.current[i] = node;
                  }}
                  id={`lander-tab-${feature.id}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={`lander-panel-${feature.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => goTo(i)}
                  style={foldStyle(hex, i)}
                  className={cn(
                    'fold-card fold-tab focus-ring origami-unfold text-left p-4 sm:p-5 cursor-pointer bg-[#14161B]/80 backdrop-blur-xl border',
                    selected ? 'border-white/25 bg-[#171922]' : 'border-white/10 hover:border-white/20'
                  )}
                >
                  <Icon
                    className="w-5 h-5 mb-3 transition-colors"
                    style={{ color: selected ? hex : 'rgba(255,255,255,0.45)' }}
                  />
                  <span className="block font-display font-semibold text-white text-sm sm:text-base tracking-tight">
                    {feature.title}
                  </span>
                  <span className="block text-xs text-white/50 mt-1 leading-snug">{feature.tagline}</span>
                  <span
                    className="block h-0.5 rounded-full mt-3 transition-all duration-300"
                    style={{
                      width: selected ? '100%' : '1.25rem',
                      backgroundColor: selected ? hex : 'rgba(255,255,255,0.12)',
                    }}
                  />
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl sm:rounded-3xl overflow-hidden border border-white/12 bg-[#14161B]/95 backdrop-blur-2xl shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Reading half */}
              <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div aria-live={isPlaying ? 'off' : 'polite'}>
                  <p className={cn('mb-2', LANDER_LABEL)} style={{ color: AXIS[current] }}>
                    {active.tagline}
                  </p>
                  <h3 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
                    {active.title}
                  </h3>
                  <p className="text-sm sm:text-base text-white/65 leading-relaxed">{active.body}</p>
                </div>

                <div className="crease flex items-center justify-between pt-4">
                  <span className={cn('text-white/35', LANDER_LABEL)}>
                    {current + 1} of {FEATURES.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsPaused((p) => !p)}
                      aria-label={isPaused ? 'Play the tour' : 'Pause the tour'}
                      className="focus-ring w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
                    >
                      {isPaused ? <Play className="w-3.5 h-3.5 ml-0.5" /> : <Pause className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo(current - 1)}
                      aria-label="Previous"
                      className="focus-ring w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer active:scale-95"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo(current + 1)}
                      aria-label="Next"
                      className="focus-ring w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer active:scale-95"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Showing half */}
              <div className="lg:col-span-7 min-h-[300px] sm:min-h-[360px] lg:min-h-[440px] border-t lg:border-t-0 lg:border-l border-white/10">
                {FEATURES.map((feature, i) => (
                  <div
                    key={feature.id}
                    id={`lander-panel-${feature.id}`}
                    role="tabpanel"
                    aria-labelledby={`lander-tab-${feature.id}`}
                    tabIndex={0}
                    hidden={i !== current}
                    className="focus-ring h-full"
                  >
                    {i === current && (
                      <div className="origami-unfold h-full">
                        <LanderPanel id={feature.id} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pipeline -------------------------------------------------------- */}
        <section className="mb-14 sm:mb-20" aria-labelledby="lander-pipeline-heading">
          <div className="mb-6">
            <p className={cn('text-white/35 mb-2', LANDER_LABEL)}>Deck to MP4</p>
            <h2 id="lander-pipeline-heading" className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
              Four steps, no server in any of them
            </h2>
          </div>

          {/* Numbered because this is a real sequence: step 03 cannot run before
              02 has words to speak. The markers heat along the axis as the work
              moves from raw pages to a finished file. */}
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {PIPELINE.map((s, i) => (
              <li
                key={s.step}
                className="rounded-xl sm:rounded-2xl bg-[#14161B]/70 backdrop-blur-xl border border-white/8 p-4 sm:p-5 hover:border-white/20 transition-colors"
              >
                <span
                  className={cn('inline-block px-2 py-0.5 rounded-md mb-3', LANDER_LABEL)}
                  style={{ color: AXIS[i], backgroundColor: `${AXIS[i]}1A`, border: `1px solid ${AXIS[i]}44` }}
                >
                  {s.step}
                </span>
                <h3 className="text-sm sm:text-base font-semibold text-white mb-1">{s.title}</h3>
                <p className="text-xs text-white/55 leading-relaxed">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Runs on your machine -------------------------------------------- */}
        <section className="mb-14 sm:mb-20" aria-labelledby="lander-local-heading">
          <div className="mb-6">
            <p className={cn('text-white/35 mb-2', LANDER_LABEL)}>What that buys you</p>
            <h2 id="lander-local-heading" className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
              Runs on your machine
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-4">
            {CLAIMS.map((claim) => {
              const Icon = claim.icon;
              return (
                <div
                  key={claim.title}
                  className="rounded-2xl bg-[#14161B]/50 backdrop-blur-xl border border-white/8 p-5 hover:border-white/16 transition-colors"
                >
                  <Icon className="w-5 h-5 text-white/55 mb-3" />
                  <h3 className="text-base font-semibold text-white mb-1.5">{claim.title}</h3>
                  <p className="text-xs sm:text-sm text-white/55 leading-relaxed">{claim.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl bg-[#14161B]/50 backdrop-blur-xl border border-white/8 p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-4 mb-4">
              <h3 className={cn('text-white/70', LANDER_LABEL)}>Models it can download</h3>
              <p className={cn('text-white/35 text-right', LANDER_LABEL)}>Cached after the first run</p>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {MODELS.map((m) => (
                <li key={m.name} className="rounded-xl bg-black/30 border border-white/7 p-3.5">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-white truncate">{m.name}</span>
                    <span className={cn('text-white/40 shrink-0', LANDER_LABEL)}>{m.size}</span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed">{m.desc}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="crease mt-6 pt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-xs sm:text-sm text-white/50 max-w-xl leading-relaxed">
              <Chrome className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-white/40" />
              The optional Chrome extension adds click and scroll detail while you record. Origami itself is open
              source under the MIT license.
            </p>
            <div className="flex items-center gap-5 shrink-0">
              <TransitionLink
                to="/license"
                className={cn('focus-ring text-white/40 hover:text-white transition-colors flex items-center gap-1.5', LANDER_LABEL)}
              >
                <Scale className="w-3.5 h-3.5" />
                MIT License
              </TransitionLink>
              <a
                href="https://github.com/TechMitten/Origami-AI"
                target="_blank"
                rel="noopener noreferrer"
                className={cn('focus-ring text-white/40 hover:text-white transition-colors flex items-center gap-1.5', LANDER_LABEL)}
              >
                <Github className="w-3.5 h-3.5" />
                GitHub
              </a>
            </div>
          </div>
        </section>

        {/* Close ------------------------------------------------------------ */}
        <div className="flex flex-col items-center text-center">
          <button
            onClick={onContinue}
            className="focus-ring group w-full sm:w-auto inline-flex items-center justify-center gap-3 px-10 py-5 bg-white text-black rounded-full font-bold text-base sm:text-lg transition-transform duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_40px_rgba(255,255,255,0.2)]"
          >
            Launch Studio
            <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
          <p className="mt-4 text-xs text-white/45">No account, and nothing to install. Your projects stay in this browser.</p>
        </div>
      </div>
    </div>
  );
};
