import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Globe, KeyRound, ShieldCheck, Sparkles, X } from 'lucide-react';

interface PollinationsInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => void;
}

/**
 * Explains the "You are not connected to Pollinations" notice in plain terms.
 * Content mirrors the Pollinations integration docs (Docs/pollinations.md) and
 * the two-transport model in pollinationsService.ts: a user key goes straight to
 * Pollinations, otherwise the request is proxied through this server.
 */
export const PollinationsInfoModal: React.FC<PollinationsInfoModalProps> = ({
  isOpen,
  onClose,
  onConnect,
}) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isRendered) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl transition-all duration-200 ${
          isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10">
              <Sparkles className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">About Pollinations</h2>
              <p className="text-xs text-white/45">
                The AI service that generates the visuals for your short.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-white/40 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5 text-sm leading-relaxed text-white/70">
          <p>
            <span className="font-semibold text-white/90">Pollinations</span> is the API that generates the
            images or video clips used in your viral short video. Every scene sends a prompt to it, and it
            returns the still or clip that plays in that scene. Each request needs an API key to say{' '}
            <span className="text-white/90">who is asking</span>.
          </p>

          <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.08] p-4">
            <p className="flex items-start gap-2 text-amber-100/90">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" />
              <span>
                <span className="font-semibold">Right now you're not connected.</span> Your images or clips
                are requested through this server instead, which only works if the server has its own
                Pollinations key configured. If it doesn't, generating the visuals for your short will fail.
              </span>
            </p>
          </div>

          <p>
            Connecting your own account changes this: your image and video requests go{' '}
            <span className="text-white/90">straight to Pollinations</span> under your own
            budget-capped, revocable access token. You can disconnect at any time from Settings.
          </p>

          <a
            href="https://github.com/pollinations/pollinations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-300 underline underline-offset-2 transition-colors hover:text-cyan-200"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Learn more about Pollinations on GitHub
          </a>

          <div className="space-y-2">
            <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <p className="text-xs">
                You don't paste a key. Origami uses <span className="text-white/90">Sign in with
                Pollinations</span>, so you authorize a scoped token through your browser — the secret
                part never touches this app.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <p className="text-xs">
                Your token is stored only in this browser and expires on its own. It never reaches
                Origami's server.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-black/20 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-white/60 transition-colors hover:text-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onConnect}
            className="rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-bold text-black transition-all hover:brightness-110"
          >
            Connect
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
