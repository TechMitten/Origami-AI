/**
 * Easing functions for smooth zoom/pan transitions
 * Each function takes a value t (0-1) and returns an eased value (0-1)
 */

export type EasingType = 
  | 'linear' 
  | 'easeInQuad' 
  | 'easeOutQuad' 
  | 'easeInOutQuad' 
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeInOutQuart'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'easeOutElastic'
  | 'easeOutBounce';

export const easingFunctions: Record<EasingType, (t: number) => number> = {
  linear: (t: number) => t,
  
  // Quadratic
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  
  // Cubic
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  
  // Quartic
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
  
  // Exponential
  easeInExpo: (t: number) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t: number) => 
    t === 0 ? 0 : t === 1 ? 1 : 
    t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : 
    (2 - Math.pow(2, -20 * t + 10)) / 2,
  
  // Elastic (slight overshoot)
  easeOutElastic: (t: number) => {
    const c5 = (2 * Math.PI) / 4.5;
    return t === 0 ? 0 : t === 1 ? 1 :
      Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c5) + 1;
  },
  
  // Bounce (energetic effect)
  easeOutBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/**
 * Interpolate between two values with optional easing
 */
export function interpolate(
  from: number,
  to: number,
  t: number,
  easing: EasingType = 'linear'
): number {
  const easeFunc = easingFunctions[easing];
  const easedT = easeFunc(Math.max(0, Math.min(1, t)));
  return from + (to - from) * easedT;
}

/**
 * Calculate smooth damping factor for continuous panning
 * Higher damping = more viscous/slow (good for following cursor)
 * Lower damping = snappier response
 */
export function calculateDampingFactor(
  targetValue: number,
  currentValue: number,
  damping: number = 0.1,
  maxDelta: number = 0.5
): number {
  const delta = targetValue - currentValue;
  const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, delta));
  return currentValue + clampedDelta * damping;
}

/**
 * Generate a smooth curve for zoom level changes
 * Prevents jerky zoom transitions
 */
export function smoothZoomCurve(
  targetZoom: number,
  currentZoom: number,
  expandRate: number = 0.01,
  contractRate: number = 0.005
): number {
  if (Math.abs(targetZoom - currentZoom) < 0.001) return targetZoom;
  
  const rate = targetZoom > currentZoom ? expandRate : contractRate;
  return currentZoom + (targetZoom - currentZoom) * rate;
}

/**
 * Exponential smoothing with configurable speed
 * speed: 0-1, higher = faster response
 */
export function exponentialSmoothing(
  target: number,
  current: number,
  speed: number = 0.1
): number {
  return current + (target - current) * speed;
}

/**
 * Detect sudden cursor movement (useful for dynamic zoom)
 */
export function calculateCursorVelocity(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  timeDeltaMs: number
): number {
  if (timeDeltaMs === 0) return 0;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance / (timeDeltaMs / 1000); // pixels per second
}
