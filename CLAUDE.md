# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Better Niconico is a Chrome Extension (Manifest V3) that improves the layout and UI of Niconico Video (nicovideo.jp). Inspired by [Calm Twitter](https://github.com/yusukesaitoh/calm-twitter) and [Refined GitHub](https://github.com/refined-github/refined-github), it allows users to individually toggle features on/off through a settings UI.

Built with TypeScript, Vite, and @crxjs/vite-plugin. The extension targets **only** nicovideo.jp domains.

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
```

## Architecture

### Extension Components

**Target Site**: `*://*.nicovideo.jp/*` (all Niconico domains)

The extension has three main components:

1. **Background Service Worker** (`src/background/index.ts`)
   - Runs in the background
   - Handles extension lifecycle events (install/update)
   - Monitors tab updates for nicovideo.jp pages
   - Cannot access DOM

2. **Content Script** (`src/content/index.ts`)
   - Injected into nicovideo.jp pages
   - Has access to page DOM
   - Applies UI modifications based on user settings
   - Uses **MutationObserver** to handle dynamically loaded content
   - Listens for settings changes via `chrome.storage.onChanged`

3. **Popup UI** (`src/popup/`)
   - Popup displayed when clicking extension icon
   - Beautiful gradient design with toggle switches
   - Reads and writes settings to `chrome.storage.sync`
   - Settings changes are immediately reflected on active pages

### Settings System Architecture

Settings are centrally defined in `src/types/settings.ts`:

```typescript
export interface BetterNiconicoSettings {
  hidePremiumSection: boolean;
  // Add new features here
}

export const DEFAULT_SETTINGS: BetterNiconicoSettings = {
  hidePremiumSection: true,
};

export const STORAGE_KEY = 'betterNiconicoSettings';
```

**Settings Flow**:
1. Settings are stored in `chrome.storage.sync` (synced across devices)
2. Popup UI reads/writes settings when user toggles features
3. Content script listens to `chrome.storage.onChanged` and re-applies modifications
4. Settings changes trigger immediate re-application via `applySettings()`

### Content Script Pattern

The content script (`src/content/index.ts`) uses this pattern:

1. **Initialization**: Load settings and apply on page load
2. **MutationObserver**: Re-apply settings when DOM changes (Niconico loads content dynamically)
3. **Storage Listener**: Re-apply settings when user changes them in popup
4. **Modular Functions**: Each feature has its own show/hide functions

Example feature implementation:
```typescript
function hidePremiumSection(): void {
  const element = document.querySelector('.TagPushVideosContainer');
  if (element) {
    (element as HTMLElement).style.display = 'none';
  }
}

function showPremiumSection(): void {
  const element = document.querySelector('.TagPushVideosContainer');
  if (element) {
    (element as HTMLElement).style.display = '';
  }
}
```

### Adding New Features

To add a new feature:

1. **Add setting to types** (`src/types/settings.ts`):
   ```typescript
   export interface BetterNiconicoSettings {
     hidePremiumSection: boolean;
     newFeature: boolean; // Add here
   }

   export const DEFAULT_SETTINGS = {
     hidePremiumSection: true,
     newFeature: false, // Add default
   };
   ```

2. **Add UI toggle** (`src/popup/popup.html`):
   - Copy existing `.setting-item` div
   - Update checkbox `id` and labels

3. **Add popup logic** (`src/popup/popup.ts`):
   - Update `updateUI()` to set checkbox state
   - Update `getSettingsFromUI()` to read checkbox state

4. **Implement feature** (`src/content/index.ts`):
   - Create show/hide functions
   - Add logic to `applySettings()`

## TypeScript Configuration

- **Strict mode** enabled with `noUnusedLocals` and `noUnusedParameters`
- **Path aliases** configured:
  - `@/*` → `src/*`
  - `@content/*` → `src/content/*`
  - `@background/*` → `src/background/*`
- `vite-tsconfig-paths` plugin enables path alias resolution in Vite

## Manifest Configuration

- `manifest.json`: Base configuration
- `manifest.dev.json`: Development overrides (adds "[DEV]" suffix to name)
- `vite.config.ts` merges manifests and injects version from `package.json`
- **Permissions**: activeTab, storage, scripting
- **Host permissions**: `*://*.nicovideo.jp/*` (Niconico only)
- **Popup**: `src/popup/popup.html` (shown when clicking extension icon)

## Build System Details

- **Development**: Nodemon watches `src/`, config files, and manifests, rebuilds on changes
- **Production**: Minified, no sourcemaps, custom plugin removes dev-only icons
- **Icon Generation**: `generate-icons.js` converts `public/icons/icon.svg` to PNG sizes (16, 32, 48, 128) using @resvg/resvg-js
- **Custom Plugin** (`custom-vite-plugins.ts`): Strips dev icons from production builds

## Linting with Oxlint

Fast Rust-based linter configured in `.oxlintrc.json`:
- TypeScript plugin with `no-explicit-any` as error (use proper types or `unknown`)
- Floating promises detection (errors on unhandled promises)
- Console logging allowed (common in extensions)
- Side-effect imports allowed (CSS imports)

## Loading the Extension in Chrome

1. Run `npm run build` (production) or `npm run dev` (development)
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/` directory
5. For development, changes auto-rebuild and reload with nodemon

## Current Features

- **Hide Premium Section**: Removes `.TagPushVideosContainer` element (the "プレミアム会員なら動画が見放題！" section)
  - Default: ON
  - Toggleable via popup UI

## Implementation Notes

- **MutationObserver**: Essential for Niconico because content loads dynamically. Observer watches for new DOM nodes and re-applies settings.
- **Chrome Storage Sync**: Settings sync across devices where user is logged into Chrome
- **Error Handling**: Always check `chrome.runtime.lastError` in Chrome API callbacks
- **Typing**: Avoid `any`, use `unknown` or proper types. Import types from `vite` when needed (e.g., `NormalizedOutputOptions`)
