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
- **[Features](docs/features.md)** - All 12 features with implementation details
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
9. **Picture-in-Picture** - Watch videos with comments in PiP mode
10. **Video Screenshot** - Capture current video frame with comments as PNG image
11. **Video Download** - Download videos using nicozon.net bookmarklet service
12. **Allegation Assist** - Template-based auto-fill for violation report forms

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
- **Prettier** (code formatter)
- **neverthrow** (Result type for error handling)
- **Zod** (TypeScript-first schema validation for settings)
- **Anime4K-WebGPU** (video upscaling library)

## Error Handling Architecture

This project uses **neverthrow** for type-safe error handling with Result types.

### Core Principles

1. **NEVER throw exceptions** - Use `Result<T, E>` instead
2. **Explicit error types** - Domain-specific errors in `src/types/errors.ts`
3. **Type-safe propagation** - All failure paths visible in function signatures

### Error Types (`src/types/errors.ts`)

- `StorageError` - Chrome Storage API failures
- `ValidationError` - Zod schema validation failures (settings data integrity)
- `WebGPUError` - WebGPU initialization/rendering errors
- `VideoError` - Video element detection/processing errors
- `PageError` - DOM element not found errors
- `MessageError` - Message passing errors
- `DownloadError` - Video download and encoding errors

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

## Settings Validation with Zod

This project uses **Zod** for runtime validation of settings loaded from `chrome.storage.sync`.

### Why Zod?

- **Runtime type safety**: Validates that stored data matches expected types
- **Schema-driven types**: TypeScript types are inferred from Zod schema (single source of truth)
- **Default values**: Automatically fills missing fields with defaults
- **Graceful degradation**: Falls back to default settings if validation fails
- **Bundle size**: Only 2KB gzipped, minimal overhead

### Schema Definition (`src/types/settings.ts`)

Settings schema is defined using Zod:

```typescript
import { z } from 'zod';

export const BetterNiconicoSettingsSchema = z.object({
  hidePremiumSection: z.boolean().default(true),
  hideOnAirAnime: z.boolean().default(true),
  // ... all settings with defaults
});

// Type is inferred from schema - always in sync
export type BetterNiconicoSettings = z.infer<typeof BetterNiconicoSettingsSchema>;
```

### Validation in Storage Utilities (`src/utils/storage.ts`)

Both `loadSettings()` and `saveSettings()` validate data:

```typescript
// Loading: validates data from chrome.storage
const parseResult = BetterNiconicoSettingsSchema.safeParse(rawSettings);
if (!parseResult.success) {
  // Falls back to DEFAULT_SETTINGS
  return err(validationFailedError('...', parseResult.error));
}

// Saving: prevents corrupt data from being stored
const parseResult = BetterNiconicoSettingsSchema.safeParse(settings);
if (!parseResult.success) {
  return err(validationFailedError('...', parseResult.error));
}
```

### Adding New Settings

When adding a new setting:

1. Add to Zod schema in `src/types/settings.ts` with `.default()` value
2. TypeScript type updates automatically via `z.infer`
3. Update `DEFAULT_SETTINGS` to match schema defaults
4. Validation and type checking work automatically

**IMPORTANT**: Always add `.default()` to new schema fields for backward compatibility.

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

## Video Download Integration Notes

The video download feature uses an external bookmarklet service (nicozon.net) for downloading videos.

### Implementation Approach

1. **Content Script** (`src/content/features/videoDownload.ts`):
   - Adds download button to player control bar
   - Sends download request to background script with video ID

2. **Background Script** (`src/background/index.ts`):
   - Opens `https://ext.nicovideo.jp/?{videoId}` in new tab
   - Injects nicozon.net bookmarklet script into the page (using `world: 'MAIN'` to bypass CSP)
   - Bookmarklet handles the actual download process

### Why External Service?

- Niconico's HLS streaming is complex and requires significant processing
- nicozon.net provides a reliable, maintained download solution
- Avoids bundling large libraries (FFmpeg.wasm ~24MB)
- No need for client-side video encoding

### Script Injection

Uses `chrome.scripting.executeScript` with `world: 'MAIN'` to inject the bookmarklet:

```typescript
chrome.scripting.executeScript({
  target: { tabId: newTab.id },
  world: 'MAIN', // Run in page context to bypass CSP
  func: () => {
    const script = document.createElement('script');
    script.setAttribute('charset', 'utf-8');
    script.src = 'https://www.nicozon.net/js/bookmarklet.js';
    document.body.appendChild(script);
  },
});
```

### Implementation Reference

