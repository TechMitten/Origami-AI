# Origami AI Chrome Extension

This extension now uses Chrome tab capture for Origami AI browser recordings, captures real in-page browser interactions, and lets you start and stop browser-tab recordings from the extension icon.

## What it does

- Captures cursor movement inside browser tabs
- Captures click, keypress, and scroll interaction points
- Arms recording from the app, then starts capture when you click the extension on the tab you want to record
- Lets you stop an active recording by clicking the extension icon
- Returns those events to the app when recording stops
- Lets the app generate zoom, pan, and cursor-follow effects from real tab activity instead of only from the app tab

## Install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder:
   `chrome-extension/`

## Use

1. Open the Origami AI app
2. Start a screen recording from the app
3. Switch to the browser tab you want to record
4. Click the Origami extension icon to start recording that tab
5. Interact with the tab normally
6. Stop recording either in the app or by clicking the extension icon again

If the extension is installed, the app will automatically prefer extension telemetry over the local fallback event capture.

## Current limitations

- Browser tabs only
- Protected pages such as `chrome://` pages are not supported
- Native desktop apps and OS windows can still be recorded visually, but they do not provide browser-style DOM telemetry through this extension
- Reload the unpacked extension after pulling these changes so the new `tabCapture` permission and action-click flow are applied
