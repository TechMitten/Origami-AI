import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Starters that match what this app is actually used for — decks, narration and
 * shorts — so the first click lands somewhere useful instead of demonstrating
 * that a chatbot can chat.
 */
const STARTER_PROMPTS = [
  'Rewrite this slide narration so it sounds spoken, not read aloud.',
  'Turn these bullet points into a 30-second script.',
  'Outline a two-minute tutorial from this rough note.',
  'Summarize these notes into action items.',
];

interface ChatEmptyStateProps {
  modelName: string | null;
  modelSize?: string;
  supportsVision: boolean;
  isModelLoaded: boolean;
  onUsePrompt: (prompt: string) => void;
  engineMode: 'webllm' | 'api';
}

const Fact: React.FC<{ label: string; value: string; live?: boolean }> = ({ label, value, live }) => (
  <li className="flex items-center gap-2">
    <span
      aria-hidden
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', live ? 'bg-emerald-400' : 'bg-white/25')}
    />
    <span className="text-xs text-white/35">{label}</span>
    <span className="font-display text-xs text-white/70">{value}</span>
  </li>
);

export const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({
  modelName,
  modelSize,
  supportsVision,
  isModelLoaded,
  onUsePrompt,
  engineMode,
}) => (
  // min-h-full, not h-full: on a short viewport the starters have to be able to
  // push past the fold and let the transcript pane scroll.
  <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-1 py-10">
    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
      {engineMode === 'api' ? 'API endpoint chat' : 'On-device chat'}
    </p>

    <h2 className="font-display mt-3 text-[clamp(1.5rem,3.6vw,2.15rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-white">
      {engineMode === 'api' ? 'Chatting through your configured endpoint.' : 'Nothing you type here leaves the tab.'}
    </h2>

    <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/45">
      {engineMode === 'api'
        ? 'Messages are sent to the OpenAI-compatible endpoint configured in Settings > API.'
        : 'The model runs on your GPU through WebLLM. It downloads once, then answers with no network call — prompts, screenshots and clips stay on this device.'}
    </p>

    {/* The same fact strip the Shorts bench uses: what is loaded, how big it is,
        and what it can read. The dot is green only once weights are in memory. */}
    <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
      <Fact label="Model" value={modelName || 'None selected'} live={isModelLoaded} />
      {engineMode === 'webllm' && <Fact label="Weights" value={modelSize || 'Unknown size'} />}
      <Fact label="Reads" value={supportsVision ? 'Text + images' : 'Text only'} />
    </ul>

    <div className="mt-8 grid gap-2 sm:grid-cols-2">
      {STARTER_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onUsePrompt(prompt)}
          className="focus-ring rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-left text-sm leading-relaxed text-white/65 transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/[0.06] hover:text-white"
        >
          {prompt}
        </button>
      ))}
    </div>
  </div>
);
