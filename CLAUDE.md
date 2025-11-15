# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Better Niconico is a Chrome Extension (Manifest V3) that improves the layout and UI of Niconico Video (nicovideo.jp). Inspired by [Calm Twitter](https://github.com/yusukesaitoh/calm-twitter) and [Refined GitHub](https://github.com/refined-github/refined-github), it allows users to individually toggle features on/off through a settings UI.

Built with TypeScript, Vite, and @crxjs/vite-plugin. The extension targets **only** nicovideo.jp domains.

## Quick Start

```bash
# Development mode with hot reload
npm run dev

# Production build
npm run build

# Linting
npm run lint              # Silent mode
npm run lint:strict       # Fail on warnings
npm run lint:fix          # Auto-fix issues
```

### Loading the Extension

1. Run `npm run build` or `npm run dev`
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/` directory
5. For dev mode: changes auto-rebuild, click reload icon in chrome://extensions/

## Architecture Overview

The extension has three main components:

1. **Background Service Worker** (`src/background/index.ts`) - Handles extension lifecycle, monitors tabs
2. **Content Script** (`src/content/index.ts`) - Injected into nicovideo.jp pages, applies UI modifications
3. **Popup UI** (`src/popup/`) - Settings interface with toggle switches

### Key Patterns

- **Modular Features**: Each feature is a separate module in `src/content/features/`
- **Settings System**: Centrally defined in `src/types/settings.ts`, stored in `chrome.storage.sync`
- **Feature Pattern**: Each module exports `apply(enabled: boolean)` function
- **Dynamic Content**: Uses MutationObserver to handle Niconico's dynamic page loading
- **Error Handling**: Result types (neverthrow) instead of exceptions - **NEVER throw errors**
- **Storage Utilities**: `src/utils/storage.ts` provides Result-based wrappers for Chrome Storage API

## Documentation

Detailed documentation is organized by topic:

- **[Architecture](docs/architecture.md)** - Extension components, settings system, build configuration
- **[Features](docs/features.md)** - All 8 features with implementation details
- **[Development](docs/development.md)** - Workflow, debugging, testing, commands reference
- **[Implementation Guide](docs/implementation.md)** - Adding features, best practices, patterns

## Current Features

1. **Hide Premium Section** - Hides premium membership promotion
2. **Hide On-Air Anime** - Hides TV anime section
3. **Restore Classic Video Layout** - Moves video info above player
4. **Video Upscaling** - AI-powered video upscaling using WebGPU
5. **Add Nico Rank Button** - Adds nico-rank.com link to sidebar
6. **Square Profile Icons** - Changes circular icons to rounded squares
7. **Hide Supporter Button** - Hides creator support prompts
8. **Hide Nico Ads** - Hides "ニコニ広告" section below video player

See [docs/features.md](docs/features.md) for detailed implementation notes.

## Adding a New Feature

Quick overview (see [docs/implementation.md](docs/implementation.md) for details):

1. Create feature module in `src/content/features/myFeature.ts`
2. Add setting to `src/types/settings.ts`
3. Import and apply in `src/content/index.ts`
4. Add UI toggle to `src/popup/popup.html`
5. Add popup logic to `src/popup/popup.ts`

## Key Technologies

- **TypeScript** (strict mode, path aliases configured)
- **Vite** + **@crxjs/vite-plugin** (build system with HMR)
- **Nodemon** (auto-rebuild on file changes)
- **Oxlint** (fast Rust-based linter)
- **neverthrow** (Result type for error handling)
- **Anime4K-WebGPU** (video upscaling library)

## Error Handling Architecture

This project uses **neverthrow** for type-safe error handling with Result types.

### Core Principles

1. **NEVER throw exceptions** - Use `Result<T, E>` instead
2. **Explicit error types** - Domain-specific errors in `src/types/errors.ts`
3. **Type-safe propagation** - All failure paths visible in function signatures

### Error Types (`src/types/errors.ts`)

- `StorageError` - Chrome Storage API failures
- `WebGPUError` - WebGPU initialization/rendering errors
- `VideoError` - Video element detection/processing errors
- `PageError` - DOM element not found errors
- `MessageError` - Message passing errors

### Result Pattern Examples

**Storage operations:**
```typescript
import { loadSettings, saveSettings } from '../utils/storage';

const result = await loadSettings();
if (result.isErr()) {
  console.error('Failed to load settings:', result.error);
  // Use default settings
  return;
}
const settings = result.value;
```

**Error propagation:**
```typescript
function processVideo(): Result<HTMLCanvasElement, VideoError> {
  const canvasResult = createCanvas(video);
  if (canvasResult.isErr()) {
    return err(canvasResult.error);
  }
  return ok(canvasResult.value);
}
```

**When adding new async operations**, wrap them with `ResultAsync` or return `Result<T, E>`.

## anime4k-webgpu Integration Notes

**CRITICAL**: The `render()` function from anime4k-webgpu does **NOT** support `signal` parameter for AbortController.

```typescript
// ✅ CORRECT - No signal parameter
await render({
  video,
  canvas,
  pipelineBuilder: (device, inputTexture) => [
    new ModeA({
      device,
      inputTexture,
      nativeDimensions: { width: video.videoWidth, height: video.videoHeight },
      targetDimensions: { width: canvas.width, height: canvas.height },
    }),
  ],
});

// ❌ WRONG - signal is ignored
await render({ ..., signal: controller.signal }); // Does nothing!
```

**Stopping the render loop**: Remove the canvas element with `canvas.remove()`. The `requestVideoFrameCallback` loop will stop automatically when the canvas is gone.

## Testing Limitation

Claude Code cannot test Chrome extensions in its MCP browser. After making changes:
1. Run `npm run build` (or keep `npm run dev` running)
2. Reload extension in `chrome://extensions/`
3. Refresh nicovideo.jp page
4. Verify changes manually

## Support

For detailed guides on specific topics, see the documentation links above.
