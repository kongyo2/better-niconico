# Features

This document describes all features implemented in Better Niconico, with detailed implementation notes.

## Feature Overview

| Feature              | Location                                         | Type   | Default |
| -------------------- | ------------------------------------------------ | ------ | ------- |
| Hide Premium Section | `src/content/features/hidePremiumSection.ts`     | DOM    | ON      |
| Hide On-Air Anime    | `src/content/features/hideOnAirAnime.ts`         | DOM    | ON      |
| Restore Classic Layout | `src/content/features/restoreClassicVideoLayout.ts` | DOM/CSS | OFF    |
| Video Upscaling      | `src/content/features/videoUpscaling.ts`         | Canvas | OFF     |
| Nico Rank Button     | `src/content/features/addNicoRankButton.ts`      | DOM    | ON      |
| Square Profile Icons | `src/content/features/squareProfileIcons.ts`     | CSS    | OFF     |
| Hide Supporter Button | `src/content/features/hideSupporterButton.ts`   | CSS    | OFF     |
| Hide Nico Ads        | `src/content/features/hideNicoAds.ts`            | DOM    | OFF     |
| Picture-in-Picture   | `src/content/features/pictureInPicture.ts`       | Canvas | OFF     |
| Video Screenshot     | `src/content/features/videoScreenshot.ts`        | Canvas | OFF     |
| Allegation Assist    | `src/content/features/allegationAssist.ts`       | DOM    | OFF     |
| Cinematic Lighting   | `src/content/features/cinematicLighting.ts`      | Canvas | OFF     |
| Video Download       | `src/content/features/videoDownload/`             | DOM    | OFF     |
| Restore Nicopedia Link | `src/content/features/restoreNicopediaLink.ts` | DOM    | OFF     |

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

## 9. Picture-in-Picture (PiP)

