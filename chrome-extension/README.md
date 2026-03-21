# Origami AI Chrome Extension

This extension captures real in-page browser interactions and sends them back to the Origami AI app during screen recording.

## What it does

- Captures cursor movement inside browser tabs
- Captures click, keypress, and scroll interaction points
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
3. In Chrome's picker, choose the browser tab you want to record
4. Switch to that tab and interact with it normally
5. Stop recording back in the app

If the extension is installed, the app will automatically prefer extension telemetry over the local fallback event capture.

## Current limitations

- Browser tabs only
- Protected pages such as `chrome://` pages are not supported
- Native desktop apps and OS windows can still be recorded visually, but they do not provide browser-style DOM telemetry through this extension
