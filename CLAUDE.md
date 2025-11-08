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
  hideOnAirAnime: boolean;
  restoreClassicVideoLayout: boolean;
  enableDarkMode: boolean;
}

export const DEFAULT_SETTINGS: BetterNiconicoSettings = {
  hidePremiumSection: true,
  hideOnAirAnime: true,
  restoreClassicVideoLayout: false,
  enableDarkMode: false,
};

export const STORAGE_KEY = 'betterNiconicoSettings';
```

**Settings Flow**:
1. Settings are stored in `chrome.storage.sync` (synced across devices)
2. Popup UI reads/writes settings when user toggles features
3. Content script listens to `chrome.storage.onChanged` and re-applies all features
4. Settings changes trigger immediate re-application via `applySettings()`
5. Each feature module's `apply()` function is called with the current setting value

### Content Script Pattern & Modular Architecture

The content script (`src/content/index.ts`) uses this pattern:

1. **Initialization**: Load settings and apply on page load
2. **MutationObserver**: Re-apply settings when DOM changes (Niconico loads content dynamically)
3. **Storage Listener**: Re-apply settings when user changes them in popup
4. **Modular Features**: Each feature is a separate module in `src/content/features/`

**Feature Module Pattern** (`src/content/features/*.ts`):
```typescript
/**
 * Each feature module exports an apply(enabled: boolean) function
 * This keeps features isolated and maintainable
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    // Enable the feature
  } else {
    // Disable the feature
  }
}
```

**Main Content Script** imports and applies all features:
```typescript
import * as hidePremiumSection from './features/hidePremiumSection';
import * as hideOnAirAnime from './features/hideOnAirAnime';
import * as restoreClassicVideoLayout from './features/restoreClassicVideoLayout';
import * as darkMode from './features/darkMode';

async function applySettings(): Promise<void> {
  const settings = await loadSettings();
  darkMode.apply(settings.enableDarkMode);
  hidePremiumSection.apply(settings.hidePremiumSection);
  hideOnAirAnime.apply(settings.hideOnAirAnime);
  restoreClassicVideoLayout.apply(settings.restoreClassicVideoLayout);
}
```

### Adding New Features

To add a new feature:

1. **Create feature module** (`src/content/features/myNewFeature.ts`):
   ```typescript
   export function apply(enabled: boolean): void {
     if (enabled) {
       // Enable feature logic
       const element = document.querySelector('.TargetSelector');
       if (element) {
         (element as HTMLElement).style.display = 'none';
       }
     } else {
       // Disable feature logic
       const element = document.querySelector('.TargetSelector');
       if (element) {
         (element as HTMLElement).style.display = '';
       }
     }
   }
   ```

2. **Add setting to types** (`src/types/settings.ts`):
   ```typescript
   export interface BetterNiconicoSettings {
     hidePremiumSection: boolean;
     myNewFeature: boolean; // Add here
   }

   export const DEFAULT_SETTINGS = {
     hidePremiumSection: true,
     myNewFeature: false, // Add default
   };
   ```

3. **Import and apply in content script** (`src/content/index.ts`):
   ```typescript
   import * as myNewFeature from './features/myNewFeature';

   async function applySettings(): Promise<void> {
     const settings = await loadSettings();
     // ... existing features
     myNewFeature.apply(settings.myNewFeature);
   }
   ```

4. **Add UI toggle** (`src/popup/popup.html`):
   - Copy existing `.setting-item` div
   - Update checkbox `id` and labels

5. **Add popup logic** (`src/popup/popup.ts`):
   - Update `updateUI()` to set checkbox state
   - Update `getSettingsFromUI()` to read checkbox state
   - Add event listener for the new checkbox

### Page-Specific Features

Some features only apply to specific pages. Use the following pattern:

```typescript
/**
 * Check if the current page is a watch page
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

export function apply(enabled: boolean): void {
  // For features that only work on specific pages
  if (!isWatchPage()) {
    // Clean up if feature was previously enabled
    disableFeature();
    return;
  }

  // Apply feature only on target pages
  if (enabled) {
    enableFeature();
  } else {
    disableFeature();
  }
}
```

**Current page-specific features**:
- `restoreClassicVideoLayout`: Only on `/watch/*` pages
- `darkMode`: Only on `/watch/*` pages
- `hidePremiumSection`, `hideOnAirAnime`: Primarily on video_top page, but check for target elements on all pages

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

### CRITICAL: CSS Handling in Manifest

**DO NOT** manually add `"css"` entries to `manifest.json` in the `content_scripts` section. The @crxjs/vite-plugin automatically handles CSS injection when `injectCss: true` is set in `vite.config.ts` (line 26).

If you manually add CSS paths like `"css": ["src/content/index.css"]`, the build will fail because the source path doesn't exist in the `dist/` folder. The plugin automatically compiles CSS to `assets/*.css` and injects the correct path during build.

**Correct pattern** (in manifest.json):
```json
"content_scripts": [{
  "matches": ["*://*.nicovideo.jp/*"],
  "js": ["src/content/index.ts"],
  "run_at": "document_end"
  // No "css" array needed - handled by @crxjs/vite-plugin
}]
```

## Build System Details

- **Development**: Nodemon watches `src/`, config files, and manifests, rebuilds on changes
  - When files change, nodemon runs `vite build --mode development`
  - Extension auto-reloads in Chrome (requires initial manual load)
  - Check `nodemon.json` for watched files and ignored patterns
- **Production**: Minified, no sourcemaps, custom plugin removes dev-only icons
- **Icon Generation**: `generate-icons.js` converts `public/icons/icon.svg` to PNG sizes (16, 32, 48, 128) using @resvg/resvg-js
- **Custom Plugin** (`custom-vite-plugins.ts`): Strips dev icons from production builds

### Icon Design Guidelines

The extension icon (`public/icons/icon.svg`) follows this design:
- **Black gradient background** - Matches Niconico brand colors (#1a1a1a to #000000)
- **White smile face** - Niconico's iconic symbol
- **Red plus badge** - Indicates "Better" (improvement) over standard Niconico
- Generate all sizes with `npm run generate-icons` after editing SVG

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
5. For development mode (`npm run dev`):
   - Changes auto-rebuild via nodemon
   - Click the reload icon in `chrome://extensions/` to see updates
   - Or use Chrome Extension Reloader for automatic refresh

## Typical Development Workflow

1. **Start development server**: `npm run dev`
2. **Make changes** to feature files in `src/content/features/`
3. **Reload extension** in Chrome (click reload icon in chrome://extensions/)
4. **Test on target pages**:
   - Watch page: https://www.nicovideo.jp/watch/sm9
   - Video top page: https://www.nicovideo.jp/video_top
5. **Check console** for `[Better Niconico]` logs and errors
6. **Lint before commit**: `npm run lint:strict`

**Troubleshooting**:
- If extension doesn't load: Check `dist/manifest.json` exists and is valid
- If changes don't appear: Hard reload the page (Ctrl+Shift+R) after reloading extension
- If features conflict: Check console for excessive logging (indicates idempotency issues)
- If build fails: Run `npm run clean` then `npm run build`

## Current Features

### 1. Hide Premium Section
**Location**: `src/content/features/hidePremiumSection.ts`
- Hides `.TagPushVideosContainer` ("プレミアム会員なら動画が見放題！" section)
- Uses `.closest('.BaseLayout-block')` to hide parent container including `.Separator` border
- **Safeguards**: Validates content contains "プレミアム" or "見放題" before hiding
- **Idempotent**: Uses `data-bn-premium-hidden` marker to prevent redundant operations
- Default: **ON**

### 2. Hide On-Air Anime Section
**Location**: `src/content/features/hideOnAirAnime.ts`
- Hides `.OnTvAnimeVideosContainer` ("TV放送中のアニメ" section)
- Uses `.closest('.BaseLayout-block')` to hide parent container including `.Separator` border
- **Safeguards**: Validates content contains "TV放送中" or "アニメ" before hiding
- **Idempotent**: Uses `data-bn-anime-hidden` marker to prevent redundant operations
- Default: **ON**

### 3. Restore Classic Video Layout
**Location**: `src/content/features/restoreClassicVideoLayout.ts`
- Moves video information (title, tags, uploader) above the video player
- **Keeps at bottom**: "動画の詳細情報" section and everything below it (including parent/child works, advertisements, and recommendation shelves) remain below the player
- **Implementation approach**:
  - Identifies the "動画の詳細情報" (video detail info) section using h1 heading text matching
  - Creates new grid container `#bn-bottom-sections` with `grid-area: bn-bottom`
  - Moves the detail info section and all subsequent elements into this container
  - Removes Tailwind's `grid-tr_`, `grid-template-areas_`, and `grid-tc_` classes to prevent conflicts
  - **Sidebar height constraint**: Sets `max-height: calc(100vh - 80px)`, `overflow-y: auto`, `position: sticky`, and `top: 80px` on sidebar to prevent it from forcing massive grid row heights
  - Modifies CSS Grid's `grid-template-areas` to: `'"bottom sidebar" "player sidebar" "bn-bottom sidebar"'`
  - Sets `grid-template-rows: 'auto auto auto'` (NOT `min-content` - see critical note below)
  - Sets `align-items: start` on parent and `align-self: start` on grid items
- **Cleanup**: When disabled, moves sections back to original container, restores Tailwind classes, resets all styles, and removes created elements
- **CRITICAL**: The sidebar spans all 3 rows and is ~5460px tall. Without `max-height`, it dominates grid row sizing. Using `min-content` causes each row to become massive (1600-1900px) creating huge gaps above and below the player. The `auto` + `max-height` solution allows proper layout.
- **IMPORTANT**: Niconico uses CSS Grid with `grid-template-areas`, so DOM element reordering alone does not affect visual layout
- **Idempotent**: Uses `data-bn-layout` marker to prevent redundant operations
- Only active on `/watch/*` pages
- Default: **OFF**

### 4. Dark Mode
**Location**: `src/content/features/darkMode.ts` and `src/content/styles/darkMode.css`
- Transforms Niconico's UI into a dark color scheme on video watch pages
- **Implementation**: Overrides Niconico's 330+ CSS variables by adding `bn-dark-mode` class to `<html>` element
- **CSS Architecture**: Uses CSS variable cascading to override official design tokens
  - Inverts monotone colors (l0 ↔ l100, l5 ↔ l95, etc.)
  - Inverts transparent white/gray alpha values
  - Adjusts layer backgrounds, text colors, icons, and UI elements
  - Preserves brand colors (Niconico logo, premium gold, etc.)
- **Color Palette**: Dark background (hsl(0 0% 8%)) with inverted lightness values
- **Visual Enhancements**:
  - Custom scrollbar styling for dark theme
  - Slight image opacity reduction (0.95) for eye comfort, except video thumbnails
  - Enhanced shadows for better depth perception
- **Idempotent**: Checks for class existence before adding/removing
- **Page-Specific Behavior**: Only active on `/watch/*` pages
  - Uses `isWatchPage()` to check `window.location.pathname`
  - Automatically disabled on other pages (video_top, etc.) regardless of user setting
- **CSS Variables Overridden**:
  - Monotone colors (15 variables)
  - Transparent colors (17 variables)
  - Layer/background colors (30 variables)
  - Text colors (27 variables)
  - Action/button colors (25 variables)
  - Icon colors (19 variables)
  - Borders, forms, tooltips, tabs, shadows
- Default: **OFF**

## Implementation Notes

### DOM Manipulation Best Practices

**IMPORTANT**: When hiding sections on video_top page:
- **DO NOT** hide elements directly (e.g., `.TagPushVideosContainer`, `.OnTvAnimeVideosContainer`)
- **ALWAYS** use `.closest('.BaseLayout-block')` to hide the parent container
- **WHY**: Each section has a `.Separator` element (border) inside the parent `.BaseLayout-block`. If you hide only the content container, the separator remains visible, creating a visual bug.

```typescript
// ❌ WRONG - leaves separator visible
const container = document.querySelector('.TagPushVideosContainer');
container.style.display = 'none';

// ✅ CORRECT - hides entire block including separator
const container = document.querySelector('.TagPushVideosContainer');
const parentBlock = container.closest('.BaseLayout-block');
parentBlock.style.display = 'none';
```

**Watch Page Layout Structure**:
- `.grid-area_[player]` - Video player container
- `.grid-area_[bottom]` - Video information (title, tags, uploader info)
- `.grid-area_[sidebar]` - Right sidebar (recommendations, comments)
- **Parent uses CSS Grid with `grid-template-areas`**

**CRITICAL - CSS Grid Architecture**:
Niconico's watch page uses CSS Grid's `grid-template-areas` property to control layout. This means:
- **DOM element order does not affect visual layout** - Grid items are positioned by their `grid-area` CSS property
- To change layout, modify the parent's `grid-template-areas` property, not DOM order
- Default: `'"player sidebar" "bottom sidebar" "bottom sidebar"'`
- Classic layout (implemented by extension): `'"bottom sidebar" "player sidebar" "bn-bottom sidebar"'`
  - `bottom`: Video info (title, tags, uploader) - moved to top
  - `player`: Video player - middle
  - `bn-bottom`: Parent/child works and ads - kept at bottom (custom grid area created by extension)

**CSS Class Escaping**:
When selecting classes with special characters (like brackets), escape them in `querySelector`:
```typescript
// Class: .grid-area_[player]
document.querySelector('.grid-area_\\[player\\]')
```

**Advanced DOM Manipulation for Layout Changes**:

For complex layout modifications that require moving elements between containers:

1. **Create managed containers** with unique IDs and marker attributes:
   ```typescript
   const CONTAINER_ID = 'bn-custom-container';
   const CONTAINER_MARKER = 'data-bn-custom';

   let container = document.getElementById(CONTAINER_ID);
   if (!container) {
     container = document.createElement('div');
     container.id = CONTAINER_ID;
     container.setAttribute(CONTAINER_MARKER, 'true');
     container.style.gridArea = 'custom-area'; // Set grid area
     parent.appendChild(container);
   }
   ```

2. **Move elements safely** by checking parent before moving:
   ```typescript
   const section = getSectionElement();
   if (section && section.parentElement === sourceContainer) {
     targetContainer.appendChild(section); // Moves the element
   }
   ```

3. **Clean up properly** when feature is disabled:
   ```typescript
   const container = document.getElementById(CONTAINER_ID);
   if (container) {
     // Move all children back to original location
     while (container.firstChild) {
       originalContainer.appendChild(container.firstChild);
     }
     // Remove the created container
     container.remove();
   }
   ```

4. **Update grid layout** to accommodate new areas:
   ```typescript
   parent.style.gridTemplateAreas = '"area1 sidebar" "area2 sidebar" "custom-area sidebar"';
   parent.style.gridTemplateRows = 'auto auto auto';
   parent.style.alignItems = 'start';

   // If sidebar spans multiple rows, constrain its height
   const sidebar = document.querySelector('.grid-area_\\[sidebar\\]');
   if (sidebar) {
     sidebar.style.maxHeight = 'calc(100vh - 80px)';
     sidebar.style.overflowY = 'auto';
     sidebar.style.position = 'sticky';
     sidebar.style.top = '80px';
   }
   ```

**Why this matters**: Complex features like `restoreClassicVideoLayout` need to move some elements but not others. Creating intermediate containers with CSS Grid areas allows precise control over layout without affecting DOM structure outside the feature's scope.

**CSS Grid Row Sizing Pitfall**:

When working with CSS Grid layouts, especially with items that span multiple rows:

1. **The Problem**: If a grid item (like `.grid-area_[sidebar]`) spans all rows and has large content (~5460px), it will dominate the row sizing calculation. Using `grid-template-rows: min-content min-content min-content` causes each row to expand to accommodate the spanning item, creating massive rows (1600-1900px each) even when individual items are much smaller.

2. **The Solution**:
   - Use `grid-template-rows: auto auto auto` instead of `min-content`
   - Constrain the spanning item with `max-height` and `overflow-y: auto`
   - Use `position: sticky` for better UX (keeps sidebar visible while scrolling)
   - Set `align-items: start` on the grid container and `align-self: start` on grid items

3. **Why This Works**: By constraining the sidebar's height and using `auto` for row sizing, the grid rows size based on their direct children rather than the spanning sidebar. This prevents unwanted whitespace above/below content.

4. **Tailwind Class Conflicts**: Niconico uses Tailwind's arbitrary value classes like `grid-tr_[min-content_min-content_1fr]`. These can conflict with inline styles. When modifying grid properties, remove the conflicting Tailwind classes first, then apply inline styles.

### Idempotency and MutationObserver Considerations

**CRITICAL**: Since the content script uses MutationObserver to handle dynamic content, all feature `apply()` functions **MUST be idempotent** (safe to call multiple times).

**Best Practices**:
1. **Check current state before modifying DOM**
   ```typescript
   // ✅ GOOD - Check if already in desired state
   if (element.style.display === 'none') {
     return; // Already hidden, do nothing
   }
   element.style.display = 'none';
   ```

2. **Use marker attributes to track processing**
   ```typescript
   const MARKER = 'data-bn-processed';

   if (element.getAttribute(MARKER) === 'true') {
     return; // Already processed
   }
   element.style.display = 'none';
   element.setAttribute(MARKER, 'true');
   ```

3. **Verify CSS state before modifying styles**
   ```typescript
   // For layout features that modify CSS
   const parent = element.parentElement as HTMLElement;

   if (parent.style.gridTemplateAreas === desiredLayout) {
     return; // Already in desired layout
   }
   parent.style.gridTemplateAreas = desiredLayout;
   ```

4. **Add content validation for safety (but avoid excessive logging)**
   ```typescript
   // When hiding elements, verify it's the intended target
   const textContent = element.textContent || '';
   if (!textContent.includes('ExpectedKeyword')) {
     // Silently skip - content may not be loaded yet due to MutationObserver timing
     // Avoid console.warn() here as it creates noise during dynamic content loading
     return; // Don't hide unintended elements
   }
   ```

**Why This Matters**:
- MutationObserver triggers on every DOM change
- Without idempotency checks, features may cause infinite loops or performance issues
- Features may undo each other if they modify the same elements

### Debugging and Testing

**Chrome DevTools Console**:
- All features log their actions with `[Better Niconico]` prefix
- Check console for warnings about validation failures
- Monitor for excessive log spam (indicates non-idempotent code)

**Testing Strategy**:
1. Test with extension on a fresh page load
2. Test toggling settings on/off multiple times
3. Test on pages with dynamic content loading (scroll, click tabs)
4. Check that unrelated sections remain unaffected

**Common Issues**:
- If a feature "stops working", check if MutationObserver is triggering too frequently
- If wrong elements are hidden, add content validation checks
- If layout features cause flickering, ensure idempotency
- If you see massive whitespace above/below the video player when using `restoreClassicVideoLayout`, check:
  - Grid template rows should be `auto auto auto`, not `min-content`
  - Sidebar should have `max-height` constraint
  - Tailwind grid classes (`grid-tr_`, `grid-template-areas_`, `grid-tc_`) should be removed before applying inline styles

### General Notes

- **MutationObserver**: Essential for Niconico because content loads dynamically. Observer watches for new DOM nodes and re-applies settings.
- **Chrome Storage Sync**: Settings sync across devices where user is logged into Chrome
- **Error Handling**: Always check `chrome.runtime.lastError` in Chrome API callbacks
- **Typing**: Avoid `any`, use `unknown` or proper types. Import types from `vite` when needed (e.g., `NormalizedOutputOptions`)
