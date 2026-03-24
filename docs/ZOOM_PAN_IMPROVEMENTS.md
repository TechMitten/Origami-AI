# Zoom/Pan/Follow Logic Improvements

This document describes the comprehensive improvements made to the zoom, pan, and cursor-following logic in the screen recording and video rendering system.

## Overview of Improvements

### 1. **Easing Functions for Smooth Transitions** ✨

Added a complete suite of easing functions to make zoom transitions feel natural and cinematic:

- **Linear** - Consistent speed (original behavior)
- **Ease In/Out Quad** - Smooth start or end
- **Ease In/Out Cubic** - More pronounced smoothing
- **Ease In/Out Quart** - Even stronger effect
- **Ease In/Out Expo** - Exponential acceleration
- **Elastic** - Subtle overshoot for energetic feel
- **Bounce** - Playful effect with slight bounce-back

**File:** `src/utils/easingFunctions.ts`

### 2. **Higher Cursor Tracking Sample Rate** 📊

**Before:** 4 samples per second (0.25s intervals) → Jerky cursor following
**After:** 20 samples per second (0.05s intervals) → Smooth, fluid motion

**Benefit:** Cursor-following zoom now feels continuous rather than stepping between positions.

### 3. **Linear Cursor Interpolation** 📍

Instead of snapping to the nearest recorded cursor position, the system now linearly interpolates between recorded cursor points. This provides smooth motion even when the recording didn't capture a cursor point at that exact millisecond.

### 4. **Configurable Transition Smoothing** 🎯

Added a new parameter `transitionSmoothing` (0-1):
- **0** = Instant transition
- **0.15** = Balanced (default)
- **0.5** = Very smooth
- **1.0** = Extremely slow

This controls how quickly the zoom transitions into its target state.

### 5. **Configurable Cursor Damping** 🕹️

Added `cursorDamping` parameter (0.001-0.05):
- **0.001** = Instant cursor following (snappy)
- **0.01** = Balanced (default)
- **0.03** = Smooth, slower response
- **0.05** = Very viscous, leisurely motion

This is only available when using "Follow Cursor" mode.

### 6. **Better Zoom State Management** 🔄

Zoom levels now transition smoothly using exponential smoothing with separate rates for zooming in vs. zooming out (zoom-in is faster for dramatic effect).

### 7. **Enhanced UI Controls** 🎨

The ZoomTimelineEditor now includes an "Advanced" section with:
- **Transition Easing** - Select from 8+ easing functions
- **Transition Smoothing** - Control transition speed
- **Cursor Smoothness** - Adjust cursor damping (cursor following only)
- **Predictive Cursor Follow** - Enable lookahead (experimental)

## Usage

### Basic Usage

1. **Enable Zoom:** Click "Add Zoom" button on the timeline
2. **Configure Type:**
   - "Follow Cursor" - Automatically tracks cursor position
   - "Fixed" - Manual X/Y position

3. **Set Scale:** Adjust the zoom level (1.0x to 4.0x)

### Advanced Features

1. **Select Easing Function:**
   - Click the keyframe
   - Expand "Advanced" section
   - Choose an easing type
   - **Tip:** Use "Ease Out" for smooth de-zooming, "Ease In" for dramatic zoom-in

2. **Fine-Tune Smoothing:**
   - Adjust "Transition Smoothing" slider
   - For quick cuts: Use low values (0.05-0.1)
   - For cinematic transitions: Use higher values (0.2-0.5)

3. **Adjust Cursor Following Speed:**
   - Only available with "Follow Cursor" enabled
   - Lower damping = faster, more responsive cursor tracking
   - Higher damping = smoother, more predictable motion
   - **Recommended:** 0.008-0.015 for most use cases

## Technical Details

### Easing Functions Implementation

Easing functions are implemented in two places:

1. **Generator Functions** (`src/utils/easingFunctions.ts`):
   - Utility functions for JavaScript-side calculations
   - Used for previews and UI computations

2. **FFmpeg Expressions** (in `BrowserVideoRenderer.ts`):
   - Converted to FFmpeg expression syntax
   - Runs during video rendering in WASM
   - Examples:
     - `easeOutQuad` → `1-pow(1-t,2)`
     - `easeInOutCubic` → `if(lt(t,0.5),4*t*t*t,1-pow(-2*t+2,3)/2)`

### Cursor Interpolation Algorithm

For smarter cursor following:

```typescript
// Linear interpolation between recorded cursor points
const getCursorAtTime = (timeSeconds: number) => {
  const timeMs = timeSeconds * 1000;
  const trackIndex = slide.cursorTrack.findIndex(c => c.timeMs >= timeMs);
  
  if (trackIndex === 0) return slide.cursorTrack[0];
  if (trackIndex === -1) return slide.cursorTrack[slide.cursorTrack.length - 1];
  
  const before = slide.cursorTrack[trackIndex - 1];
  const after = slide.cursorTrack[trackIndex];
  
  const progress = (timeMs - before.timeMs) / (after.timeMs - before.timeMs);
  return {
    x: before.x + (after.x - before.x) * progress,
    y: before.y + (after.y - before.y) * progress,
  };
};
```

