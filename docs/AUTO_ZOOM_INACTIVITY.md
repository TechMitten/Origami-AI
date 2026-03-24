# Auto-Zoom-Out on Inactivity Feature

## Overview

The auto-zoom-out feature intelligently detects when there's no user activity (no typing, scrolling, or mouse movement) during a screen recording and automatically zooms out during these idle periods. This provides better context and prevents the viewer from staying zoomed-in on a static area unnecessarily.

## How It Works

### Inactivity Detection

The system analyzes:
- **Cursor movement**: Tracks if the cursor has moved a significant distance (configurable threshold)
- **Keyboard events**: Detects typing/keyboard interactions
- **Mouse events**: Records clicks and scrolling
- **Time gaps**: Identifies periods where none of the above occurred

### Auto-Zoom Generation

When idle periods are detected:
1. **Zoom-out transition** starts 0.5 seconds before idle begins
2. **Stays zoomed out** during the entire idle period
3. **Zoom-in transition** starts when activity resumes

All transitions use smooth easing (`easeInOutCubic`) for professional appearance.

## Configuration

### Enable Auto-Zoom

1. Record a browser tab with `useScreenRecorder`
2. In the Slide Editor, click "Auto-Zoom Settings"
3. Toggle **"Auto-Zoom Out During Idle Periods"** to enable

### Configuration Options

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| **Min Idle Duration** | 500-5000ms | 2000ms | Minimum time without activity before zoom-out |
| **Min Cursor Movement** | 0.005-0.1 | 0.015 | Minimum cursor distance (0-1 screen) to count as activity |
| **Zoom Out Level** | 1.0-2.0x | 1.0x | How far to zoom out (1.0 = no zoom) |
| **Transition Duration** | 100-2000ms | 500ms | Smooth transition time for zoom in/out |

## Technical Implementation

### Files

1. **`src/utils/inactivityDetection.ts`** - Core inactivity detection
   - `detectIdlePeriods()` - Analyzes cursor and interaction data
   - `mergeIdlePeriods()` - Combines overlapping idle periods
   - `calculateActivityDensity()` - Measures how active a period is

2. **`src/utils/autoZoomGeneration.ts`** - Auto-zoom keyframe generation
   - `generateAutoZoomKeyframes()` - Creates zoom keyframes for idle periods
   - `removeAutoZoomKeyframes()` - Filters out auto-generated zooms
   - `regenerateAutoZooms()` - Regenerates after config changes

3. **`src/components/ZoomTimelineEditor.tsx`** - UI controls
   - Auto-Zoom Settings panel with collapsible controls
   - Configuration sliders and toggles

4. **`src/services/BrowserVideoRenderer.ts`** - Rendering integration
   - Calls `generateAutoZoomKeyframes()` before rendering
   - Uses generated keyframes for zoom filter creation

### Algorithm

```
For each idle period detected:
  1. Generate zoom-OUT keyframe at (idleStart - 0.5s)
  2. Generate zoom-IN keyframe at idleEnd or when activity resumes
  3. Merge with user-defined zoom keyframes
  4. Skip if conflicts with existing user zooms
```

### Zoom Keyframe Structure

Auto-generated zoom keyframes are marked with `autoZoomOut: true` and have:
- `easing: 'easeInOutCubic'` - Smooth transitions
- `transitionSmoothing: 0.2` - Controlled transition speed
- `type: 'fixed'` - Always fixed zoom-out position
- Auto-generated IDs prefixed with `'auto-zoom-'`

## Usage Examples

### Tutorial Videos
```
Min Idle Duration: 2000ms (2 sec gap before zoom)
Zoom Out Level: 1.0x (fully zoomed out)
Transition Duration: 500ms
Result: Professional pacing, shows full context
```

### Fast-Paced Demos
```
Min Idle Duration: 1000ms (1 sec - snappier)
Zoom Out Level: 1.0x
Transition Duration: 300ms (faster transitions)
Result: Energetic feel, quick context switches
```

