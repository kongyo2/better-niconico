# Development Guide

This document covers the development workflow, commands, debugging, and testing.

## Development Commands

### Primary Commands

```bash
# Development mode with hot reload (uses nodemon to watch files)
npm run dev

# Production build (includes icon generation)
npm run build

# Development build with watch mode
npm run preview
```

### Utility Commands

```bash
# Generate PNG icons from SVG source
npm run generate-icons

# Clean build artifacts
npm run clean
```

### Linting Commands

```bash
# Lint without output (silent mode)
npm run lint

# Lint with strict mode (fail on warnings)
npm run lint:strict

# Auto-fix linting issues
npm run lint:fix
```

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

## Debugging and Testing

### Chrome DevTools Console

- All features log their actions with `[Better Niconico]` prefix
- Check console for warnings about validation failures
- Monitor for excessive log spam (indicates non-idempotent code)

### Testing Strategy

1. Test with extension on a fresh page load
2. Test toggling settings on/off multiple times
3. Test on pages with dynamic content loading (scroll, click tabs)
4. Check that unrelated sections remain unaffected

### CRITICAL: MCP Chrome Testing Limitations

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

### Common Issues

- **Extension doesn't load**: Check `dist/manifest.json` exists and is valid
- **Changes don't appear**: Hard reload the page (Ctrl+Shift+R) after reloading extension
- **Features conflict**: Check console for excessive logging (indicates idempotency issues)
- **Build fails**: Run `npm run clean` then `npm run build`
- **Massive whitespace in classic layout**: Check grid template rows should be `auto auto auto`, not `min-content`. Sidebar should have `max-height` constraint. Tailwind grid classes (`grid-tr_`, `grid-template-areas_`, `grid-tc_`) should be removed before applying inline styles.
- **Fullscreen black screen with classic layout**:
  - Verify `isFullscreenMode()` uses Fullscreen API (`document.fullscreenElement`) as primary detection
  - Ensure `setupFullscreenListener()` is properly registering `fullscreenchange` event listener
  - Check that `fullscreenchange` handler calls `restoreDefaultLayout()` when entering fullscreen
  - Confirm console logs show: `[Better Niconico] 全画面表示に入りました。レイアウトをデフォルトに戻します。`
  - After exiting fullscreen, verify logs show: `[Better Niconico] 全画面表示から抜けました。` and `[Better Niconico] クラシックレイアウトを再適用します。`
  - The event-driven approach is essential - MutationObserver alone cannot reliably catch fullscreen transitions
  - Reference: [niconico-classic](https://github.com/Bymnet1845/niconico-classic/blob/develop/style/video-common.css#L142-L156)

## Build System Details

See [architecture.md](architecture.md#build-system-details) for detailed build system information.

## Icon Generation

The extension icon (`public/icons/icon.svg`) follows this design:
- **Black gradient background** - Matches Niconico brand colors (#1a1a1a to #000000)
- **White smile face** - Niconico's iconic symbol
- **Red plus badge** - Indicates "Better" (improvement) over standard Niconico

Generate all sizes with `npm run generate-icons` after editing SVG.

## General Development Notes

### MutationObserver

Essential for Niconico because content loads dynamically. Observer watches for new DOM nodes and re-applies settings. However, MutationObserver alone is **insufficient for all DOM changes** - some transitions (like fullscreen mode) require dedicated event listeners.

### Event Listeners vs MutationObserver

- Use **event listeners** for: User-triggered state changes (fullscreen, resize, focus), browser API events, media events
- Use **MutationObserver** for: Dynamic content loading, DOM element additions/removals by the site
- Example: Fullscreen transitions require `fullscreenchange` event listener; MutationObserver cannot reliably detect the transition moment

### Chrome Storage

- Settings sync across devices where user is logged into Chrome
- Always check `chrome.runtime.lastError` in Chrome API callbacks

### TypeScript

- Avoid `any`, use `unknown` or proper types
- Import types from `vite` when needed (e.g., `NormalizedOutputOptions`)
