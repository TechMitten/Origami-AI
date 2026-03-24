/**
 * Auto-zoom-out generation based on inactivity detection
 * Generates zoom keyframes for intelligent zoom-out during idle periods
 */

import type { ZoomKeyframe, AutoZoomConfig } from '../components/SlideEditor';
import {
  detectIdlePeriods,
  mergeIdlePeriods,
  filterShortIdlePeriods,
  smoothIdleBoundaries,
} from './inactivityDetection';

/**
 * Generate automatic zoom-out keyframes for idle periods
 * Generates transitions to zoom out 2 seconds before idle and back in 1 second after
 */
export function generateAutoZoomKeyframes(
  existingZooms: ZoomKeyframe[],
  cursorData: Array<{ timeMs: number; x: number; y: number }>,
  interactionData: Array<{ timeMs: number; type: string }>,
  totalDurationMs: number,
  config: AutoZoomConfig
): ZoomKeyframe[] {
  if (!config.enabled || totalDurationMs === 0) {
    return existingZooms;
  }

  const {
    minIdleDurationMs = 2000,
    minCursorMovement = 0.015,
    zoomOutLevel = 1.0,
    transitionDurationMs = 500,
  } = config;

  // Detect idle periods
  let idlePeriods = detectIdlePeriods(
    cursorData,
    interactionData,
    totalDurationMs,
    {
      minIdleDurationMs,
      minCursorMovement,
    }
  );

  // Filter out very short periods
  idlePeriods = filterShortIdlePeriods(idlePeriods, minIdleDurationMs);

  // Merge adjacent periods
  idlePeriods = mergeIdlePeriods(idlePeriods, 1000);

  // Smooth boundaries with buffer
  idlePeriods = smoothIdleBoundaries(idlePeriods, 100);

  if (idlePeriods.length === 0) {
    return existingZooms;
  }

  // Convert to seconds
  const transitionDurationSec = transitionDurationMs / 1000;

  // Generate auto-zoom keyframes
  const autoZooms: ZoomKeyframe[] = [];
  const usedIds = new Set(existingZooms.map(z => z.id));

  for (const idle of idlePeriods) {
    const idleStartSec = idle.startMs / 1000;
    const idleEndSec = idle.endMs / 1000;
    const idleDurationSec = idle.durationMs / 1000;

    // Skip very short idles
    if (idleDurationSec < minIdleDurationMs / 1000) continue;

    // Zoom-OUT transition: starts 0.5s before idle begins
    const zoomOutStartSec = Math.max(0, idleStartSec - 0.5);
    const zoomOutId = generateUniqueId(usedIds);
    usedIds.add(zoomOutId);

    autoZooms.push({
      id: zoomOutId,
      timestampStartSeconds: zoomOutStartSec,
      durationSeconds: transitionDurationSec,
      type: 'fixed',
      targetX: 0.5,
      targetY: 0.5,
      zoomLevel: zoomOutLevel,
      easing: 'easeInOutCubic',
      transitionSmoothing: 0.2,
      autoZoomOut: true, // Mark as auto-generated
    });

    // Zoom-IN transition: starts when activity resumes
    const zoomInStartSec = Math.max(zoomOutStartSec + transitionDurationSec, idleEndSec);
    const zoomInId = generateUniqueId(usedIds);
    usedIds.add(zoomInId);

    if (zoomInStartSec < totalDurationMs / 1000) {
      autoZooms.push({
        id: zoomInId,
        timestampStartSeconds: zoomInStartSec,
        durationSeconds: transitionDurationSec,
        type: 'fixed',
        targetX: 0.5,
        targetY: 0.5,
        zoomLevel: 1.25, // Default zoom back in (users can adjust)
        easing: 'easeInOutCubic',
        transitionSmoothing: 0.15,
        autoZoomOut: true, // Mark as auto-generated
      });
    }
  }

  // Merge auto-zoom with existing zooms
  // Auto-zooms should not override user-defined zooms
  const merged = [...existingZooms];

  // Add auto-zooms that don't conflict
  for (const autoZoom of autoZooms) {
    const conflicts = merged.some(
      z =>
        Math.abs(z.timestampStartSeconds - autoZoom.timestampStartSeconds) < 0.5 &&
        !z.autoZoomOut
    );

    if (!conflicts) {
      merged.push(autoZoom);
    }
  }

  // Sort by timestamp
  return merged.sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds);
}

/**
 * Generate a unique ID that doesn't conflict with existing IDs
 */
function generateUniqueId(existingIds: Set<string>): string {
  while (true) {
    const id = `auto-zoom-${crypto.randomUUID()}`;
    if (!existingIds.has(id)) return id;
  }
}

/**
 * Remove auto-generated zoom keyframes from a list
 * Useful for resetting to manual zooms only
 */
export function removeAutoZoomKeyframes(zooms: ZoomKeyframe[]): ZoomKeyframe[] {
  return zooms.filter(z => !z.autoZoomOut);
}

/**
 * Regenerate auto-zoom keyframes based on updated configuration
 * Removes old auto-zooms and generates new ones
 */
export function regenerateAutoZooms(
  zooms: ZoomKeyframe[],
  cursorData: Array<{ timeMs: number; x: number; y: number }>,
  interactionData: Array<{ timeMs: number; type: string }>,
  totalDurationMs: number,
  config: AutoZoomConfig
): ZoomKeyframe[] {
  const manualZooms = removeAutoZoomKeyframes(zooms);
  return generateAutoZoomKeyframes(
    manualZooms,
    cursorData,
    interactionData,
    totalDurationMs,
    config
  );
}

/**
 * Export auto-zoom keyframes for presentation/debugging
 */
export function getAutoZoomKeyframes(zooms: ZoomKeyframe[]): ZoomKeyframe[] {
  return zooms.filter(z => z.autoZoomOut === true);
}

/**
 * Check if auto-zoom is active for a slide
 */
export function isAutoZoomEnabled(
  autoZoomConfig?: { enabled: boolean }
): boolean {
  return autoZoomConfig?.enabled === true;
}
