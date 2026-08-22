import React from 'react';
import { BrainCircuit } from 'lucide-react';

/**
 * The four lander panels.
 *
 * All four are drawn rather than photographed. The two that used to be images
 * pointed at og.webp and shortsplash.webp, which are share banners: each one
 * carries the Origami wordmark and its own tagline, so the carousel showed the
 * product's advertising on a screen that already has the wordmark in the header
 * and the same claim in the h1. Drawing them keeps one medium across the set and
 * drops ~185 KB that bought nothing.
 */

export type LanderPanelId = 'slides' | 'screen' | 'assistant' | 'shorts';

/** The Footer's micro-label idiom, promoted to this page's utility register. */
export const LANDER_LABEL = 'text-[10px] font-bold uppercase tracking-[0.2em]';

/**
 * The fold axis, ordered by how much of the finished video the machine makes:
 * Slide Studio only adds a voice to slides you drew, Shorts invents every frame
 * from one sentence. Cold to ember, and the tab order is that same ramp.
 */
export const AXIS = ['#22D3EE', '#5BA8E8', '#F0A94B', '#FF5C1A'] as const;

const SLIDE_TIMINGS = [
  { label: 'Title', width: 'w-[14%]' },
  { label: 'Problem', width: 'w-[26%]' },
  { label: 'Roadmap', width: 'w-[34%]' },
  { label: 'Close', width: 'flex-1' },
];

const WAVEFORM = [22, 41, 68, 37, 58, 79, 52, 28, 63, 74, 47, 29, 58, 71, 38, 49, 64, 33, 55, 70, 44, 26, 60, 68];

const SCENES = [
  { n: '1', beat: 'Hook', secs: '0:04' },
  { n: '2', beat: 'Build', secs: '0:11' },
  { n: '3', beat: 'Payoff', secs: '0:07' },
];

/** Shared chrome so the four mocks read as four views of one application. */
const PanelShell: React.FC<{
  accent: string;
  left: React.ReactNode;
  right: React.ReactNode;
  children: React.ReactNode;
}> = ({ accent, left, right, children }) => (
  <div className="w-full h-full p-5 sm:p-7 flex flex-col bg-[#0F1115] select-none">
    <div className={`flex items-center justify-between gap-3 pb-2.5 text-white/45 ${LANDER_LABEL}`}>
      <span className="flex items-center gap-2 text-white/70">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        {left}
      </span>
      <span className="hidden sm:inline">{right}</span>
    </div>
    <div className="crease flex-1 min-h-0 pt-4">{children}</div>
  </div>
);