**Location**: `src/content/features/pictureInPicture.ts`
**Reference**: Based on [NicoPIP](https://github.com/Kiikurage/NicoPIP)
**Default**: OFF
**Page**: `/watch/*` only

### Description

Enables Picture-in-Picture (PiP) mode for Niconico videos with comment overlay. Combines the main video and comment canvas into a single PiP window, allowing users to watch videos with comments while working on other tasks.

**Video Upscaling Integration**: When Video Upscaling (Anime4K-WebGPU) is enabled, PiP automatically uses the upscaled canvas for higher quality output.

### CRITICAL Implementation Details

#### 1. Current Niconico Video Page Structure (2025)

**Video Elements**:
- **Main content video**: `video[src^="blob:"]` outside `#nv_watch_VideoAdContainer`
- **Ad videos**: Inside `#nv_watch_VideoAdContainer` (must exclude)
- **Placeholder videos**: Empty elements with no src (must exclude)

**Canvas Elements**:
- **Comment canvas**: `[data-name="comment"] canvas` (1364x768 or similar)
- **Supporter canvas**: `[data-name="supporter-content"] canvas` (1280x720, **now supported**)

**IMPORTANT**: The old NicoPIP selectors (`#VideoPlayer video`, `#CommentRenderer canvas`) no longer work. Modern Niconico uses data attributes (`data-name`).

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

- **NEVER** use `document.querySelector('video')` - may select ad/placeholder
- **ALWAYS** validate video has src, dimensions, and is not in ad container
- Use `readyState` to find the best-loaded video among multiple candidates

#### 3. Comment Canvas Detection

```typescript
const playerArea = document.querySelector('.grid-area_\\[player\\]');
const commentContainer = playerArea.querySelector('[data-name="comment"]');
const canvas = commentContainer.querySelector('canvas');
```

- Comment canvas is nested inside `[data-name="comment"]` container
- Canvas dimensions are typically larger than video (e.g., 1364x768 for 480x360 video)
- Canvas uses `position: absolute` and overlays the video

#### 4. Video and Comment Composition

The feature creates a composite canvas that combines video (or upscaled canvas), supporter view, and comments:

```typescript
const outputCanvas = document.createElement('canvas');
outputCanvas.width = mainVideo.videoWidth;
outputCanvas.height = mainVideo.videoHeight;

const ctx = outputCanvas.getContext('2d');

// Detect upscaled canvas (Video Upscaling integration)
const upscaledCanvas = document.getElementById('bn-upscaled-canvas');
const videoSource = upscaledCanvas || mainVideo; // Use upscaled if available

// Animation loop using requestVideoFrameCallback (Chrome 83+)
function compositeLoopWithVideoFrameCallback() {
  // Draw black background (letterboxing)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw video source (upscaled canvas or main video) with aspect ratio preservation
  const sourceWidth = upscaledCanvas ? upscaledCanvas.width : mainVideo.videoWidth;
  const sourceHeight = upscaledCanvas ? upscaledCanvas.height : mainVideo.videoHeight;
  const videoSize = calcSize(sourceWidth, sourceHeight, canvas.width, canvas.height);
  ctx.drawImage(videoSource, ...);

  // Draw supporter view if visible (with aspect ratio preservation)
  if (supporterCanvas && isVisible(supporterContainer)) {
    const supporterSize = calcSize(supporterCanvas.width, supporterCanvas.height,
                                    canvas.width, canvas.height);
    ctx.drawImage(supporterCanvas, ...);
  }

  // Draw comment canvas on top (with aspect ratio preservation)
  const commentSize = calcSize(commentCanvas.width, commentCanvas.height,
                                canvas.width, canvas.height);
  ctx.drawImage(commentCanvas, ...);

  // Manual frame capture for precise sync with captureStream(0)
  const videoTrack = pipStream.getVideoTracks()[0];
  if (videoTrack && 'requestFrame' in videoTrack) {
    videoTrack.requestFrame();
  }

  // Schedule next frame synced with actual video frame updates
  mainVideo.requestVideoFrameCallback(() => compositeLoopWithVideoFrameCallback());
}
```

- **Frame sync**: Uses `requestVideoFrameCallback` for perfect sync with video frame updates (Chrome 83+)
- **Fallback**: Falls back to `requestAnimationFrame` if `requestVideoFrameCallback` is not available
- **Composition order**: Video (or upscaled canvas) → Supporter View → Comments (preserves proper layering)
- **Aspect ratio**: Preserved with letterboxing (black bars) using `calcSize()` helper
- **Video Upscaling**: Automatically detects and uses upscaled canvas (`#bn-upscaled-canvas`) when available

#### 5. MediaStream and PiP Video Creation

```typescript
// captureStream(0) = manual frame control for perfect sync
const stream = outputCanvas.captureStream(0);

const pipVideo = document.createElement('video');
pipVideo.autoplay = true;
pipVideo.muted = true;
pipVideo.srcObject = stream;
pipVideo.controls = true;

await pipVideo.play();
await pipVideo.requestPictureInPicture();
```

- `canvas.captureStream(0)` creates MediaStream with manual frame control (no automatic capture)
- Combined with `requestVideoFrameCallback` + `videoTrack.requestFrame()` for precise frame sync
- PiP video element is hidden (`opacity: 0`, `position: fixed`)
- `autoplay` and `muted` required for automatic playback
- `controls: true` shows play/pause in PiP window

#### 6. PiP Button Integration

The feature adds a PiP button to the player control bar:

```typescript
// Find the fullscreen button in the control bar
const fullscreenButton = Array.from(playerArea.querySelectorAll('button')).find(
  (btn) => btn.getAttribute('aria-label') === '全画面表示する',
);

// Get the control bar button group (parent of fullscreen button)
const controlBarButtonGroup = fullscreenButton.parentElement;

// Create PiP button with Niconico's native styling
const button = document.createElement('button');
button.className = 'Pressable cursor_pointer';
button.style.color = '#FFFFFF'; // White color to match other control buttons
button.setAttribute('aria-label', 'Picture-in-Picture');

// Insert before fullscreen button
controlBarButtonGroup.insertBefore(button, fullscreenButton);
```

- **Position**: Integrated into player control bar, before fullscreen button
- **Styling**:
  - Uses Niconico's native control bar button classes (`Pressable cursor_pointer`)
  - White color (`#FFFFFF`) applied for consistency with other player controls
- **Icon**: SVG PiP icon (rectangle with smaller rectangle inside), 28x28px
- **Integration**: Seamlessly blends with native player controls

#### 7. Cleanup and State Management

```typescript
function stopPiP(): void {
  // Stop composite loop
  stopCompositeLoop(); // Cancels both requestVideoFrameCallback and requestAnimationFrame

  // Remove PiP video
  pipVideo?.pause();
  pipVideo?.remove();

  // Stop MediaStream tracks
  pipStream?.getTracks().forEach(track => track.stop());

  // Restore video/canvas visibility (handles upscaling mode)
  if (upscaledCanvas) {
    upscaledCanvas.style.visibility = '';
  } else {
    mainVideo.style.visibility = '';
  }
  commentCanvas.style.visibility = '';

  // Clear references
  mainVideo = null;
  upscaledCanvas = null;
  commentCanvas = null;
  supporterCanvas = null;
  pipCanvas = null;
  pipStream = null;
}
```

**Automatic cleanup triggers**:
- User closes PiP window (`leavepictureinpicture` event)
- Feature disabled via settings
- Page navigation
- Comment layer destruction detected (triggers auto-reinitialization)

#### 8. Error Handling with Result Types

All DOM queries use Result types for type-safe error handling:

```typescript
function getMainVideo(): Result<HTMLVideoElement, VideoError | PageError> {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return err(domElementNotFoundError('Player area not found', '.grid-area_[player]'));
  }

  // ... find valid video

  if (!bestVideo) {
    return err(videoElementNotFoundError('Valid content video not found'));
  }

  return ok(bestVideo);
}
```

- **No exceptions thrown**: Always returns `Result<T, E>`
- **Type-safe errors**: `VideoError`, `PageError` from `src/types/errors.ts`
- **Graceful degradation**: Logs errors, skips feature if elements not found

### Idempotency

- **Button**: Uses `data-bn-pip-button` marker, checks existence before creating
- **State tracking**: `isRunningInPIP` flag prevents duplicate initialization
- **Safe re-application**: Calling `apply(true)` multiple times is safe

### Browser Compatibility

- **Picture-in-Picture API**: Chrome 69+, Edge 79+, Safari 13.1+
- **Canvas.captureStream()**: Chrome 51+, Edge 79+, Firefox 43+
- **requestVideoFrameCallback**: Chrome 83+ (falls back to `requestAnimationFrame` if not available)
- **Modern browsers only**: Not supported in IE or old browsers

### Performance Considerations

- **CPU usage**: ~5-10% on modern CPUs for canvas composition (synced with video frames)
- **Frame sync**: Uses `requestVideoFrameCallback` for optimal sync without wasted frames
- **Memory**: ~50-100MB for canvas buffers and MediaStream
- **Battery impact**: Moderate (continuous animation loop), but only renders when video frames update
- **Why default OFF**: Performance impact, user opt-in preferred

### Sync Fix (December 2025)

Improved frame synchronization for smoother PiP playback:

1. **requestVideoFrameCallback**: Changed from `requestAnimationFrame` to `requestVideoFrameCallback` (Chrome 83+) for perfect sync with actual video frame updates
2. **Manual Frame Capture**: Uses `captureStream(0)` + `videoTrack.requestFrame()` for precise frame control instead of automatic 60fps capture
3. **Video Upscaling Integration**: Automatically detects and uses upscaled canvas (`#bn-upscaled-canvas`) when Video Upscaling is enabled, providing higher quality PiP output
4. **Simplified Architecture**: Removed `setTimeout`-based fallback for hidden tabs (video playback is usually paused anyway)
5. **Fallback Mode**: Falls back to `requestAnimationFrame` if `requestVideoFrameCallback` is not available

### Previous Improvements (January 2025)

Based on [rutan/nicopip-chrome](https://github.com/rutan/nicopip-chrome) implementation:

1. **Aspect Ratio Preservation**: Uses `calcSize()` helper to maintain proper aspect ratios with letterboxing (black bars)
2. **Supporter View Composition**: Includes supporter display canvas in PiP output (when visible)
3. **Comment Layer Destruction Detection**: Automatically detects when comment canvas is destroyed and reinitializes PiP
4. **Robust Cleanup**: Improved cleanup of event listeners and timers

**Key differences from reference implementation**:
- Better Niconico: Integrated into unified settings system with persistent button
- rutan/nicopip-chrome: Standalone extension with separate controls
- Better Niconico: Result type error handling (neverthrow)
- rutan/nicopip-chrome: Traditional try-catch error handling

### User Experience

1. User enables PiP feature in settings
2. PiP button appears on `/watch/*` pages (in player control bar, before fullscreen button)
3. User clicks button to enter PiP mode
4. Video and comments are hidden, PiP window opens
5. User can resize/reposition PiP window
6. Closing PiP window restores normal viewing

### Why This Feature Exists

Picture-in-Picture allows multitasking while watching videos. Unique to this implementation: comments are included in the PiP window, preserving the full Niconico experience. This is essential for Niconico users who value the comment overlay as part of the viewing experience.

### Differences from Original NicoPIP

**Architecture**:
- NicoPIP: Uses `pageAction` + message passing between background and content scripts
- Better Niconico: Settings-based with integrated PiP button in player UI

**Selectors**:
- NicoPIP: Old selectors (`#VideoPlayer`, `#CommentRenderer`)
- Better Niconico: Modern data attribute selectors (`[data-name="comment"]`)

**Integration**:
- NicoPIP: Standalone extension, manual toggle via extension icon
- Better Niconico: Unified settings UI, persistent button in player

### References

- [NicoPIP GitHub](https://github.com/Kiikurage/NicoPIP)
- [Picture-in-Picture API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API)
- [HTMLCanvasElement.captureStream() (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)

---

## 10. Video Screenshot

**Location**: `src/content/features/videoScreenshot.ts`
**Default**: OFF
**Page**: `/watch/*` only

### Description

Captures the current video frame with comment overlay and saves it as a PNG image. Adds a screenshot button to the video player control bar, allowing users to save the current moment of the video (including comments) as an image file.

### CRITICAL Implementation Details

#### 1. Button Integration

The feature adds a screenshot button to the player control bar:

```typescript
// Find the fullscreen button in the control bar
const fullscreenButton = Array.from(playerArea.querySelectorAll('button')).find(
  (btn) => btn.getAttribute('aria-label') === '全画面表示する',
);

// Get the control bar button group (parent of fullscreen button)
const controlBarButtonGroup = fullscreenButton.parentElement;

// Create screenshot button with Niconico's native styling
const button = document.createElement('button');
button.className = 'Pressable cursor_pointer';
button.style.color = '#FFFFFF'; // White color to match other control buttons
button.setAttribute('aria-label', 'スクリーンショット');

// Insert before fullscreen button
controlBarButtonGroup.insertBefore(button, fullscreenButton);
```

- **Position**: Integrated into player control bar, before fullscreen button
- **Styling**:
  - Uses Niconico's native control bar button classes (`Pressable cursor_pointer`)
  - White color (`#FFFFFF`) applied for consistency with other player controls
- **Icon**: SVG camera icon, 28x28px
- **Integration**: Seamlessly blends with native player controls

#### 2. Video Element Detection

Uses the same detection logic as Picture-in-Picture feature:

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

- **NEVER** use `document.querySelector('video')` - may select ad/placeholder
- **ALWAYS** validate video has src, dimensions, and is not in ad container
- Selects the video with the highest `readyState` among valid candidates

#### 3. Canvas Composition

Single-frame capture combining video, supporter view, and comments:

```typescript
// Create composite canvas
const canvas = document.createElement('canvas');
canvas.width = mainVideo.videoWidth;
canvas.height = mainVideo.videoHeight;

const ctx = canvas.getContext('2d');

// Black background (letterboxing)
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Draw main video with aspect ratio preservation
const videoSize = calcSize(mainVideo.videoWidth, mainVideo.videoHeight, canvas.width, canvas.height);
ctx.drawImage(mainVideo, ...);

// Draw supporter view if visible (with aspect ratio preservation)
if (supporterCanvas && isVisible(supporterContainer)) {
  const supporterSize = calcSize(supporterCanvas.width, supporterCanvas.height, canvas.width, canvas.height);
  ctx.drawImage(supporterCanvas, ...);
}

// Draw comment canvas on top (with aspect ratio preservation)
const commentSize = calcSize(commentCanvas.width, commentCanvas.height, canvas.width, canvas.height);
ctx.drawImage(commentCanvas, ...);
```

- **Composition order**: Video → Supporter View → Comments (preserves proper layering)
- **Aspect ratio**: Preserved with letterboxing (black bars) using `calcSize()` helper
- **One-time operation**: No animation loop required (unlike PiP)

#### 4. File Download

```typescript
canvas.toBlob((blob) => {
  if (!blob) return;

  const url = URL.createObjectURL(blob);

  // Create temporary download link
  const a = document.createElement('a');
  a.href = url;
  a.download = generateFilename(mainVideo);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}, 'image/png');
```

- **Format**: PNG (lossless, supports transparency)
- **Filename**: `niconico_{videoId}_{HH-MM-SS}.png`
  - Example: `niconico_sm9_00-01-23.png`
- **Automatic download**: Browser's native download mechanism

#### 5. Video ID and Timestamp Extraction

```typescript
function getVideoId(): string {
  const match = window.location.pathname.match(/\/watch\/([^/?]+)/);
  return match ? match[1] : 'video';
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${hours.toString().padStart(2, '0')}-${minutes.toString().padStart(2, '0')}-${secs.toString().padStart(2, '0')}`;
}
```

- Extracts video ID from URL (`/watch/sm9` → `sm9`)
- Formats current playback time as HH-MM-SS
- Uses `-` as separator (safe for all filesystems)

#### 6. Error Handling with Result Types

All DOM queries use Result types for type-safe error handling:

```typescript
function getMainVideo(): Result<HTMLVideoElement, VideoError | PageError> {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return err(domElementNotFoundError('Player area not found', '.grid-area_[player]'));
  }

  // ... find valid video

  if (!bestVideo) {
    return err(videoElementNotFoundError('Valid content video not found'));
  }

  return ok(bestVideo);
}
```

- **No exceptions thrown**: Always returns `Result<T, E>`
- **Type-safe errors**: `VideoError`, `PageError` from `src/types/errors.ts`
- **Graceful degradation**: Logs errors, skips capture if elements not found

### Idempotency

- **Button**: Uses `data-bn-screenshot-button` marker, checks existence before creating
- **Safe re-application**: Calling `apply(true)` multiple times is safe

### Browser Compatibility

- **Canvas API**: All modern browsers
- **Blob API**: Chrome 5+, Edge 12+, Safari 5.1+
- **URL.createObjectURL()**: All modern browsers

### Performance Considerations

- **CPU usage**: Minimal (~1-2% for single capture)
- **Memory**: ~10-20MB for canvas buffer (temporary)
- **Battery impact**: Negligible (one-time operation)
- **Why default OFF**: User preference for control bar clutter

### User Experience

1. User enables screenshot feature in settings
2. Screenshot button appears on `/watch/*` pages (in player control bar, before fullscreen button)
3. User clicks button to capture current frame
4. PNG image downloads automatically with descriptive filename
5. Image includes video frame and comment overlay

### Why This Feature Exists

Screenshots allow users to save memorable moments from videos, share them on social media, or use them for creative purposes. Including comments in the screenshot is essential for Niconico users, as comments are a core part of the viewing experience and often provide context or humor.

### Comparison with Picture-in-Picture

**Similarities**:
- Both use canvas composition
- Both support video + supporter view + comments
- Both preserve aspect ratios with letterboxing
- Both use same helper functions (`calcSize`, `getMainVideo`, etc.)

**Differences**:

| Feature | Picture-in-Picture | Video Screenshot |
|---------|-------------------|------------------|
| Operation | Continuous (60fps loop) | One-time capture |
| Output | MediaStream → PiP window | PNG blob → File download |
| Resource usage | Moderate (continuous) | Minimal (instant) |
| User action | Toggle on/off | Single click per capture |
| Default state | OFF | OFF |

---

## 11. Allegation Assist (通報フォーム入力補助)

**Location**: `src/content/features/allegationAssist.ts`
**Default**: OFF
**Page**: `garage.nicovideo.jp/allegation/*` only

### Description

Adds a template dropdown menu to Niconico's allegation/report pages, allowing users to quickly fill in report forms with pre-configured templates. Helps users report rule violations consistently and efficiently.

### CRITICAL Implementation Details

#### 1. Page Detection

The feature only activates on allegation pages:

```typescript
function isAllegationPage(): boolean {
  return (
    window.location.hostname === 'garage.nicovideo.jp' &&
    window.location.pathname.includes('/allegation/')
  );
}
```

- **Host**: `garage.nicovideo.jp` (not regular nicovideo.jp)
- **Path**: Must contain `/allegation/`
- Example URL: `https://garage.nicovideo.jp/allegation/40347342/119898405`

#### 2. Form Element Detection

The allegation form has three main elements:

```typescript
function getFormElements(): {
  reasonSelect: HTMLSelectElement | null;
  contentTypeRadios: HTMLInputElement[];
  commentTextarea: HTMLTextAreaElement | null;
} {
  const reasonSelect = document.querySelector<HTMLSelectElement>('select[name="reason_id"]');
  const contentTypeRadios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="content_type"]'),
  );
  const commentTextarea = document.querySelector<HTMLTextAreaElement>('textarea[name="comment"]');

  return { reasonSelect, contentTypeRadios, commentTextarea };
}
```

**Form Structure**:
- `select[name="reason_id"]` - Violation reason dropdown
  - Values: "1" (性的), "2" (暴力), "3" (グロテスク), "4" (不快), "5" (差別), "6" (残虐), "7" (法令違反), "91" (その他), "rights" (権利侵害)
- `input[name="content_type"]` - Content type radio buttons
  - Values: "1" (映像), "2" (音声), "3" (映像+音声)
- `textarea[name="comment"]` - Detailed comment field

#### 3. Template Structure

Templates are defined using Zod schema in `src/types/settings.ts`:

```typescript
export const AllegationTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  reasonId: z.string(), // Violation reason value
  contentType: z.string(), // Content type value (1, 2, or 3)
  comment: z.string(), // Comment text
});

export type AllegationTemplate = z.infer<typeof AllegationTemplateSchema>;
```

**Default Templates**:

1. **無断転載と思われる動画の通報** (Unauthorized reposting report)
   - Reason: 91 (その他)
   - Type: 3 (映像+音声)
   - Pre-filled comment explaining spam-like unauthorized uploads

2. **一般的な違反報告** (General violation report)
   - Generic template for common violations

3. **詳細な違反報告** (Detailed violation report)
   - Template with structured placeholders

4. **カスタムテンプレート** (Custom template)
   - Blank template for custom use

#### 4. Dropdown UI Integration

The dropdown is inserted before the reason select element:

```typescript
function addDropdownToPage(templates: AllegationTemplate[]): void {
  // Check if already exists (idempotency)
  const existingContainer = document.querySelector(`[${CONTAINER_MARKER}]`);
  if (existingContainer) {
    return;
  }

  const { reasonSelect } = getFormElements();
  if (!reasonSelect) {
    return; // Form not ready yet
  }

  const parent = reasonSelect.parentElement;
  if (!parent) {
    return;
  }

  const dropdown = createDropdown(templates);
  parent.insertBefore(dropdown, reasonSelect);
}
```

**UI Design**:
- Light blue background (`#f0f8ff`) with blue border (`#b0d4ff`)
- Clear label: "定型文を使用："
- Dropdown with placeholder: "-- 定型文を選択してください --"
- Help text: "※ 定型文を選択すると、フォームに自動入力されます。内容を確認・編集してから送信してください。"

#### 5. Template Application

When user selects a template:

```typescript
function applyTemplate(template: AllegationTemplate): void {
  const { reasonSelect, contentTypeRadios, commentTextarea } = getFormElements();

  if (!reasonSelect || !commentTextarea || contentTypeRadios.length === 0) {
    console.warn('[Better Niconico] 通報フォームの要素が見つかりませんでした');
    return;
  }

  // Set reason
  reasonSelect.value = template.reasonId;

  // Set content type
  contentTypeRadios.forEach((radio) => {
    radio.checked = radio.value === template.contentType;
  });

  // Set comment
  commentTextarea.value = template.comment;
}
```

**Important**: Template values are **auto-filled** but **not auto-submitted**. Users must review and submit manually.

#### 6. Template Management UI

The popup includes a template editor accessible via "定型文を管理" button:

**Features**:
- List all templates with preview
- Add new templates
- Edit existing templates
- Delete templates
- Form fields:
  - Template name (required)
  - Violation reason (dropdown matching actual form)
  - Content type (radio buttons)
  - Comment text (textarea)

**Security Note**: Template names and comments use `textContent` (not `innerHTML`) to prevent XSS attacks.

### CSS-Based Styling

The feature uses CSS classes instead of inline styles for better maintainability:

```css
/* src/content/index.css */
.bn-allegation-assist-container {
  margin-bottom: 16px;
  padding: 12px;
  background-color: #f0f8ff;
  border: 1px solid #b0d4ff;
  border-radius: 4px;
}

.bn-allegation-assist-label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
  font-size: 14px;
  color: #333;
}

.bn-allegation-assist-select {
  width: 100%;
  padding: 8px;
  font-size: 14px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: white;
  cursor: pointer;
}

.bn-allegation-assist-note {
  margin-top: 8px;
  margin-bottom: 0;
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}
```

### Idempotency

- **Container marker**: `data-bn-allegation-container` attribute
- **Dropdown marker**: `data-bn-allegation-dropdown` attribute
- Checks for existing elements before creating new ones
- Safe to call `apply(true)` multiple times via MutationObserver

### Error Handling

Uses Result types for type-safe error handling:

```typescript
const settingsResult = await loadSettings();
if (settingsResult.isErr()) {
  console.error('[Better Niconico] 設定の読み込みに失敗しました:', settingsResult.error);
  return;
}

const settings = settingsResult.value;
```

- **No templates configured**: Removes dropdown and logs warning
- **Form not ready**: Silently skips (MutationObserver will retry)
- **Settings load failure**: Logs error and aborts

### User Experience

1. User enables "通報フォーム入力補助" in extension settings (System tab)
2. User can manage templates via "定型文を管理" button
3. User navigates to any allegation page (`garage.nicovideo.jp/allegation/*`)
4. Dropdown appears at top of form with available templates
5. User selects a template from dropdown
6. Form fields are automatically filled
7. User reviews and edits content as needed
8. User submits the form manually

### Why This Feature Exists

Reporting rule violations on Niconico can be repetitive and time-consuming. This feature:
- **Saves time**: No need to type the same report text repeatedly
- **Ensures consistency**: Pre-configured templates maintain consistent reporting style
- **Reduces errors**: Less typing means fewer mistakes
- **Lowers barrier**: Makes it easier to report spam and violations

The default "unauthorized reposting" template specifically addresses the common issue of spam uploads that hurt content discoverability.

### Security Considerations

**XSS Prevention**:
- All user-generated template content (names, comments) uses `textContent` instead of `innerHTML`
- Template data is validated using Zod schema before storage
- No eval() or dangerous DOM manipulation

**Data Validation**:
- Reason IDs must match actual form values
- Content type must be "1", "2", or "3"
- Template IDs are unique (timestamp-based generation)

**Privacy**:
- Templates are stored in `chrome.storage.sync` (user's private storage)
- No external API calls
- No data sent to third parties

---

## 12. Cinematic Lighting (シネマティックライティング)

**Location**: `src/content/features/cinematicLighting.ts`
**Default**: OFF
**Page**: `/watch/*` only

### Description

Ambient lighting feature inspired by YouTube's ambient mode. Extracts vibrant colors from video frames using saturation-weighted sampling and displays a multi-layer glow effect around the player, creating an immersive viewing experience that harmonizes with Niconico's existing dark mode.

### December 2025 Improvements

- **Multi-layer glow effect**: Inner and outer glow layers for depth
- **Saturation-priority color extraction**: Prefers vibrant colors over dull/dark ones
- **Extended glow range**: Light spreads beyond the player area
- **Corner glow**: Additional glow effects at the four corners
- **Smooth transitions**: GPU-accelerated animations with cubic-bezier easing
- **16x16 sampling**: Improved color accuracy while maintaining performance
- **SPA navigation support**: Proper cleanup on back button and page transitions
- **Video change detection**: Automatic reinitialization when video element changes
- **Retry mechanism**: Automatic retry when video element not found (up to 10 attempts)
- **Classic Layout compatibility**: Works correctly with restored classic video layout

### CRITICAL Implementation Details

#### 1. Saturation-Priority Color Extraction

```typescript
// Higher resolution sampling canvas (16x16) for better color accuracy
const SAMPLE_SIZE = 16;

// RGB to HSL conversion for saturation analysis
function rgbToHsl(rgb: RGB): HSL { ... }

// Calculate color score based on saturation
function calculateColorScore(rgb: RGB): number {
  const hsl = rgbToHsl(rgb);

  // Skip extremely dark or bright colors
  if (hsl.l < BRIGHTNESS_MIN / 2.55 || hsl.l > BRIGHTNESS_MAX / 2.55) {
    return 0;
  }

  // Weight saturation heavily
  return hsl.s * SATURATION_WEIGHT + hsl.l * 0.5;
}

// Select vibrant color using weighted average
const selectVibrantColor = (colors: Array<{ rgb: RGB; score: number }>): RGB => {
  // Square the score to emphasize high-saturation colors
  const weight = score * score;
  ...
};
```

- Uses 16x16 canvas for better sampling accuracy
- Converts RGB to HSL for saturation analysis
- Filters out extremely dark (<30) or bright (>230) colors
- Weights saturation 2x higher than brightness
- Squares scores to emphasize vibrant colors

#### 2. Multi-Layer Glow Effect

```typescript
// Inner glow (close to player)
const INNER_GLOW_BLUR = 60;
const INNER_GLOW_SPREAD = 30;
const GLOW_OPACITY_INNER = 0.6;

// Outer glow (extended range)
const OUTER_GLOW_BLUR = 120;
const OUTER_GLOW_SPREAD = 80;
const GLOW_OPACITY_OUTER = 0.35;

// Corner glow size
const CORNER_GLOW_SIZE = 200;
```

**DOM Structure**:
- `#bn-ambient-outer`: Wide glow on parent grid (extends beyond player)
- `#bn-ambient-container`: Container on player area
- `#bn-ambient-inner`: Inner glow layer
- `#bn-ambient-corners`: Four corner glow elements

**Visual Layers**:
1. **Outer glow**: Softer, wider spread on the page background
2. **Inner glow**: Stronger, tighter glow around player edges
3. **Corner glow**: Radial gradients at each corner with blur
4. **Center gradient**: Dominant color radial gradient

#### 3. Corner Color Extraction

```typescript
interface VibrantColors {
  top: string;
  bottom: string;
  left: string;
  right: string;
  dominant: string; // Most vibrant color overall
  corners: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  };
}
```

- Samples corner regions (1/4 size from each corner)
- Each corner gets its own color for natural transitions
- Creates more realistic ambient effect

#### 4. Frame Synchronization

```typescript
// requestVideoFrameCallback for perfect sync (Chrome 83+)
if (supportsRequestVideoFrameCallback() && currentVideo) {
  videoFrameCallbackId = currentVideo.requestVideoFrameCallback(() => {
    processFrame();
    updateLoopWithVideoFrameCallback();
  });
} else {
  // Fallback to requestAnimationFrame
  animationFrameId = requestAnimationFrame(updateLoopWithAnimationFrame);
}
```

- Uses `requestVideoFrameCallback` for frame-accurate updates
- Falls back to `requestAnimationFrame` for older browsers
- Color change threshold (15) prevents unnecessary updates

### CSS Implementation

```css
/* Outer glow (extends beyond player) */
.bn-ambient-outer {
  position: absolute;
  pointer-events: none;
  z-index: 0;
  will-change: box-shadow, background;
  transform: translateZ(0);
  transition: box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1),
              background 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  mix-blend-mode: screen;
  margin: -100px;
  padding: 100px;
}