### Damping Calculation

The zoom and pan motion use configurable exponential smoothing:

```
new_position = pzoom + (target_zoom - pzoom) * damping_factor
```

This creates smooth, natural-feeling motion that doesn't feel mechanical.

## ZoomKeyframe Type Extension

The `ZoomKeyframe` interface now includes:

```typescript
export interface ZoomKeyframe {
  id: string;
  timestampStartSeconds: number;
  durationSeconds: number;
  type: 'fixed' | 'cursor';
  targetX?: number;  // 0-1 percentage
  targetY?: number;  // 0-1 percentage
  zoomLevel: number;
  // NEW FIELDS:
  easing?: 'linear' | 'easeInQuad' | 'easeOutQuad' | ... | 'easeOutBounce';
  transitionSmoothing?: number;  // 0-1
  cursorDamping?: number;  // 0.001-0.05
  predictiveCursor?: boolean;
}
```

## Performance Considerations

- **Sample Rate Increase:** Increased from 0.25s to 0.05s intervals (5x more samples)
  - Minimal impact on render time
  - Dramatically improves visual quality
  - FFmpeg can handle this efficiently

- **Easing Calculations:** Done in FFmpeg (WASM)
  - No JavaScript overhead during rendering
  - Highly optimized

- **File Size:** No change - easing parameters are minimal JSON

## Migration from Old Format

Existing zoom keyframes will work as-is:

- Missing easing defaults to `'linear'` (old behavior)
- Missing transitionSmoothing defaults to `0.1` (smooth)
- Missing cursorDamping defaults to `0.01` (balanced)
- Missing predictiveCursor defaults to `false` (disabled)

**No migration needed** - old videos will render correctly with new defaults.

## Recommendations

### For Tutorial/Documentation Videos
- **Easing:** Use `easeInOutCubic` for natural feel
- **Transition Smoothing:** 0.15-0.25
- **Cursor Damping:** 0.012-0.015
- **Description:** Professional, smooth, easy to follow

### For Action/Fast-Paced Videos
- **Easing:** Use `easeOutQuad` for snappy responses
- **Transition Smoothing:** 0.05-0.1
- **Cursor Damping:** 0.005-0.008
- **Description:** Responsive, energetic, quick edits

### For Cinematic Presentations
- **Easing:** Use `easeOutElastic` or `easeInCubic`
- **Transition Smoothing:** 0.25-0.4
- **Cursor Damping:** 0.015-0.02
- **Description:** Dramatic, polished, engaging

### For Mobile/Web Tutorials
- **Easing:** Use `easeInOutQuad`
- **Transition Smoothing:** 0.1-0.2
- **Cursor Damping:** 0.01-0.012
- **Description:** Clear, focused, easy to follow

## Troubleshooting

### Zoom feels jumpy or jerky
→ Increase `cursorDamping` to 0.015-0.02

### Zoom is too slow to react
→ Decrease `cursorDamping` to 0.005-0.008

### Transitions feel abrupt
→ Increase `transitionSmoothing` to 0.2+

### Cursor follows too directly (no smoothing)
→ Use easing like `easeOutCubic` instead of `linear`

### Video rendering is slow
→ This shouldn't happen - easing runs in FFmpeg. If slow, check FFmpeg console logs.

## Files Modified

1. **src/utils/easingFunctions.ts** (NEW)
   - Easing function implementations
   - Utility helpers for interpolation

2. **src/components/SlideEditor.tsx**
   - Extended `ZoomKeyframe` interface
   - Added new optional fields

3. **src/components/ZoomTimelineEditor.tsx**
   - Enhanced UI with Advanced section
   - New controls for easing, smoothing, damping
   - Updated defaults for better UX

4. **src/services/BrowserVideoRenderer.ts**
   - Improved zoom rendering logic
   - Higher cursor sampling rate (0.25s → 0.05s)
   - Linear cursor interpolation
   - Configurable damping per keyframe
   - FFmpeg easing expressions

## Future Enhancements

Potential improvements for future versions:

1. **Predictive Cursor Following** - Look ahead in cursor track for smoother anticipation
2. **Auto-Zoom Based on Cursor Velocity** - Automatically adjust zoom based on cursor speed
3. **Multi-Keyframe Transitions** - Smooth transitions between multiple zoom levels
4. **Recording Feedback** - Show zoom/pan preview while recording
5. **Presets** - Save and reuse zoom configuration templates
6. **Cursor Visibility Options** - Highlight or customize cursor appearance
7. **Smart Zoom** - AI-based automatic zoom following important UI elements

## Questions or Issues?

Refer to the main CLAUDE.md documentation for project context, or check the browser console for FFmpeg-specific zoom filter logs.
