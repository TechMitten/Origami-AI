/**
 * Inactivity detection for automatic zoom-out logic
 * Analyzes cursor and interaction data to identify idle periods
 */

export interface IdlePeriod {
  startMs: number;
  endMs: number;
  durationMs: number;
  reason: 'no-movement' | 'no-interaction';
}

export interface InactivityConfig {
  /** Minimum cursor movement distance (0-1, normalized) to not count as idle */
  minCursorMovement?: number;
  /** Minimum idle duration to trigger auto-zoom-out, in milliseconds */
  minIdleDurationMs?: number;
  /** Maximum zoom duration before forcing idle check, in milliseconds */
  maxZoomDurationMs?: number;
  /** Debounce inactivity detection, in milliseconds */
  debounceMs?: number;
}

/**
 * Calculate distance between two points (euclidean)
 */
function Distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Detect idle periods based on cursor and interaction data
 * Returns list of idle periods where zoom should automatically reset
 */
export function detectIdlePeriods(
  cursorData: Array<{ timeMs: number; x: number; y: number }>,
  interactionData: Array<{ timeMs: number; type: string }>,
  totalDurationMs: number,
  config: InactivityConfig = {}
): IdlePeriod[] {
  const {
    minCursorMovement = 0.015, // 1.5% of screen movement
    minIdleDurationMs = 2000, // 2 seconds minimum idle
    // maxZoomDurationMs is unused for now; keep config available but don't destructure
    debounceMs = 500, // Debounce idle events
  } = config;

  const idlePeriods: IdlePeriod[] = [];

  if (cursorData.length === 0 && interactionData.length === 0) {
    // Entire duration is idle
    idlePeriods.push({
      startMs: 0,
      endMs: totalDurationMs,
      durationMs: totalDurationMs,
      reason: 'no-interaction',
    });
    return idlePeriods;
  }

  // Combine and sort all activity events with explicit typing so TS can discriminate
  type CursorEvent = { timeMs: number; type: 'cursor'; data: { timeMs: number; x: number; y: number } };
  type InteractionEvent = { timeMs: number; type: 'interaction'; data: { timeMs: number; type: string } };
  const allEvents: Array<CursorEvent | InteractionEvent> = [
    ...cursorData.map(c => ({ timeMs: c.timeMs, type: 'cursor' as const, data: c })),
    ...interactionData.map(i => ({ timeMs: i.timeMs, type: 'interaction' as const, data: i })),
  ].sort((a, b) => a.timeMs - b.timeMs);

  let lastActivityMs = 0;
  // We only need the cursor coordinates for movement checks here - timeMs is tracked separately.
  let lastCursor: { x: number; y: number } = {
    x: cursorData[0]?.x ?? 0.5,
    y: cursorData[0]?.y ?? 0.5,
  };

  for (const event of allEvents) {
    const idleDurationMs = event.timeMs - lastActivityMs;

    if (event.type === 'cursor') {
      // Cursor event: check if movement exceeds threshold
      const cp = event.data;
      const isSignificantCursorMovement = Distance(lastCursor.x, lastCursor.y, cp.x, cp.y) > minCursorMovement;

      if (isSignificantCursorMovement) {
        if (idleDurationMs >= minIdleDurationMs + debounceMs) {
          const idleStart = lastActivityMs + debounceMs;
          const idleEnd = event.timeMs - debounceMs;
          if (idleEnd - idleStart >= minIdleDurationMs) {
            idlePeriods.push({
              startMs: idleStart,
              endMs: idleEnd,
              durationMs: idleEnd - idleStart,
              reason: 'no-movement',
            });
          }
        }

        lastActivityMs = event.timeMs;
        lastCursor = { x: cp.x, y: cp.y };
      }
    } else {
      // Interaction event (click/keypress/scroll) - always counts as activity
      if (idleDurationMs >= minIdleDurationMs + debounceMs) {
        const idleStart = lastActivityMs + debounceMs;
        const idleEnd = event.timeMs - debounceMs;
        if (idleEnd - idleStart >= minIdleDurationMs) {
          idlePeriods.push({
            startMs: idleStart,
            endMs: idleEnd,
            durationMs: idleEnd - idleStart,
            reason: 'no-interaction',
          });
        }
      }

      lastActivityMs = event.timeMs;
    }
  }

  // Check tail: if there's idle time at the end
  const tailIdleMs = totalDurationMs - lastActivityMs;
  if (tailIdleMs >= minIdleDurationMs + debounceMs) {
    const idleStart = lastActivityMs + debounceMs;
    idlePeriods.push({
      startMs: idleStart,
      endMs: totalDurationMs,
      durationMs: totalDurationMs - idleStart,
      reason: 'no-interaction',
    });
  }

  return idlePeriods;
}

/**
 * Merge overlapping or adjacent idle periods
 */
export function mergeIdlePeriods(periods: IdlePeriod[], mergeGapMs: number = 500): IdlePeriod[] {
  if (periods.length === 0) return [];

  const sorted = [...periods].sort((a, b) => a.startMs - b.startMs);
  const merged: IdlePeriod[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current.startMs - last.endMs <= mergeGapMs) {
      // Merge periods
      last.endMs = Math.max(last.endMs, current.endMs);
      last.durationMs = last.endMs - last.startMs;
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Filter out very short idle periods that are below threshold
 */
export function filterShortIdlePeriods(
  periods: IdlePeriod[],
  minDurationMs: number = 1500
): IdlePeriod[] {
  return periods.filter(p => p.durationMs >= minDurationMs);
}

/**
 * Calculate activity density between two timepoints
 * Returns 0-1 score of how active the recording is
 */
export function calculateActivityDensity(
  interactionData: Array<{ timeMs: number }>,
  startMs: number,
  endMs: number
): number {
  const windowDuration = Math.max(1, endMs - startMs);
  const eventsInWindow = interactionData.filter(
    i => i.timeMs >= startMs && i.timeMs <= endMs
  ).length;

  // Normalize: expect 1-2 events per second during active periods
  return Math.min(1, (eventsInWindow / windowDuration) * 1000 / 2);
}

/**
 * Smooth idle period boundaries to avoid abrupt transitions
 * Adds buffer time before zoom-out and after resume
 */
export function smoothIdleBoundaries(
  periods: IdlePeriod[],
  bufferMs: number = 300
): IdlePeriod[] {
  return periods.map(p => ({
    ...p,
    startMs: Math.max(0, p.startMs - bufferMs),
    endMs: p.endMs + bufferMs,
    durationMs: p.endMs + bufferMs - Math.max(0, p.startMs - bufferMs),
  }));
}