/* Inner glow (tight to player) */
.bn-ambient-inner {
  position: absolute;
  will-change: box-shadow, background;
  transform: translateZ(0);
  transition: box-shadow 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              background 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  mix-blend-mode: screen;
}

/* Corner glow elements */
.bn-ambient-corner {
  position: absolute;
  width: 200px;
  height: 200px;
  will-change: background;
  transform: translateZ(0);
  transition: background 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  mix-blend-mode: screen;
  border-radius: 50%;
  filter: blur(30px);
}
```

### Idempotency

- **Container marker**: `data-bn-ambient-container` attribute
- **Outer marker**: `data-bn-ambient-outer` attribute
- Checks for existing elements before creating new ones
- Safe to call `apply(true)` multiple times via MutationObserver

### Fullscreen Mode Handling

- **Detection**: Uses Fullscreen API (`document.fullscreenElement`) with DOM fallback
- **Event-driven**: `fullscreenchange` event listener for reliable detection
- **Behavior**: Hides glow when entering fullscreen, restores when exiting
- **State preservation**: Remembers enabled state across fullscreen transitions

### SPA Navigation Handling

Niconico uses SPA (Single Page Application) architecture with History API for navigation. This requires special handling:

```typescript
// popstate event listener for back/forward buttons
window.addEventListener('popstate', () => {
  handlePageNavigation();
});

