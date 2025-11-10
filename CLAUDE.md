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

# Clean build artifacts
npm run clean

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
  enableVideoUpscaling: boolean;
  showNicoRankButton: boolean;
  squareProfileIcons: boolean;
  hideSupporterButton: boolean;
}

export const DEFAULT_SETTINGS: BetterNiconicoSettings = {
  hidePremiumSection: true,
  hideOnAirAnime: true,
  restoreClassicVideoLayout: false,
  enableVideoUpscaling: false,
  showNicoRankButton: true,
  squareProfileIcons: false,
  hideSupporterButton: false,
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
import * as videoUpscaling from './features/videoUpscaling';
import * as addNicoRankButton from './features/addNicoRankButton';
import * as squareProfileIcons from './features/squareProfileIcons';
import * as hideSupporterButton from './features/hideSupporterButton';

async function applySettings(): Promise<void> {
  const settings = await loadSettings();
  hidePremiumSection.apply(settings.hidePremiumSection);
  hideOnAirAnime.apply(settings.hideOnAirAnime);
  restoreClassicVideoLayout.apply(settings.restoreClassicVideoLayout);
  videoUpscaling.apply(settings.enableVideoUpscaling);
  addNicoRankButton.apply(settings.showNicoRankButton);
  squareProfileIcons.apply(settings.squareProfileIcons);
  hideSupporterButton.apply(settings.hideSupporterButton);
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
- `videoUpscaling`: Only on `/watch/*` pages
- `addNicoRankButton`: Only on `/video_top` page
- `hidePremiumSection`, `hideOnAirAnime`: Primarily on video_top page, but check for target elements on all pages

**Global features** (apply to all pages):
- `squareProfileIcons`: CSS-based, affects all profile icons site-wide
- `hideSupporterButton`: CSS-based, hides supporter buttons and appeals on all pages

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
- **Permissions**: storage (for settings persistence)
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
**Reference**: Based on [niconico-classic](https://github.com/Bymnet1845/niconico-classic)

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
- **Fullscreen Mode Handling** (CRITICAL):
  - **Detection**: Uses Fullscreen API (`document.fullscreenElement`) as primary detection method, with DOM-based detection (`.grid-area_[player] > .w_[100dvw].h_[100dvh]` element) as fallback
  - **Event-driven approach**: Uses `fullscreenchange` event listener to reliably catch fullscreen transitions (MutationObserver alone is insufficient)
  - **When entering fullscreen**: Automatically reverts to default layout to prevent black screen bug
  - **During fullscreen**: Skips applying classic layout modifications to avoid breaking fullscreen video display
  - **After exiting fullscreen**: Automatically re-applies classic layout if setting is enabled (100ms delay for DOM updates)
  - **State management**: Maintains `currentEnabled` variable to track user settings across fullscreen transitions
  - **Listener setup**: `setupFullscreenListener()` is called once on first `apply()` call to register the event handler
- **Cleanup**: When disabled, moves sections back to original container, restores Tailwind classes, resets all styles, and removes created elements
- **CRITICAL**: The sidebar spans all 3 rows and is ~5460px tall. Without `max-height`, it dominates grid row sizing. Using `min-content` causes each row to become massive (1600-1900px) creating huge gaps above and below the player. The `auto` + `max-height` solution allows proper layout.
- **IMPORTANT**: Niconico uses CSS Grid with `grid-template-areas`, so DOM element reordering alone does not affect visual layout
- **Idempotent**: Uses `data-bn-layout` marker to prevent redundant operations
- Only active on `/watch/*` pages
- Default: **OFF**

### 4. Video Upscaling
**Location**: `src/content/features/videoUpscaling.ts`
**Library**: [Anime4K-WebGPU](https://github.com/Anime4KWebBoost/Anime4K-WebGPU) (NPM: `anime4k-webgpu`)
- Real-time video upscaling using WebGPU compute shaders for anime content
- Upscales video from native resolution to 2x using AI-powered enhancement
- **Requirements**: WebGPU-compatible browser (Chrome 113+, Edge 113+)
- **Performance**: ~3ms per frame on modern GPUs (RTX 3070Ti/4090) for 720p input
- Only active on `/watch/*` pages
- Default: **OFF**

**CRITICAL Implementation Details**:

1. **Niconico's Video Player Structure**:
   - Player contains **3 video elements**:
     - **Main content video** (blob: URL) - the actual video to upscale
     - **Ad video** (inside `#nv_watch_VideoAdContainer`) - must exclude
     - **Placeholder video** (empty, no src) - must exclude
   - Videos are `position: absolute` inside nested aspect-ratio containers
   - Main content video may not appear until ads finish playing

2. **Video Element Detection**:
   ```typescript
   function isAdVideo(video: HTMLVideoElement): boolean {
     const adContainer = document.getElementById('nv_watch_VideoAdContainer');
     return adContainer?.contains(video) ?? false;
   }

   function isValidContentVideo(video: HTMLVideoElement): boolean {
     return (
       video.src !== '' &&
       video.videoWidth > 0 &&
       video.videoHeight > 0 &&
       !isAdVideo(video)
     );
   }
   ```
   - **NEVER** use `document.querySelector('video')` - it may select ad/placeholder
   - **ALWAYS** validate video has src, dimensions, and is not in ad container

3. **Canvas Positioning**:
   - Canvas must **exactly** replace video visually
   - Copy **all** computed styles from video element:
   ```typescript
   canvas.style.cssText = `
     position: ${computedStyle.position};
     top: ${computedStyle.top};
     left: ${computedStyle.left};
     right: ${computedStyle.right};
     bottom: ${computedStyle.bottom};
     width: ${computedStyle.width};
     height: ${computedStyle.height};
     object-fit: ${computedStyle.objectFit};
     transform: ${computedStyle.transform};
     z-index: ${computedStyle.zIndex};
   `;
   ```
   - Insert canvas as video's next sibling in same parent
   - Canvas className should match video's className

4. **Anime4K-WebGPU API Usage**:
   ```typescript
   import { render, ModeA } from 'anime4k-webgpu';

   await render({
     video,
     canvas,
     pipelineBuilder: (device, inputTexture) => {
       return [
         new ModeA({
           device,
           inputTexture,
           nativeDimensions: { width: video.videoWidth, height: video.videoHeight },
           targetDimensions: { width: canvas.width, height: canvas.height },
         }),
       ];
     },
     signal: abortController.signal, // For cleanup
   });
   ```
   - `render()` function automatically:
     - Waits for video `HAVE_FUTURE_DATA` state
     - Sets up WebGPU render pipeline
     - Starts render loop using `requestVideoFrameCallback`
     - Copies video frames to canvas continuously
   - **DO NOT** manually implement render loop
   - **DO NOT** wait for `loadeddata` event (render() handles it)
   - Use `AbortController.signal` for clean cleanup

5. **Preset Modes**:
   - **ModeA** (used by default): Clamp Highlights → Restore (CNNVL) → Upscale (CNNx2VL/CNNx2M)
   - **ModeB**: Clamp Highlights → Upscale (CNNx2M) → Auto Downscale
   - **ModeC**: Denoise (Bilateral Mean) → Upscale (CNNx2VL) → Sharpen (Deblur)
   - Can chain custom pipelines: `CNNx2UL` (upscale) → `GANUUL` (restore)

6. **Cleanup Requirements**:
   ```typescript
   function cleanupUpscaling() {
     // 1. Abort render loop
     abortController?.abort();

     // 2. Remove canvas
     canvas?.remove();

     // 3. Restore video display
     video.style.display = '';

     // 4. Clear all video markers
     videos.forEach(v => v.setAttribute(UPSCALING_MARKER, UPSCALING_INACTIVE));
   }
   ```
   - AbortController stops the render loop
   - Canvas must be removed from DOM
   - Video display must be restored
   - All marker attributes must be cleared

7. **WebGPU Support Detection**:
   ```typescript
   if (!navigator.gpu) {
     console.error('WebGPU not supported');
     return;
   }

   const adapter = await navigator.gpu.requestAdapter();
   if (!adapter) {
     console.error('WebGPU adapter not available');
     return;
   }
   ```
   - Cache WebGPU support check (expensive operation)
   - Show user-friendly error if not supported
   - **Minimum**: Chrome/Edge 113+, requires GPU with WebGPU support

8. **Bundle Size**:
   - Anime4K-WebGPU adds **~3.4 MB** to bundle (minified)
   - Contains WebGPU shaders and CNN/GAN neural network weights
   - This is expected and necessary for AI upscaling

**Idempotency**:
- Uses `data-bn-upscaling="active"` marker on video element
- Checks marker before starting upscaling
- Prevents duplicate canvas creation
- Safe to call `apply(true)` multiple times

**Error Handling**:
- Gracefully handles AbortError (normal cleanup, don't log)
- Logs other errors and cleans up canvas/video state
- Continues working if video changes (page navigation, playlist)

**Reference**:
- [Anime4K-WebGPU GitHub](https://github.com/Anime4KWebBoost/Anime4K-WebGPU)
- [NPM Package](https://www.npmjs.com/package/anime4k-webgpu)
- [Web Demo](https://anime4k-webgpu-demo.fly.dev/)

### 5. Add Nico Rank Button
**Location**: `src/content/features/addNicoRankButton.ts`
- Adds a "ニコラン" button to the left sidebar on video_top page
- Links to https://nico-rank.com/ (external anime ranking aggregator)
- **Custom Icon**: Uses inline SVG podium icon (1st, 2nd, 3rd place) matching Niconico's icon style
- **Implementation details**:
  - Finds "ランキング" link in sidebar using `.css-1i9dz1a` selector
  - Creates identical menu item structure using same CSS classes
  - Inserts button immediately after the ranking link's parent element
  - Handles both expanded (`.css-1i3qj3a`) and collapsed (`.css-gzpr6t`) sidebar states
- **Idempotent**: Uses `data-bn-nico-rank-button` marker on link and `data-bn-nico-rank-container` marker on container
- **Cleanup**: Removes all buttons and containers when disabled
- Only active on `/video_top` page
- Default: **ON**

**Why this feature exists**: nico-rank.com aggregates rankings from multiple sources and provides a cleaner UI for discovering popular anime content on Niconico.

### 6. Square Profile Icons
**Location**: `src/content/features/squareProfileIcons.ts`
**Reference**: Based on [niconico-classic](https://github.com/Bymnet1845/niconico-classic)
- Changes profile icons from circular to rounded square (border-radius: 4px)
- **Implementation approach**: CSS-based using body class toggle
  - Adds/removes `.bn-square-icons` class on `<body>` element
  - CSS rules target icons when body has this class
- **Comprehensive Coverage**: The CSS (`src/content/index.css`) targets icons across **all Niconico services**:
  - **Header icons**: Common header profile icons
  - **Video pages**: Content icons with `.bdr_full` class, uses `--radii-m` variable for consistency
  - **Generic images**: All img elements with usericon/channel-icon URLs (class-agnostic)
  - **Niconico Seiga** (静画): Community pages, timeline, user pages, work pages
  - **Creator Support Tool**: Registration and tool pages
  - **Niconico Garage**: Common and individual pages
  - **Niconico Channel**: Common and subscription pages
  - **Niconico Live** (生放送): Follow, history, search, top, and watch pages with program cards
  - **Niconico Solid** (立体): Work pages with Vue.js data attributes
  - **Point/Subscription pages**: User icons in various contexts
  - **Search pages**: Uploader icons in search results
- **Selector Strategy**:
  - Primary: `.bdr_full[src^="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/"]` and channel icon variants
  - Fallback: Generic `img[src*="nicoaccount/usericon/"]` for class-agnostic matching
  - Page-specific: CSS module classes like `.___program-provider-icon___bSlNt` for Niconico Live
  - Vue components: `[data-v-*]` attribute selectors for Seiga/Solid pages
- **CSS implementation** (`src/content/index.css`):
  ```css
  body.bn-square-icons {
    --bn-icon-border-radius: 4px;
  }

  /* Header icons */
  body.bn-square-icons .nico-CommonHeaderRoot .common-header-1hpqfmt,
  body.bn-square-icons .nico-CommonHeaderRoot .common-header-ws8uen,
  /* ... additional header selectors ... */

  /* Content icons with .bdr_full class */
  body.bn-square-icons .bdr_full[src^="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/"],
  body.bn-square-icons .bdr_full[src^="https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/"] {
    border-radius: var(--bn-icon-border-radius) !important;
  }

  /* Generic fallback (class-agnostic) */
  body.bn-square-icons img[src*="nicoaccount/usericon/"],
  body.bn-square-icons img[src*="comch/channel-icon/"] {
    border-radius: var(--bn-icon-border-radius) !important;
  }

  /* Page-specific selectors for Seiga, Live, Channel, etc. */
  /* ... 100+ additional selectors for comprehensive coverage ... */
  ```
- **Idempotent**: Safe to call multiple times (checks for class existence)
- **Performance**: Very efficient - single class toggle, no DOM iteration
- **Scope**: Applies to all pages across all Niconico services
- Default: **OFF**

**Why CSS-based approach**:
- No DOM iteration required (high performance)
- Automatically applies to dynamically loaded icons
- Easy to enable/disable (single class toggle)
- Consistent with niconico-classic implementation pattern

**Implementation Notes**:
- When adding support for new Niconico pages, inspect the page's icon elements and add the appropriate CSS selectors to `src/content/index.css`
- Use browser DevTools to identify icon class names and URL patterns
- Test across multiple Niconico services (video, live, seiga, channel) to ensure comprehensive coverage
- The `--radii-m` CSS variable is used on video pages for consistency with Niconico's design system

### 7. Hide Supporter Button
**Location**: `src/content/features/hideSupporterButton.ts`
**Reference**: Based on [niconico-peppermint-extension](https://github.com/castella-cake/niconico-peppermint-extension)
- Hides "サポート" (Support) button and supporter appeal messages on watch pages
- **Implementation approach**: CSS-based using body class toggle
  - Adds/removes `.bn-hide-supporter` class on `<body>` element
  - CSS rules hide supporter-related elements when body has this class
- **Comprehensive Coverage**: The CSS (`src/content/index.css`) targets:
  - **Current Niconico**: `a[href*="creator-support.nicovideo.jp"]` - Main supporter button link
  - **Legacy support**: `.NC-CreatorSupportAccepting` - Older class name (backward compatibility)
  - **Appeal containers**: `.CreatorSupportAppealContainer` - Supporter recruitment banners
- **CSS implementation** (`src/content/index.css`):
  ```css
  body.bn-hide-supporter {
    /* 現在のニコニコ動画: creator-support.nicovideo.jpへのリンク */
    a[href*="creator-support.nicovideo.jp"] {
      display: none !important;
    }

    /* 旧バージョン: NC-CreatorSupportAccepting クラス（後方互換性） */
    .NC-CreatorSupportAccepting {
      display: none !important;
    }

    /* サポーター勧誘コンテナ */
    .CreatorSupportAppealContainer {
      display: none !important;
    }
  }
  ```
- **Idempotent**: Safe to call multiple times (checks for class existence)
- **Performance**: Very efficient - single class toggle, no DOM iteration
- **Scope**: Applies to all pages where supporter elements appear
- Default: **OFF**

**Why CSS-based approach**:
- No DOM iteration required (high performance)
- Automatically applies to dynamically loaded supporter elements
- Easy to enable/disable (single class toggle)
- Multiple selectors ensure coverage across different Niconico UI versions

**Why this feature exists**: Some users prefer a cleaner interface without creator support prompts. This feature provides that option while respecting user choice (default OFF).

## Implementation Notes

### CSS-Based vs DOM Manipulation Features

There are two main approaches for implementing features:

**1. CSS-Based Features** (Preferred for styling changes):
- Use body class toggle (e.g., `body.bn-square-icons`)
- Define CSS rules that apply when class is present
- **Advantages**:
  - Highest performance (no DOM iteration)
  - Automatically applies to dynamically loaded content
  - Simple to implement and maintain
  - Easy to debug (inspect body classes in DevTools)
- **When to use**: Visual styling changes, icon shapes, colors, layouts that can be controlled via CSS
- **Examples**: `squareProfileIcons`, `hideSupporterButton` features

```typescript
// Feature module
export function apply(enabled: boolean): void {
  if (enabled) {
    document.body.classList.add('bn-feature-class');
  } else {
    document.body.classList.remove('bn-feature-class');
  }
}
```

```css
/* CSS file */
body.bn-feature-class .target-selector {
  /* Your styles here */
}
```

**2. DOM Manipulation Features** (For structural changes):
- Query and modify DOM elements directly
- **Advantages**:
  - Can hide/show/move elements
  - Can inject new HTML elements
  - Full control over DOM structure
- **Disadvantages**:
  - More complex (requires idempotency checks)
  - May need MutationObserver awareness
  - Higher performance cost if iterating many elements
- **When to use**: Hiding sections, adding buttons, restructuring layout, injecting new elements
- **Examples**: `hidePremiumSection`, `addNicoRankButton`, `restoreClassicVideoLayout`

**Hybrid Approach**:
Some features use both approaches. For example, `restoreClassicVideoLayout` manipulates DOM to move elements but also modifies CSS Grid properties for layout.

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

**CRITICAL: MCP Chrome Testing Limitations**:
- Claude Code has access to a **plain Chrome browser via MCP tools** for automated testing
- This Chrome instance is a **dedicated, isolated environment** that **CANNOT load Chrome extensions**
- Extension injection into MCP Chrome is **technically impossible** - it's designed for automated testing only
- This MCP Chrome is **completely separate** from the user's regular Chrome browser
- The user **cannot inject extensions** into the MCP Chrome either
- **Only the user** can test the extension in their own Chrome browser (which Claude cannot access)
- Therefore, Claude **cannot verify** actual extension behavior, UI changes, or feature functionality
- Claude can only:
  - Read/analyze code and CSS
  - Make code changes based on user descriptions
  - Build the extension (`npm run build`)
  - View static snapshots/screenshots provided by the user
- **User must manually test** all changes in their own Chrome browser after:
  1. Running `npm run build` (or using `npm run dev` for auto-rebuild)
  2. Reloading the extension in `chrome://extensions/`
  3. Refreshing the target nicovideo.jp page

**Common Issues**:
- If a feature "stops working", check if MutationObserver is triggering too frequently
- If wrong elements are hidden, add content validation checks
- If layout features cause flickering, ensure idempotency
- If you see massive whitespace above/below the video player when using `restoreClassicVideoLayout`, check:
  - Grid template rows should be `auto auto auto`, not `min-content`
  - Sidebar should have `max-height` constraint
  - Tailwind grid classes (`grid-tr_`, `grid-template-areas_`, `grid-tc_`) should be removed before applying inline styles
- **If fullscreen video shows black screen with classic layout enabled**:
  - Verify `isFullscreenMode()` uses Fullscreen API (`document.fullscreenElement`) as primary detection
  - Ensure `setupFullscreenListener()` is properly registering `fullscreenchange` event listener
  - Check that `fullscreenchange` handler calls `restoreDefaultLayout()` when entering fullscreen
  - Confirm console logs show: `[Better Niconico] 全画面表示に入りました。レイアウトをデフォルトに戻します。`
  - After exiting fullscreen, verify logs show: `[Better Niconico] 全画面表示から抜けました。` and `[Better Niconico] クラシックレイアウトを再適用します。`
  - The event-driven approach is essential - MutationObserver alone cannot reliably catch fullscreen transitions
  - Reference: [niconico-classic](https://github.com/Bymnet1845/niconico-classic/blob/develop/style/video-common.css#L142-L156)

### General Notes

- **MutationObserver**: Essential for Niconico because content loads dynamically. Observer watches for new DOM nodes and re-applies settings. However, MutationObserver alone is **insufficient for all DOM changes** - some transitions (like fullscreen mode) require dedicated event listeners.
- **When to use event listeners vs MutationObserver**:
  - Use **event listeners** for: User-triggered state changes (fullscreen, resize, focus), browser API events, media events
  - Use **MutationObserver** for: Dynamic content loading, DOM element additions/removals by the site
  - Example: Fullscreen transitions require `fullscreenchange` event listener; MutationObserver cannot reliably detect the transition moment
- **Chrome Storage Sync**: Settings sync across devices where user is logged into Chrome
- **Error Handling**: Always check `chrome.runtime.lastError` in Chrome API callbacks
- **Typing**: Avoid `any`, use `unknown` or proper types. Import types from `vite` when needed (e.g., `NormalizedOutputOptions`)
