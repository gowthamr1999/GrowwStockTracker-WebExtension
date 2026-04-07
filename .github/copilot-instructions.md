# Project Guidelines

## Architecture
- This is a small **Chrome Extension (Manifest v3)** with no build step or backend.
- Core flow: `content.js` scrapes stock details from Groww pages and saves them to `chrome.storage.local`; `popup.js` reads that storage and renders the popup UI.
- Keep responsibilities separated:
  - `content.js`: page detection, DOM scraping, injected track button, storage writes
  - `popup.js`: popup rendering, refresh/delete/clear actions, storage reads/writes
  - `popup.html` / `popup.css`: UI structure and styling only
- See `README.md` for install and usage details.

## Code Style
- Use plain JavaScript, existing IIFE structure, and `'use strict'` in edited files.
- Match the current lightweight style: small helper functions, direct DOM APIs, minimal abstraction.
- Prefer clear comments only where page-scraping or Chrome API behavior is non-obvious.

## Build and Test
- There is **no npm/pnpm/yarn setup** and no automated test suite in this repo.
- Do not add package tooling unless explicitly requested.
- Verify changes manually by:
  1. Loading the folder as an unpacked extension in `chrome://extensions/`
  2. Reloading the extension after edits
  3. Testing on a Groww stock page and in the extension popup
- Use Chrome DevTools for debugging popup and content-script issues.

## Conventions
- Preserve compatibility with **Manifest v3** and the existing `chrome.*` extension APIs.
- Keep storage data under `trackedStocks` in `chrome.storage.local` unless a migration is intentionally added.
- When changing stock extraction logic, prefer resilient selectors and keep fallbacks because Groww DOM classes may change.
- Avoid introducing network calls or external services unless explicitly requested; the current extension stores data locally only.

## Pitfalls
- Groww page selectors are fragile; DOM changes can break extraction in `content.js`.
- The refresh flow in `popup.js` currently simulates price movement; do not describe it as a real market-data fetch unless that behavior is actually implemented.
- Changes to stored object shape should be backward-compatible with already saved browser data.