// URL change monitoring for History API navigation
setInterval(() => {
  if (lastPageUrl !== window.location.href) {
    handlePageNavigation();
  }
  lastPageUrl = window.location.href;
}, 500);
```

**Navigation scenarios handled**:
1. **Leaving watch page**: Cleanup all elements and stop update loop
2. **Moving to different video**: Cleanup and reinitialize for new video
3. **Entering watch page**: Initialize if feature is enabled

**Retry mechanism**:
- When video element not found, retries up to 10 times with 500ms delay
- Useful when navigating to a new video page where DOM is still loading

### Classic Layout Compatibility

The feature detects and adapts to Classic Layout mode:

```typescript
function isClassicLayoutEnabled(): boolean {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  return playerArea?.getAttribute('data-bn-layout') === 'classic';
}
```

**Compatibility measures**:
- Outer glow element placed with absolute positioning (works with both layouts)
- Existing elements are validated for correct parent placement
- Elements are recreated if parent has changed (e.g., after layout switch)

### Browser Compatibility

- **requestVideoFrameCallback**: Chrome 83+ (optimal sync)
- **Fallback**: requestAnimationFrame (all modern browsers)
- **Canvas API**: All modern browsers
- **mix-blend-mode**: Chrome 41+, Firefox 32+, Safari 8+
- **CSS will-change**: Chrome 36+, Firefox 36+, Safari 9.1+

### Performance Considerations

- **CPU usage**: ~3-4% on modern CPUs (16x16 sampling with HSL conversion)
- **Memory**: Minimal (~2MB for canvas, state, and glow elements)
- **GPU usage**: Optimized with `will-change` and `transform: translateZ(0)`
- **Battery impact**: Low (efficient frame-synced updates, GPU-accelerated transitions)
- **Why default OFF**: Personal preference feature, not essential

### User Experience

1. User enables "シネマティックライティング" in extension settings (Video tab)
2. Multi-layer ambient glow appears around video player on `/watch/*` pages
3. Glow colors dynamically match the most vibrant parts of the video
4. Corner glows add depth and realism to the effect
5. Effect automatically disables in fullscreen mode
6. Smooth transitions between color changes with GPU acceleration

### Why This Feature Exists

Ambient lighting enhances the viewing experience by extending the video's visual atmosphere beyond the player boundaries. This creates a more immersive, cinema-like experience, especially effective when watching videos in a dark room. The improved multi-layer design provides a richer, more natural ambient effect that rivals YouTube's ambient mode while harmonizing with Niconico's existing dark mode

---

## Page-Specific Features

Some features only apply to specific pages:

**Watch page only** (`/watch/*`):
- Restore Classic Video Layout
- Video Upscaling
- Hide Nico Ads
- Picture-in-Picture
- Video Screenshot
- Cinematic Lighting
- Video Download
- Restore Nicopedia Link

**Video top page only** (`/video_top`):
- Add Nico Rank Button

**Allegation page only** (`garage.nicovideo.jp/allegation/*`):
- Allegation Assist

**Primarily video_top** (but check for elements on all pages):
- Hide Premium Section
- Hide On-Air Anime

**Global features** (all pages):
- Square Profile Icons
- Hide Supporter Button

---

## 13. Video Download (動画ダウンロード)

**Location**: `src/content/features/videoDownload/`
**Default**: OFF
**Page**: `/watch/*` only

### Description

Downloads Niconico videos as MP4 files by fetching HLS segments and muxing them together. Adds a download button to the player control bar.

### Implementation Structure

The feature is split into multiple modules:

- **index.ts** - Main entry point, orchestrates the download process
- **stream.ts** - Extracts master.m3u8 URL from video element, parses variant streams
- **fetcher.ts** - Downloads HLS segments with progress tracking
- **muxer.ts** - Muxes video and audio segments using M3U8 playlist approach
- **saver.ts** - Saves the final MP4 file using Blob API
- **ui.ts** - Creates and manages the download button in the control bar
- **types.ts** - TypeScript type definitions

### CRITICAL Implementation Details

#### 1. Master URL Extraction

```typescript
function getMasterUrl(): Result<string, VideoError | PageError> {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return err(domElementNotFoundError('Player area not found'));
  }

  const videos = playerArea.querySelectorAll('video');
  for (const video of videos) {
    if (video.src && video.src.startsWith('blob:')) {
      // Extract master.m3u8 from video element
      // Niconico stores the HLS URL in a specific attribute
    }
  }
}
```

- Extracts `master.m3u8` URL from video element on watch page
- Validates URL is from Niconico's CDN
- Returns Result type for error handling

#### 2. Stream Parsing

```typescript
async function getVariantStreams(masterUrl: string): Result<VariantStreams, DownloadError> {
  // Fetch master.m3u8 playlist
  // Parse video and audio stream URLs
  // Returns { video: { url, bandwidth }, audio: { url, bandwidth } }
}
```

- Parses HLS master playlist to find video and audio variant streams
- Selects appropriate quality variants
- Handles both separate and multiplexed streams

#### 3. Segment Download with Progress

```typescript
async function downloadSegmentsForMux(
  streamUrl: string,
  type: 'video' | 'audio',
  onProgress: (progress: number) => void
): Result<DownloadedData, DownloadError>
```

- Downloads video and audio segments in parallel
- Tracks and reports download progress
- Stores segments for muxing
- Uses Promise.all for concurrent downloads

#### 4. M3U8 Playlist Muxing

```typescript
async function muxWithPlaylist(
  videoPlaylist: string,
  videoSegments: Uint8Array[],
  audioPlaylist: string,
  audioSegments: Uint8Array[],
  filename: string
): Promise<Uint8Array>
```

- Uses FFmpeg-style M3U8 playlist approach (similar to nico_downloader)
- Muxes video and audio segments into MP4 container
- Handles segment timing and synchronization
- Produces browser-compatible MP4 file

#### 5. Download Button Integration

The download button is added to the player control bar:

```typescript
function createDownloadButton(onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'Pressable cursor_pointer';
  button.style.color = '#FFFFFF';
  button.setAttribute('aria-label', '動画をダウンロード');
  // ... SVG icon
  return button;
}
```

- **Position**: Player control bar, before fullscreen button
- **Styling**: Matches native Niconico control buttons
- **Icon**: Download icon (arrow pointing downward)

### Error Handling

Uses Result types for type-safe error handling:

```typescript
try {
  const masterUrlResult = getMasterUrl();
  if (masterUrlResult.isErr()) {
    throw masterUrlResult.error;
  }
  // ... continue with download
} catch (e) {
  alert(`ダウンロードに失敗しました: ${e.message}`);
}
```

### Download Progress

Progress is reported to browser console:

```
[BetterNiconico] Video Progress: 25.3%
[BetterNiconico] Audio Progress: 50.1%
[BetterNiconico] Download complete!
```

### Idempotency

- **Button**: Uses `data-bn-download-button` marker
- **State**: `isDownloading` flag prevents concurrent downloads
- Safe to call `apply(true)` multiple times

### Browser Compatibility

- **Blob API**: All modern browsers
- **URL.createObjectURL()**: All modern browsers
- **HLS parsing**: Custom parser (no external dependencies)

### Performance Considerations

- **Memory**: Stores all segments in memory before muxing (can be large for HD videos)
- **Network**: Downloads video and audio in parallel
- **CPU**: Muxing is done in JavaScript (can be slow for long videos)

### User Experience

1. User enables "動画ダウンロード" in settings
2. Download button appears on `/watch/*` pages (in control bar)
3. User clicks button to start download
4. Progress shown in console
5. Alert shown when download completes
6. MP4 file saved with video ID as filename (e.g., `sm9.mp4`)

### Why This Feature Exists

Niconico doesn't provide a native download feature. This feature allows users to save videos for offline viewing or archival purposes, which is useful for:
- Content creators who want to backup their own videos
- Users who want to watch offline
- Archival purposes

### Legal Note

This feature should only be used for:
- Downloading your own uploaded content
- Personal backup of content you have permission to download
- Educational/fair use purposes

---

## 14. Restore Nicopedia Link (大百科リンクの復元)

**Location**: `src/content/features/restoreNicopediaLink.ts`
**Default**: OFF
**Page**: `/watch/*` only

### Description

Restores the old Niconico Dictionary (大百科) link next to video tags. This feature was present in older versions of Niconico but was removed. It adds a book icon next to each tag that links to the corresponding article in Niconico's dictionary.

### CRITICAL Implementation Details

#### 1. Tag Container Detection

```typescript
function getTagContainer(): HTMLElement | null {
  // Only target tags in video info area (grid-area_[bottom])
  const bottomArea = document.querySelector('.grid-area_\\[bottom\\]');
  if (!bottomArea) return null;

  // Tag container has flex-wrap class
  const tagContainer = bottomArea.querySelector(
    'div[class*="flex-wrap_wrap"]'
  );
  return tagContainer;
}
```

- **Scope**: Only tags in the video info area (`.grid-area_[bottom]`)
- **Excludes**: Tags in related videos, sidebar, and other areas
- **Selector**: Targets div with `flex-wrap_wrap` class within bottom area

#### 2. Article Existence Check

```typescript
async function checkArticleExists(encodedTagName: string): Promise<boolean> {
  // Check session cache first
  if (articleExistsCache.has(encodedTagName)) {
    return articleExistsCache.get(encodedTagName)!;
  }

  // Send message to background script to fetch (avoid CORS)
  const response = await chrome.runtime.sendMessage({
    type: 'CHECK_NICOPEDIA_ARTICLE',
    tagName: encodedTagName,
  });

  const exists = response?.exists ?? false;
  articleExistsCache.set(encodedTagName, exists);
  return exists;
}
```

- **Background script**: Handles actual fetch request to avoid CORS
- **Session cache**: Stores results to avoid redundant checks
- **Parallel processing**: All tags checked simultaneously via `Promise.all()`

#### 3. Icon Design

```typescript
const NICODIC_ICON_SVG = `<svg viewBox="0 0 100 100" ...>
  <path d="M4 12a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4h92a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H62L50 24h38a4 4 0 0 1 4 4v68a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V28a4 4 0 0 1 4-4h18l12-12H4Zm26 52a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h40a2 2 0 0 0 2-2V66a2 2 0 0 0-2-2H30Zm0-28a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h40a2 2 0 0 0 2-2V38a2 2 0 0 0-2-2H30Z"
  fill="currentColor"/>
</svg>`;
```

- **Original design**: Replicates the old Niconico dictionary icon (book symbol)
- **SVG format**: Scalable without quality loss
- **Inline**: Added directly to DOM for performance

#### 4. Link Creation

```typescript
function createNicopediaLink(encodedTagName: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `https://dic.nicovideo.jp/a/${encodedTagName}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `ニコニコ大百科で「${decodeURIComponent(encodedTagName)}」を見る`;

  const iconSpan = document.createElement('span');
  iconSpan.innerHTML = NICODIC_ICON_SVG;
  link.appendChild(iconSpan);

  // Prevent tag click when clicking icon
  link.addEventListener('click', (e) => e.stopPropagation());

  return link;
}
```

- **Link target**: `https://dic.nicovideo.jp/a/{encodedTagName}`
- **New tab**: Opens in new tab for convenience
- **Click isolation**: Prevents triggering tag navigation when clicking dictionary link

#### 5. Parallel Processing

```typescript
async function addNicopediaLinks(): Promise<void> {
  const tags = tagContainer.querySelectorAll<HTMLAnchorElement>('a[href*="/tag/"]');

  const tagPromises = Array.from(tags).map(async (tag) => {
    if (tag.hasAttribute(MARKER)) return; // Skip processed

    const match = tag.getAttribute('href')?.match(/\/tag\/([^?]+)/);
    if (!match) return;

    const encodedTagName = match[1];
    tag.setAttribute(MARKER, 'true'); // Mark as processed

    const exists = await checkArticleExists(encodedTagName);
    if (!exists) return; // Only show if article exists

    const link = createNicopediaLink(encodedTagName);
    tag.appendChild(link);
  });

  await Promise.all(tagPromises);
}
```

- **All tags processed in parallel**: Faster than sequential
- **Idempotency**: `data-bn-nicopedia-processed` marker prevents duplicates
- **Conditional display**: Only shows link if article exists

### Idempotency

- **Tag marker**: `data-bn-nicopedia-processed` on tag element
- **Link marker**: `data-bn-nicopedia-link` on created link
- **Cleanup**: Removes all links and markers when disabled

### Cleanup

```typescript
function removeNicopediaLinks(): void {
  const links = document.querySelectorAll(`[${LINK_MARKER}]`);
  links.forEach((link) => link.remove());

  const tags = document.querySelectorAll(`[${MARKER}]`);
  tags.forEach((tag) => tag.removeAttribute(MARKER));
}
```

When disabled, all dictionary links are removed and markers are cleared so they can be re-added on re-enable.

### Browser Compatibility

- **All modern browsers**: Uses standard DOM APIs
- **Chrome extension APIs**: `chrome.runtime.sendMessage` for background fetch

### Performance Considerations

- **Network**: One API call per unique tag (cached per session)
- **DOM**: Minimal impact (small SVG icons)
- **Parallel**: All checks done simultaneously

### User Experience

1. User enables "大百科リンクの復元" in settings
2. On `/watch/*` pages, book icons appear next to tags
3. Icons only appear if dictionary article exists for that tag
4. Clicking icon opens dictionary article in new tab
5. Clicking tag still works normally (click isolated)

### Why This Feature Exists

Niconico removed the dictionary link feature in a UI update, but many users found it useful for:
- Learning about unfamiliar tags/memes
- Understanding cultural references
- Finding related content through the dictionary

The dictionary is a valuable resource for understanding Niconico's culture and context, and this feature restores that functionality.

### Background Script Integration

The feature requires a message handler in the background script:

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_NICOPEDIA_ARTICLE') {
    fetch(`https://dic.nicovideo.jp/a/${message.tagName}`)
      .then(res => res.text())
      .then(html => sendResponse({ exists: !html.includes('記事が見つかりません') }))
      .catch(() => sendResponse({ exists: false }));
    return true; // Keep channel open for async response
  }
});
```

This allows the content script to check article existence without CORS issues.