### Live Coding with Long Pauses
```
Min Idle Duration: 3000-5000ms (longer idling acceptable)
Zoom Out Level: 1.0x
Transition Duration: 700ms (more gradual)
Result: Lets developer think, zooms out during explanations
```

## Advanced Features

### Manual Override
- User-defined zoom keyframes always take priority
- Auto-zooms won't override manually placed zooms that conflict
- Manual zooms can coexist with auto-zooms

### Regenerate on Config Change
- Change settings and regenerate auto-zooms without re-recording
- Remove auto-zooms entirely while keeping manual ones
- Export/import configurations

### Activity Analysis
- View detected idle periods in timeline
- Adjust thresholds based on actual recording data
- Manually refine auto-generated keyframes

## Limitations & Edge Cases

1. **No cursor data**: If cursor tracking is disabled, inactivity detection won't work
2. **Fast typing**: Very frequent keypresses might prevent zoom-out (as designed)
3. **Mouse movement without interaction**: Cursor tracking alone counts as activity
4. **Video slides**: Auto-zoom works only on image slides with cursor data
5. **Very short idle periods**: Sub-2000ms gaps ignored to prevent constant zooming

## Recommended Settings

| Scenario | Idle Time | Zoom Level | Description |
|----------|-----------|-----------|-------------|
| UI Walkthrough | 2-3s | 1.0x | Shows full interface context |
| Code Editing | 2s | 1.0x | Shows entire code window |
| Mouse Hovering | 3-4s | 1.0x | Avoids zoom-in/out during tooltips |
| Fast Demo | 1-1.5s | 1.0x | Snappy, responsive feel |
| Slow Tutorial | 3-4s | 1.0x | Gives viewers time to read |

## Troubleshooting

### Auto-zoom not working
- ✓ Check cursor data was recorded (should see cursor points in timeline)
- ✓ Verify auto-zoom is enabled in settings
- ✓ Check idle duration threshold isn't too high

### Too much zooming in/out
- ↑ Increase "Min Idle Duration" to require longer pauses
- ↓ Decrease cursor movement sensitivity to require more movement

### Zoom happens at wrong times
- Check min cursor movement setting (may be too high)
- Verify idle duration threshold matches content
- Consider manual zoom keyframes for specific areas

### Auto-zooms conflicting with manual ones
- This is prevented by design
- Manual zoom keyframes take priority
- Auto-zooms around manual zooms get adjusted

## Future Enhancements

1. **Predictive auto-zoom** - Look ahead for upcoming activity
2. **Activity-based zoom levels** - Vary zoom level based on detection confidence
3. **Machine learning tuning** - Learn from user's manual zoom patterns
4. **Per-element zoom** - Zoom to specific UI elements based on interaction
5. **Audio sync** - Coordinate zoom-outs with narration pauses
6. **Hover detection** - Stay zoomed on elements during hover states

## API Reference

### `detectIdlePeriods(cursorData, interactionData, totalDurationMs, config)`
Detects idle periods in a recording.

```typescript
interface IdlePeriod {
  startMs: number;
  endMs: number;
  durationMs: number;
  reason: 'no-movement' | 'no-interaction';
}
```

### `generateAutoZoomKeyframes(existingZooms, cursorData, interactionData, totalDurationMs, config)`
Generates zoom keyframes for all idle periods.

Returns: `ZoomKeyframe[]` - Original zooms + auto-generated zoom keyframes

### Configuration Interface
```typescript
interface AutoZoomConfig {
  enabled: boolean;
  minIdleDurationMs?: number;      // 500-5000ms
  minCursorMovement?: number;       // 0.005-0.1
  zoomOutLevel?: number;            // 1.0-2.0x
  transitionDurationMs?: number;    // 100-2000ms
}
```

## Performance Impact

- **Detection**: O(n) where n = cursor + interaction data points
- **Keyframe generation**: O(m) where m = idle periods
- **Rendering**: No additional overhead (uses existing zoom filter)
- **Memory**: ~100 bytes per idle period detected

For a 30-minute recording with 10 idle periods: < 1KB memory impact, render time unchanged.