Based on [NicoNicoDownloader-for-Firefox](https://github.com/iiiiiinnnnnnnn/NicoNicoDownloader-for-Firefox) with adaptations for Chrome Manifest V3.

## Testing Limitation

Claude Code cannot test Chrome extensions in its MCP browser. After making changes:
1. Run `npm run build` (or keep `npm run dev` running)
2. Reload extension in `chrome://extensions/`
3. Refresh nicovideo.jp page
4. Verify changes manually

## Support

For detailed guides on specific topics, see the documentation links above.

## Critical Operating Principles

- VERY IMPORTANT: Always think through a plan for every ask, and if it is more than a simple request, break it down and use TodoWrite tool to manage a todo list. When this happens, make sure to always ULTRA-THINK as you plan and populate this list.

- VERY IMPORTANT: If user has not provided enough clarity to CONFIDENTLY proceed, ask clarifying questions until you have a solid understanding of the task.

## Response Authenticity Guidelines

### Professional Communication Without Sycophancy

**CRITICAL**: Maintain professional, authentic communication. Avoid sycophantic language that undermines trust.

**NEVER use phrases like:**

- "You're absolutely right!"
- "That's a brilliant idea/observation!"
- "What an excellent point!"
- "I completely agree!"
- "That's exactly right!"

**INSTEAD, engage substantively:**

- Analyze the actual merit of ideas
- Point out trade-offs and considerations
- Provide honest technical assessment
- Disagree constructively when appropriate
- Focus on the code and problem, not praising the person

**Examples of appropriate responses:**

- "Let me analyze that approach..." (then actually analyze)
- "That has trade-offs to consider..." (then discuss them)
- "Here's what that would involve..." (then explain implications)
- "There might be issues with..." (then explain concerns)

**Remember:** You're a professional tool, not a cheerleader. Users value honest, direct feedback over empty agreement.

### Required Approach

**When requirements are vague:**

- Ask for specific details
- Implement only what you can make work
- Reduce scope to achievable functionality

## Implementation Philosophy

This section outlines the core implementation philosophy and guidelines for software development projects. It serves as a central reference for decision-making and development approach throughout the project.

### Core Philosophy

Embodies a Zen-like minimalism that values simplicity and clarity above all. This approach reflects:

- **Wabi-sabi philosophy**: Embracing simplicity and the essential. Each line serves a clear purpose without unnecessary embellishment.
- **Occam's Razor thinking**: The solution should be as simple as possible, but no simpler.
- **Trust in emergence**: Complex systems work best when built from simple, well-defined components that do one thing well.
- **Present-moment focus**: The code handles what's needed now rather than anticipating every possible future scenario.
- **Pragmatic trust**: The developer trusts external systems enough to interact with them directly, handling failures as they occur rather than assuming they'll happen.


This development philosophy values readable code, and belief that good architecture emerges from simplicity rather than being imposed through complexity.

### Core Design Principles

#### 1. Ruthless Simplicity

- **KISS principle taken to heart**: Keep everything as simple as possible, but no simpler
- **Minimize abstractions**: Every layer of abstraction must justify its existence
- **Start minimal, grow as needed**: Begin with the simplest implementation that meets current needs
- **Avoid future-proofing**: Don't build for hypothetical future requirements
- **Question everything**: Regularly challenge complexity in the codebase

#### Error Handling

- Handle common errors robustly

#### Problem Analysis Before Implementation

When tackling complex problems or new features, follow the "Analyze First, Don't Code" pattern:

##### The Pattern

1. **Initial Analysis Phase**

   - When given a complex task, FIRST respond with: "Let me analyze this problem before implementing"
   - Break down the problem into components
   - Identify potential challenges and edge cases
   - Consider multiple implementation approaches
   - Map out dependencies and impacts

2. **Structured Analysis Output**
   Before writing any code, provide:

   - **Problem decomposition**: Break complex problems into smaller, manageable pieces
   - **Approach options**: List 2-3 different ways to solve the problem
   - **Trade-offs**: Clearly state pros/cons of each approach
   - **Recommendation**: Choose the best approach with justification
   - **Implementation plan**: Step-by-step plan for the chosen approach

3. **Benefits of Analysis-First**
   - Prevents premature implementation that might need major refactoring
   - Identifies blockers and dependencies early
   - Results in cleaner, more maintainable code
   - Reduces the likelihood of missing requirements

   ### Remember

- It's easier to add complexity later than to remove it
- Code you don't write has no bugs
- Favor clarity over cleverness
- The best code is often the simplest

This philosophy section serves as the foundational guide for all implementation decisions in the project.