const SlidesPanel: React.FC = () => {
  const accent = AXIS[0];
  return (
    <PanelShell accent={accent} left="Slide Studio" right="12 slides · 1080p">
      <div className="h-full flex flex-col justify-between gap-4">
        {/* Filmstrip. The third slide is the one being narrated. */}
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-16/10 rounded-lg border bg-[#14161B] p-2 flex flex-col gap-1.5 justify-center"
              style={
                i === 2
                  ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}33, 0 0 18px ${accent}22` }
                  : { borderColor: 'rgba(255,255,255,0.08)' }
              }
            >
              <div className="h-1.5 w-2/3 rounded-full bg-white/25" />
              <div className="h-1 w-full rounded-full bg-white/10" />
              <div className="h-1 w-5/6 rounded-full bg-white/10" />
            </div>
          ))}
        </div>

        {/* Timing track: slide durations, set by how long the narration runs. */}
        <div className="space-y-1.5">
          <div className={`flex items-center justify-between text-white/35 ${LANDER_LABEL}`}>
            <span>Timing</span>
            <span>2:48 total</span>
          </div>
          <div className="h-5 w-full rounded-md bg-black/40 border border-white/10 p-0.5 flex gap-1">
            {SLIDE_TIMINGS.map((seg, i) => (
              <div
                key={seg.label}
                className={`h-full rounded ${seg.width} flex items-center justify-center text-[9px] font-medium truncate px-1`}
                style={
                  i === 2
                    ? { backgroundColor: `${accent}2E`, border: `1px solid ${accent}66`, color: '#DFF6FD' }
                    : { backgroundColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)' }
                }
              >
                {seg.label}
              </div>
            ))}
          </div>
        </div>

        {/* The narration under the active slide, and the voice track it became. */}
        <div className="rounded-xl border border-white/10 bg-black/30 p-3.5 space-y-2.5">
          <p className="text-xs sm:text-[13px] text-white/70 leading-relaxed">
            “In the third quarter we cut render time by forty percent, without a single file leaving the device.”
          </p>
          <div className="flex items-end gap-[3px] h-6" aria-hidden="true">
            {WAVEFORM.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-full"
                style={{
                  height: `${Math.max(2, h * 0.24)}px`,
                  backgroundColor: i < 15 ? `${accent}99` : 'rgba(255,255,255,0.16)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </PanelShell>
  );
};

const ScreenPanel: React.FC = () => {
  const accent = AXIS[1];
  return (
    <PanelShell accent={accent} left="Recording · 02:14" right="1080p · 60 fps">
      <div className="h-full flex flex-col justify-between gap-3">
        {/* The captured window, with the frame the camera has zoomed to. */}
        <div className="flex-1 min-h-0 rounded-xl bg-[#14161B] border border-white/10 relative flex items-center justify-center p-4 overflow-hidden">
          <div className="absolute top-3 left-3.5 flex items-center gap-1.5" aria-hidden="true">
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="w-2 h-2 rounded-full bg-white/15" />
          </div>

          <div className="w-full max-w-sm space-y-2 opacity-15" aria-hidden="true">
            <div className="h-2.5 w-3/4 bg-white/40 rounded" />
            <div className="h-2 w-full bg-white/25 rounded" />
            <div className="h-2 w-5/6 bg-white/25 rounded" />
          </div>

          <div
            className="absolute inset-x-10 sm:inset-x-16 inset-y-6 rounded-lg flex items-center justify-center"
            style={{ border: `1px solid ${accent}55`, backgroundColor: `${accent}0A` }}
          >
            <span
              className={`px-2.5 py-1 rounded-md bg-black/70 border border-white/15 text-white/85 ${LANDER_LABEL}`}
            >
              Zoomed to 1.5×
            </span>
          </div>
        </div>

        {/* Zoom keyframes, placed where the cursor went quiet. */}
        <div className="space-y-1.5">
          <div className={`flex items-center justify-between text-white/35 ${LANDER_LABEL}`}>
            <span>Zoom keyframes</span>
            <span>4 placed</span>
          </div>
          <div className="h-5 w-full rounded-md bg-black/40 border border-white/10 p-0.5 flex gap-1">
            <div className="h-full w-1/4 rounded bg-white/7 flex items-center justify-center text-[9px] text-white/50">
              Wide
            </div>
            <div
              className="h-full w-2/5 rounded flex items-center justify-center text-[9px] font-medium"
              style={{ backgroundColor: `${accent}2E`, border: `1px solid ${accent}66`, color: '#E4EFFC' }}
            >
              Zoom
            </div>
            <div className="h-full flex-1 rounded bg-white/7 flex items-center justify-center text-[9px] text-white/50">
              Wide
            </div>
          </div>
        </div>
      </div>
    </PanelShell>
  );
};

const AssistantPanel: React.FC = () => {
  const accent = AXIS[2];
  return (
    <PanelShell accent={accent} left="Assistant" right="Offline">
      <div className="h-full flex flex-col justify-center gap-4">
        <div className="flex items-start gap-3 max-w-[85%] self-end">
          <div className="bg-white/7 border border-white/10 px-4 py-2.5 rounded-2xl rounded-tr-sm text-xs sm:text-sm text-white/85">
            Write the narration for slide 3.
          </div>
          <div
            className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 text-white/60 ${LANDER_LABEL}`}
            style={{ borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            You
          </div>
        </div>

        <div className="flex items-start gap-3 max-w-[92%] self-start">
          <div
            className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0"
            style={{ borderColor: `${accent}66`, backgroundColor: `${accent}1A`, color: accent }}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
          </div>
          <div className="bg-[#16181F] border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm space-y-2">
            <div
              className={`flex items-center gap-2 border-b border-white/7 pb-1.5 ${LANDER_LABEL}`}
              style={{ color: accent }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
              <span>Gemma 2 · 2B · your GPU · 18 tok/s</span>
            </div>
            <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
              “In the third quarter we cut render time by forty percent, without a single file leaving the device.”
              <span className="stream-caret ml-0.5" aria-hidden="true">
                ▍
              </span>
            </p>
          </div>
        </div>
      </div>
    </PanelShell>
  );
};

const ShortsPanel: React.FC = () => {
  const accent = AXIS[3];
  return (
    <PanelShell accent={accent} left="Shorts" right="9:16 · 22s">
      <div className="h-full flex items-center justify-center gap-5 sm:gap-7">
        {/* The frame, with the two scenes behind it stacked back into depth. */}
        <div className="relative h-full max-h-[230px] aspect-9/16 shrink-0">
          <div className="absolute inset-0 translate-x-3 translate-y-2 rounded-xl bg-white/5 border border-white/7" />
          <div className="absolute inset-0 translate-x-1.5 translate-y-1 rounded-xl bg-white/7 border border-white/10" />
          <div
            className="monitor-gate absolute inset-0 rounded-xl overflow-hidden flex items-end justify-center p-2.5"
            style={{
              border: `1px solid ${accent}55`,
              backgroundImage: `radial-gradient(ellipse at 50% 25%, ${accent}33, #101216 70%)`,
            }}
          >
            <p className="relative z-10 text-center text-[11px] sm:text-xs font-bold leading-snug text-white drop-shadow-lg">
              nothing ever{' '}
              <span className="px-1 rounded" style={{ backgroundColor: accent, color: '#12080B' }}>
                leaves
              </span>{' '}
              your laptop
            </p>
          </div>
        </div>

        {/* The beats the script was cut into. */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className={`text-white/35 ${LANDER_LABEL}`}>Scenes</div>
          {SCENES.map((s, i) => (
            <div
              key={s.n}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
              style={
                i === 0
                  ? { borderColor: `${accent}55`, backgroundColor: `${accent}14` }
                  : { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.25)' }
              }
            >
              <span
                className={`${LANDER_LABEL} shrink-0`}
                style={{ color: i === 0 ? accent : 'rgba(255,255,255,0.35)' }}
              >
                {s.n}
              </span>
              <span className="text-xs text-white/75 truncate flex-1">{s.beat}</span>
              <span className={`text-white/40 shrink-0 ${LANDER_LABEL}`}>{s.secs}</span>
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
};

const PANELS: Record<LanderPanelId, React.FC> = {
  slides: SlidesPanel,
  screen: ScreenPanel,
  assistant: AssistantPanel,
  shorts: ShortsPanel,
};

export const LanderPanel: React.FC<{ id: LanderPanelId }> = ({ id }) => {
  const Panel = PANELS[id];
  return <Panel />;
};
