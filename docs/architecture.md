# Architecture

This document describes the technical architecture of the Better Niconico extension.

## Extension Components

**Target Site**: `*://*.nicovideo.jp/*` (all Niconico domains)

The extension has three main components:

### 1. Background Service Worker

**File**: `src/background/index.ts`

- Runs in the background
- Handles extension lifecycle events (install/update)
- Monitors tab updates for nicovideo.jp pages
- Cannot access DOM

### 2. Content Script

**File**: `src/content/index.ts`

- Injected into nicovideo.jp pages
- Has access to page DOM
- Applies UI modifications based on user settings
- Uses **MutationObserver** to handle dynamically loaded content
- Listens for settings changes via `chrome.storage.onChanged`

### 3. Popup UI

**Directory**: `src/popup/`

- Popup displayed when clicking extension icon
- Modern dark theme design with categorized tabs
- Tab navigation: 動画 (Video) | UI/表示 (UI/Display) | システム (System)
- Card-based layout with feature icons and descriptions
- Reads and writes settings to `chrome.storage.sync`
- Settings changes are immediately reflected on active pages

#### Design System

- **Color Scheme**: Dark theme with CSS custom properties
  - Background: `#0f0f0f` (primary), `#1a1a1a` (secondary), `#252525` (tertiary)
  - Accent: `#0099e5` (Niconico blue) with gradient support
  - Text: White/gray hierarchy for readability
- **Layout**: Fixed dimensions (360x520px) with scrollable content area
- **Components**:
  - Header: Logo icon, title, version badge, tab navigation
  - Settings container: Scrollable card grid per category
  - Footer: Status message, GitHub link
- **Interactions**: Smooth transitions, hover effects, toggle switches

#### Implementation Pattern

The popup uses a category-based architecture (`src/popup/popup.ts`):

```typescript
type SettingCategory = 'video' | 'ui' | 'system';

interface SettingConfig {
  id: keyof BetterNiconicoSettings;
  label: string;
  description: string;
  category: SettingCategory;
  icon?: string; // SVG path data
}

const SETTINGS_CONFIG: SettingConfig[] = [
  {
    id: 'enableVideoUpscaling',
    label: '動画アップスケーリング',
    description: 'Anime4K-WebGPUを使用して動画を高画質化します',
    category: 'video',
    icon: 'M15 10l4.553...' // SVG path
  },
  // ...
];
```

- **Dynamic rendering**: Settings cards generated from `SETTINGS_CONFIG` array
- **Tab filtering**: Shows only settings matching active tab category
- **Icon support**: Heroicons-style SVG icons (20x20px stroke)
- **Instant persistence**: Changes auto-save to `chrome.storage.sync`

## Settings System Architecture

Settings are centrally defined in `src/types/settings.ts` using **Zod schema validation**:

```typescript
import { z } from 'zod';

// Zod schema defines both validation rules and default values
export const BetterNiconicoSettingsSchema = z.object({
  hidePremiumSection: z.boolean().default(true),
  hideOnAirAnime: z.boolean().default(true),
  restoreClassicVideoLayout: z.boolean().default(false),
  enableVideoUpscaling: z.boolean().default(false),
  showNicoRankButton: z.boolean().default(true),
  squareProfileIcons: z.boolean().default(false),
  hideSupporterButton: z.boolean().default(false),
  hideNicoAds: z.boolean().default(false),
  enablePictureInPicture: z.boolean().default(false),
  enableVideoScreenshot: z.boolean().default(false),
  enableAllegationAssist: z.boolean().default(false),
  allegationTemplates: z.array(AllegationTemplateSchema).default([]),
});

// TypeScript type is inferred from schema (single source of truth)
export type BetterNiconicoSettings = z.infer<typeof BetterNiconicoSettingsSchema>;

export const DEFAULT_SETTINGS: BetterNiconicoSettings = {
  // ... defaults match schema
};

export const STORAGE_KEY = 'betterNiconicoSettings';
```

### Settings Validation

**Runtime validation with Zod ensures data integrity:**

- All settings loaded from `chrome.storage.sync` are validated against the schema
- Invalid or corrupt data triggers fallback to `DEFAULT_SETTINGS`
- Missing fields are automatically filled with schema defaults
- Type safety is guaranteed at both compile-time (TypeScript) and runtime (Zod)

