import { flushSync } from 'react-dom';

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> };
};

let lastViewTransitionStart = 0;

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Runs a route change inside a View Transition so the outgoing page cross-fades
 * into the incoming one. Falls back to an immediate update when the browser has
 * no View Transitions API or the user asked for reduced motion.
 */
export const startPageTransition = (update: () => void): void => {
  const doc = typeof document === 'undefined' ? undefined : (document as ViewTransitionDocument);

  if (!doc || typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    update();
    return;
  }

  lastViewTransitionStart = Date.now();
  // flushSync forces React to commit before the browser captures the "new" snapshot.
  doc.startViewTransition(() => flushSync(update));
};

/**
 * True when the render currently being committed belongs to a route change that
 * a View Transition is already animating — used to avoid animating it twice.
 * Navigations we can't intercept (browser back/forward) never set this.
 */
export const isViewTransitionInFlight = (): boolean => Date.now() - lastViewTransitionStart < 250;
