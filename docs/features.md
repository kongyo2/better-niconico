# Features

This document describes all features implemented in Better Niconico, with detailed implementation notes.

## Feature Overview

| Feature | Location | Type | Default |
|---------|----------|------|---------|
| Hide Premium Section | `src/content/features/hidePremiumSection.ts` | DOM | ON |
| Hide On-Air Anime | `src/content/features/hideOnAirAnime.ts` | DOM | ON |
| Restore Classic Layout | `src/content/features/restoreClassicVideoLayout.ts` | DOM/CSS | OFF |
| Video Upscaling | `src/content/features/videoUpscaling.ts` | Canvas | OFF |
| Nico Rank Button | `src/content/features/addNicoRankButton.ts` | DOM | ON |
| Square Profile Icons | `src/content/features/squareProfileIcons.ts` | CSS | OFF |
| Hide Supporter Button | `src/content/features/hideSupporterButton.ts` | CSS | OFF |
| Hide Nico Ads | `src/content/features/hideNicoAds.ts` | DOM | OFF |

---

## 1. Hide Premium Section

**Location**: `src/content/features/hidePremiumSection.ts`
**Default**: ON

### Description

Hides the `.TagPushVideosContainer` ("プレミアム会員なら動画が見放題！" section) on video_top page.

### Implementation

- Uses `.closest('.BaseLayout-block')` to hide parent container including `.Separator` border
- **Safeguards**: Validates content contains "プレミアム" or "見放題" before hiding
- **Idempotent**: Uses `data-bn-premium-hidden` marker to prevent redundant operations

---

## 2. Hide On-Air Anime Section

**Location**: `src/content/features/hideOnAirAnime.ts`
**Default**: ON

### Description

Hides the `.OnTvAnimeVideosContainer` ("TV放送中のアニメ" section) on video_top page.

### Implementation

- Uses `.closest('.BaseLayout-block')` to hide parent container including `.Separator` border
- **Safeguards**: Validates content contains "TV放送中" or "アニメ" before hiding
- **Idempotent**: Uses `data-bn-anime-hidden` marker to prevent redundant operations

---

## 3. Restore Classic Video Layout

