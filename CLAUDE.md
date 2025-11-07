# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension Manifest V3 boilerplate built with TypeScript, Vite, and @crxjs/vite-plugin. The extension uses a background service worker and content scripts for web page interaction.

## Development Commands

```bash
# Development mode with hot reload (uses nodemon to watch files)
npm run dev

# Production build (includes icon generation)
npm run build

# Development build with watch mode
npm run preview

# Generate PNG icons from SVG source
npm run generate-icons

# Linting
npm run lint              # Silent mode
npm run lint:strict       # Fail on warnings
npm run lint:fix          # Auto-fix issues
npm run check:file        # Check specific file
```

## Architecture

### Extension Components

- **Background Service Worker** (`src/background/index.ts`): Runs in the background, handles extension lifecycle events, storage operations, and message routing. Cannot access DOM.
- **Content Script** (`src/content/index.ts`): Injected into web pages, has access to page DOM, communicates with background via message passing.

### Message Passing Pattern

Communication between background and content scripts uses typed messages:

```typescript
interface Message {
  action: string;
  data?: unknown;
}

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

- Background → Content: `chrome.tabs.sendMessage(tabId, message)`
- Content → Background: `chrome.runtime.sendMessage(message)`
- Use `return true` in listener to keep message channel open for async responses
- Always handle `chrome.runtime.lastError` for error checking

### Storage Utilities

Content script provides `getStorageData<T>()` and `setStorageData()` wrappers around `chrome.storage.local` with promise-based API and error handling.

### Restricted Pages Handling

Background service worker includes logic to detect and handle restricted pages (chrome://, edge://, about:, etc.) where content scripts cannot run. It attempts programmatic injection as a fallback when content script is not available.

## TypeScript Configuration

- **Strict mode** enabled with noUnusedLocals and noUnusedParameters
- **Path aliases** configured:
  - `@/*` → `src/*`
  - `@content/*` → `src/content/*`
  - `@background/*` → `src/background/*`
- `vite-tsconfig-paths` plugin enables path alias resolution in Vite

## Manifest Configuration

- `manifest.json`: Base configuration for both dev and production
- `manifest.dev.json`: Development overrides (adds "[DEV]" suffix to name)
- `vite.config.ts` merges manifests and injects version from package.json
- Permissions: activeTab, storage, scripting
- Host permissions: <all_urls>

## Build System Details

- **Development**: Nodemon watches `src/`, config files, and manifests, rebuilds on changes
- **Production**: Minified, no sourcemaps, custom plugin removes dev-only icons
- **Icon Generation**: `generate-icons.js` converts `public/icons/icon.svg` to PNG sizes (16, 32, 48, 128) using @resvg/resvg-js

## Linting with Oxlint

Fast Rust-based linter configured in `.oxlintrc.json`:
- TypeScript plugin with no-explicit-any as error
- Floating promises detection (errors on unhandled promises)
- Console logging allowed (common in extensions)
- Side-effect imports allowed (CSS imports)

## State Management

Content script uses `ExtensionState` class for managing feature toggle state. State persists via Chrome storage and survives page reloads.

## Loading the Extension in Chrome

1. Run `npm run dev` or `npm run build`
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/` directory
5. For development, changes auto-rebuild and reload with nodemon