**Benefits:**

1. **Backward compatibility**: Old settings without new fields automatically get defaults
2. **Forward compatibility**: Extra fields are ignored during parsing
3. **Type safety**: TypeScript type is always in sync with Zod schema
4. **Error reporting**: Detailed validation errors help debug storage issues

### Settings Flow

1. Settings are stored in `chrome.storage.sync` (synced across devices)
2. Popup UI reads/writes settings when user toggles features
3. Content script listens to `chrome.storage.onChanged` and re-applies all features
4. Settings changes trigger immediate re-application via `applySettings()`
5. Each feature module's `apply()` function is called with the current setting value

## Content Script Pattern & Modular Architecture

The content script (`src/content/index.ts`) uses this pattern:

1. **Initialization**: Load settings and apply on page load
2. **MutationObserver**: Re-apply settings when DOM changes (Niconico loads content dynamically)
3. **Storage Listener**: Re-apply settings when user changes them in popup
4. **Modular Features**: Each feature is a separate module in `src/content/features/`

### Feature Module Pattern

Each feature module in `src/content/features/*.ts` exports an `apply(enabled: boolean)` function:

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

### Main Content Script Integration

The main content script imports and applies all features:

```typescript
import * as hidePremiumSection from './features/hidePremiumSection';
import * as hideOnAirAnime from './features/hideOnAirAnime';
import * as restoreClassicVideoLayout from './features/restoreClassicVideoLayout';
import * as videoUpscaling from './features/videoUpscaling';
import * as addNicoRankButton from './features/addNicoRankButton';
import * as squareProfileIcons from './features/squareProfileIcons';
import * as hideSupporterButton from './features/hideSupporterButton';
import * as hideNicoAds from './features/hideNicoAds';
import * as pictureInPicture from './features/pictureInPicture';
import * as allegationAssist from './features/allegationAssist';

async function applySettings(): Promise<void> {
  const settings = await loadSettings();
  hidePremiumSection.apply(settings.hidePremiumSection);
  hideOnAirAnime.apply(settings.hideOnAirAnime);
  restoreClassicVideoLayout.apply(settings.restoreClassicVideoLayout);
  videoUpscaling.apply(settings.enableVideoUpscaling);
  addNicoRankButton.apply(settings.showNicoRankButton);
  squareProfileIcons.apply(settings.squareProfileIcons);
  hideSupporterButton.apply(settings.hideSupporterButton);
  hideNicoAds.apply(settings.hideNicoAds);
  pictureInPicture.apply(settings.enablePictureInPicture);
  void allegationAssist.apply(settings.enableAllegationAssist);
}
```

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

## Dependencies

### Runtime Dependencies

| Package          | Version | Purpose                                         | Size Impact |
| ---------------- | ------- | ----------------------------------------------- | ----------- |
| `anime4k-webgpu` | ^1.0.0  | AI-powered video upscaling                      | ~3.4MB      |
| `neverthrow`     | ^8.2.0  | Type-safe Result types for error handling       | ~10KB       |
| `zod`            | ^4.1.12 | TypeScript-first schema validation for settings | ~2KB        |

**Total runtime bundle size**: ~3.42MB

**Notes**:

- `anime4k-webgpu` contributes most to bundle size (contains WebGPU shaders and CNN/GAN neural network weights)
- Video upscaling is opt-in (default OFF) to minimize impact on users who don't need it
- Zod adds minimal overhead (2KB) for comprehensive validation

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `@crxjs/vite-plugin` | Chrome extension development and HMR |
| `vite` | Build tool and dev server |
| `typescript` | Type checking and compilation |
| `oxlint` | Fast Rust-based linting |
| `nodemon` | Auto-rebuild on file changes |
| `@resvg/resvg-js` | SVG to PNG icon generation |
| `vite-tsconfig-paths` | TypeScript path alias resolution |

### Bundle Size Considerations

The content script bundle includes:

1. **Anime4K-WebGPU** (~100KB)
   - Required for video upscaling feature
   - Only active when user enables upscaling

**Mitigation strategies**:
- Feature is default OFF (user opt-in)
- Future: Consider code splitting with dynamic imports