**Location**: `src/content/features/restoreClassicVideoLayout.ts`
**Reference**: Based on [niconico-classic](https://github.com/Bymnet1845/niconico-classic)
**Default**: OFF
**Page**: `/watch/*` only

### Description

Moves video information (title, tags, uploader) above the video player, restoring the classic Niconico layout.

**Keeps at bottom**: "動画の詳細情報" section and everything below it (including parent/child works, advertisements, and recommendation shelves) remain below the player.

### Implementation Approach

- Identifies the "動画の詳細情報" (video detail info) section using h1 heading text matching
- Creates new grid container `#bn-bottom-sections` with `grid-area: bn-bottom`
- Moves the detail info section and all subsequent elements into this container
- Removes Tailwind's `grid-tr_`, `grid-template-areas_`, and `grid-tc_` classes to prevent conflicts
- **Sidebar height constraint**: Sets `max-height: calc(100vh - 80px)`, `overflow-y: auto`, `position: sticky`, and `top: 80px` on sidebar to prevent it from forcing massive grid row heights
- Modifies CSS Grid's `grid-template-areas` to: `'"bottom sidebar" "player sidebar" "bn-bottom sidebar"'`
- Sets `grid-template-rows: 'auto auto auto'` (NOT `min-content` - see critical note below)
- Sets `align-items: start` on parent and `align-self: start` on grid items

### Fullscreen Mode Handling (CRITICAL)

- **Detection**: Uses Fullscreen API (`document.fullscreenElement`) as primary detection method, with DOM-based detection (`.grid-area_[player] > .w_[100dvw].h_[100dvh]` element) as fallback
- **Event-driven approach**: Uses `fullscreenchange` event listener to reliably catch fullscreen transitions (MutationObserver alone is insufficient)
- **When entering fullscreen**: Automatically reverts to default layout to prevent black screen bug
- **During fullscreen**: Skips applying classic layout modifications to avoid breaking fullscreen video display
- **After exiting fullscreen**: Automatically re-applies classic layout if setting is enabled (100ms delay for DOM updates)
- **State management**: Maintains `currentEnabled` variable to track user settings across fullscreen transitions
- **Listener setup**: `setupFullscreenListener()` is called once on first `apply()` call to register the event handler

### Cleanup

When disabled, moves sections back to original container, restores Tailwind classes, resets all styles, and removes created elements.

### Critical Notes

- **CRITICAL**: The sidebar spans all 3 rows and is ~5460px tall. Without `max-height`, it dominates grid row sizing. Using `min-content` causes each row to become massive (1600-1900px) creating huge gaps above and below the player. The `auto` + `max-height` solution allows proper layout.
- **IMPORTANT**: Niconico uses CSS Grid with `grid-template-areas`, so DOM element reordering alone does not affect visual layout
- **Idempotent**: Uses `data-bn-layout` marker to prevent redundant operations

---

## 4. Video Upscaling

**Location**: `src/content/features/videoUpscaling.ts`
**Library**: [Anime4K-WebGPU](https://github.com/Anime4KWebBoost/Anime4K-WebGPU) (NPM: `anime4k-webgpu`)
**Default**: OFF
**Page**: `/watch/*` only

### Description

Real-time video upscaling using WebGPU compute shaders for anime content. Upscales video from native resolution to 2x using AI-powered enhancement.

### Requirements

- **Browser**: WebGPU-compatible browser (Chrome 113+, Edge 113+)
- **Performance**: ~3ms per frame on modern GPUs (RTX 3070Ti/4090) for 720p input

### CRITICAL Implementation Details

#### 1. Niconico's Video Player Structure

Player contains **3 video elements**:
- **Main content video** (blob: URL) - the actual video to upscale
- **Ad video** (inside `#nv_watch_VideoAdContainer`) - must exclude
- **Placeholder video** (empty, no src) - must exclude

Videos are `position: absolute` inside nested aspect-ratio containers. Main content video may not appear until ads finish playing.

#### 2. Video Element Detection

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

#### 3. Canvas Positioning

Canvas must **exactly** replace video visually. Copy **all** computed styles from video element:

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

#### 4. Anime4K-WebGPU API Usage

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

The `render()` function automatically:
- Waits for video `HAVE_FUTURE_DATA` state
- Sets up WebGPU render pipeline
- Starts render loop using `requestVideoFrameCallback`
- Copies video frames to canvas continuously

**DO NOT** manually implement render loop or wait for `loadeddata` event (render() handles it). Use `AbortController.signal` for clean cleanup.

#### 5. Preset Modes

- **ModeA** (used by default): Clamp Highlights → Restore (CNNVL) → Upscale (CNNx2VL/CNNx2M)
- **ModeB**: Clamp Highlights → Upscale (CNNx2M) → Auto Downscale
- **ModeC**: Denoise (Bilateral Mean) → Upscale (CNNx2VL) → Sharpen (Deblur)
- Can chain custom pipelines: `CNNx2UL` (upscale) → `GANUUL` (restore)

#### 6. Cleanup Requirements

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

AbortController stops the render loop, canvas must be removed from DOM, video display must be restored, and all marker attributes must be cleared.

#### 7. WebGPU Support Detection

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

#### 8. Bundle Size

- Anime4K-WebGPU adds **~3.4 MB** to bundle (minified)
- Contains WebGPU shaders and CNN/GAN neural network weights
- This is expected and necessary for AI upscaling

### Idempotency

- Uses `data-bn-upscaling="active"` marker on video element
- Checks marker before starting upscaling
- Prevents duplicate canvas creation
- Safe to call `apply(true)` multiple times

### Error Handling

- Gracefully handles AbortError (normal cleanup, don't log)
- Logs other errors and cleans up canvas/video state
- Continues working if video changes (page navigation, playlist)

### References

- [Anime4K-WebGPU GitHub](https://github.com/Anime4KWebBoost/Anime4K-WebGPU)
- [NPM Package](https://www.npmjs.com/package/anime4k-webgpu)
- [Web Demo](https://anime4k-webgpu-demo.fly.dev/)

---

## 5. Add Nico Rank Button

**Location**: `src/content/features/addNicoRankButton.ts`
**Default**: ON
**Page**: `/video_top` only

### Description

Adds a "ニコラン" button to the left sidebar on video_top page, linking to https://nico-rank.com/ (external anime ranking aggregator).

### Implementation Details

- **Custom Icon**: Uses inline SVG podium icon (1st, 2nd, 3rd place) matching Niconico's icon style
- Finds "ランキング" link in sidebar using `.css-1i9dz1a` selector
- Creates identical menu item structure using same CSS classes
- Inserts button immediately after the ranking link's parent element
- Handles both expanded (`.css-1i3qj3a`) and collapsed (`.css-gzpr6t`) sidebar states

### Idempotency

- Uses `data-bn-nico-rank-button` marker on link
- Uses `data-bn-nico-rank-container` marker on container

### Cleanup

Removes all buttons and containers when disabled.

### Why This Feature Exists

nico-rank.com aggregates rankings from multiple sources and provides a cleaner UI for discovering popular anime content on Niconico.

---

## 6. Square Profile Icons

**Location**: `src/content/features/squareProfileIcons.ts`
**Reference**: Based on [niconico-classic](https://github.com/Bymnet1845/niconico-classic)
**Default**: OFF
**Scope**: All Niconico pages

### Description

Changes profile icons from circular to rounded square (border-radius: 4px).

### Implementation Approach

**CSS-based using body class toggle**:
- Adds/removes `.bn-square-icons` class on `<body>` element
- CSS rules target icons when body has this class

### Comprehensive Coverage

The CSS (`src/content/index.css`) targets icons across **all Niconico services**:
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

### Selector Strategy

- Primary: `.bdr_full[src^="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/"]` and channel icon variants
- Fallback: Generic `img[src*="nicoaccount/usericon/"]` for class-agnostic matching
- Page-specific: CSS module classes like `.___program-provider-icon___bSlNt` for Niconico Live
- Vue components: `[data-v-*]` attribute selectors for Seiga/Solid pages

### CSS Implementation

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

### Properties

- **Idempotent**: Safe to call multiple times (checks for class existence)
- **Performance**: Very efficient - single class toggle, no DOM iteration
- **Scope**: Applies to all pages across all Niconico services

### Why CSS-based Approach

- No DOM iteration required (high performance)
- Automatically applies to dynamically loaded icons
- Easy to enable/disable (single class toggle)
- Consistent with niconico-classic implementation pattern

### Implementation Notes

- When adding support for new Niconico pages, inspect the page's icon elements and add the appropriate CSS selectors to `src/content/index.css`
- Use browser DevTools to identify icon class names and URL patterns
- Test across multiple Niconico services (video, live, seiga, channel) to ensure comprehensive coverage
- The `--radii-m` CSS variable is used on video pages for consistency with Niconico's design system

---

## 7. Hide Supporter Button

**Location**: `src/content/features/hideSupporterButton.ts`
**Reference**: Based on [niconico-peppermint-extension](https://github.com/castella-cake/niconico-peppermint-extension)
**Default**: OFF
**Scope**: All pages with supporter elements

### Description

Hides "サポート" (Support) button and supporter appeal messages on watch pages.

### Implementation Approach

**CSS-based using body class toggle**:
- Adds/removes `.bn-hide-supporter` class on `<body>` element
- CSS rules hide supporter-related elements when body has this class

### Comprehensive Coverage

The CSS (`src/content/index.css`) targets:
- **Current Niconico**: `a[href*="creator-support.nicovideo.jp"]` - Main supporter button link
- **Legacy support**: `.NC-CreatorSupportAccepting` - Older class name (backward compatibility)
- **Appeal containers**: `.CreatorSupportAppealContainer` - Supporter recruitment banners

### CSS Implementation

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

### Properties

- **Idempotent**: Safe to call multiple times (checks for class existence)
- **Performance**: Very efficient - single class toggle, no DOM iteration
- **Scope**: Applies to all pages where supporter elements appear

### Why CSS-based Approach

- No DOM iteration required (high performance)
- Automatically applies to dynamically loaded supporter elements
- Easy to enable/disable (single class toggle)
- Multiple selectors ensure coverage across different Niconico UI versions

### Why This Feature Exists

Some users prefer a cleaner interface without creator support prompts. This feature provides that option while respecting user choice (default OFF).

---

## 8. Hide Nico Ads

**Location**: `src/content/features/hideNicoAds.ts`
**Default**: OFF
**Page**: `/watch/*` only

### Description

Hides the "ニコニ広告" (Nico Ads) section displayed below the video player. This section shows user-sponsored advertisements for other videos.

### Implementation Approach

**DOM manipulation using h1 heading detection**:
- Finds h1 elements containing "ニコニ広告" text
- Hides the closest parent `<section>` element
- Works with both default and classic video layouts

### Implementation Details

The feature searches for the "ニコニ広告" heading and hides the entire section container:

```typescript
function findNicoAdSection(): HTMLElement | null {
  const headings = document.querySelectorAll('h1');
  for (const heading of headings) {
    const text = heading.textContent || '';
    if (text.includes('ニコニ広告')) {
      const section = heading.closest('section');
      if (section) {
        return section as HTMLElement;
      }
    }
  }
  return null;
}
```

### Safeguards

- **Content validation**: Verifies section contains "ニコニ広告" text before hiding
- **Graceful handling**: Silently skips if content not yet loaded (no console warnings)

### Idempotency

- Uses `data-bn-nicoad-hidden` marker attribute
- Checks current display state before modifying
- Safe to call multiple times via MutationObserver

### Cleanup

When disabled, restores original display state and removes marker attribute.

### Watch Page Structure

On watch pages, the Nico Ads section appears in the `.grid-area_[bottom]` container:
- Default layout: Below "動画の詳細情報" section
- Classic layout: Below "この動画の親作品・子作品" section (in `#bn-bottom-sections` area)

The section uses these CSS classes:
```
section.bg-c_layer\.surfaceHighEm.bdr_m.ov_hidden.w_100%.p_x3
```

### Why This Feature Exists

The Nico Ads section displays sponsored video advertisements that some users find distracting. This feature provides a cleaner viewing experience while maintaining the option to view sponsored content (default OFF).

---

## Page-Specific Features

Some features only apply to specific pages:

**Watch page only** (`/watch/*`):
- Restore Classic Video Layout
- Video Upscaling
- Hide Nico Ads

**Video top page only** (`/video_top`):
- Add Nico Rank Button

**Primarily video_top** (but check for elements on all pages):
- Hide Premium Section
- Hide On-Air Anime

**Global features** (all pages):
- Square Profile Icons
- Hide Supporter Button
