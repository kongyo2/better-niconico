# Implementation Guide

This document covers how to add new features, implementation patterns, and best practices.

## Adding New Features

### Step-by-Step Guide

#### 1. Create Feature Module

Create `src/content/features/myNewFeature.ts`:

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

#### 2. Add Setting to Zod Schema

Update `src/types/settings.ts` by adding to the **Zod schema** (TypeScript type updates automatically):

```typescript
export const BetterNiconicoSettingsSchema = z.object({
  hidePremiumSection: z.boolean().default(true),
  myNewFeature: z.boolean().default(false), // Add here with .default()
  // ... other settings
});

// TypeScript type is inferred from schema - no manual update needed
export type BetterNiconicoSettings = z.infer<typeof BetterNiconicoSettingsSchema>;

// Update DEFAULT_SETTINGS to match schema defaults
export const DEFAULT_SETTINGS: BetterNiconicoSettings = {
  hidePremiumSection: true,
  myNewFeature: false, // Add default (must match schema)
  // ... other settings
};
```

**IMPORTANT:**

- **Always add `.default()` to new schema fields** for backward compatibility
- TypeScript type is automatically inferred via `z.infer` - don't manually update the interface
- Runtime validation ensures data integrity when loading settings

#### 3. Import and Apply in Content Script

Update `src/content/index.ts`:

```typescript
import * as myNewFeature from './features/myNewFeature';

async function applySettings(): Promise<void> {
  const settings = await loadSettings();
  // ... existing features
  myNewFeature.apply(settings.myNewFeature);
}
```

#### 4. Add to Settings Configuration

Update `src/popup/popup.ts` by adding to the `SETTINGS_CONFIG` array:

```typescript
const SETTINGS_CONFIG: SettingConfig[] = [
  // ... existing settings
  {
    id: 'myNewFeature',
    label: '新機能のラベル',
    description: '機能の説明文',
    category: 'video', // or 'ui' or 'system'
    icon: 'M4 6h16M4 12h16M4 18h16' // Optional: Heroicons SVG path (20x20 stroke)
  },
];
```

**Category Guidelines**:
- `'video'`: Video playback, enhancement, capture features (e.g., upscaling, PiP, screenshot)
- `'ui'`: Visual appearance, layout, hiding elements (e.g., hide ads, square icons, classic layout)
- `'system'`: Extension behavior, experimental features

**Icon Guidelines** (optional):
- Use [Heroicons](https://heroicons.com/) outline style (20x20px, stroke-based)
- Provide only the SVG `<path>` `d` attribute value
- If omitted, setting card displays without icon

That's all! The popup UI automatically:
- Renders the setting card in the appropriate tab
- Handles toggle state persistence
- Shows status messages on save

## Popup UI Development

### Architecture Overview

The popup UI uses a modern, category-based architecture with the following structure:

- **Tab System**: Three categories (Video, UI, System) organize settings logically
- **Dynamic Rendering**: Settings cards generated from configuration array
- **Icon Support**: Optional Heroicons-style SVG icons for visual clarity
- **Dark Theme**: CSS custom properties for consistent, modern appearance

### Settings Configuration Structure

All popup settings are defined in a single `SETTINGS_CONFIG` array:

```typescript
interface SettingConfig {
  id: keyof BetterNiconicoSettings;     // Must match settings.ts interface
  label: string;                         // Display name (Japanese)
  description: string;                   // Brief explanation (Japanese)
  category: 'video' | 'ui' | 'system';  // Tab category
  icon?: string;                         // Optional: SVG path d attribute
}
```

### Category Organization

**Video Tab** (`category: 'video'`):
- Video enhancement features (upscaling, quality)
- Video interaction features (PiP, screenshot)
- Video layout modifications

**UI/表示 Tab** (`category: 'ui'`):
- Visual hiding/showing elements
- Layout and appearance changes
- Profile and UI customizations

**System Tab** (`category: 'system'`):
- Extension behavior settings
- Advanced/experimental features
- Developer options (future use)

### Adding Icons to Settings

Icons use the [Heroicons](https://heroicons.com/) outline icon set (20x20px, 2px stroke):

1. Browse [Heroicons](https://heroicons.com/) and find an appropriate icon
2. Copy the SVG `<path d="...">` attribute value
3. Add to the `icon` property in `SETTINGS_CONFIG`

**Example**:
```typescript
{
  id: 'enableVideoUpscaling',
  label: '動画アップスケーリング',
  description: 'Anime4K-WebGPUを使用して動画を高画質化します',
  category: 'video',
  icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
}
```

**Icon not required**: Settings without icons display cleanly without the icon area.

### Customizing Popup Appearance

The popup's visual design is controlled by CSS custom properties in `src/popup/popup.css`:

```css
:root {
  /* Colors */
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --accent-color: #0099e5;
  /* ... more variables */
}
```

**To customize**:
- Modify CSS variables in `:root` selector
- Adjust spacing with `--spacing-*` variables
- Change border radius with `--radius-*` variables
- Update transition speeds with `--transition-*` variables

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

## Implementation Patterns

### CSS-Based vs DOM Manipulation Features

There are two main approaches for implementing features:

#### 1. CSS-Based Features (Preferred for styling changes)

Use body class toggle (e.g., `body.bn-square-icons`) and define CSS rules that apply when class is present.

**Advantages**:
- Highest performance (no DOM iteration)
- Automatically applies to dynamically loaded content
- Simple to implement and maintain
- Easy to debug (inspect body classes in DevTools)

**When to use**: Visual styling changes, icon shapes, colors, layouts that can be controlled via CSS

**Examples**: `squareProfileIcons`, `hideSupporterButton` features

**Feature module**:
```typescript
export function apply(enabled: boolean): void {
  if (enabled) {
    document.body.classList.add('bn-feature-class');
  } else {
    document.body.classList.remove('bn-feature-class');
  }
}
```

**CSS file**:
```css
body.bn-feature-class .target-selector {
  /* Your styles here */
}
```

#### 2. DOM Manipulation Features (For structural changes)

Query and modify DOM elements directly.

**Advantages**:
- Can hide/show/move elements
- Can inject new HTML elements
- Full control over DOM structure

**Disadvantages**:
- More complex (requires idempotency checks)
- May need MutationObserver awareness
- Higher performance cost if iterating many elements

**When to use**: Hiding sections, adding buttons, restructuring layout, injecting new elements

**Examples**: `hidePremiumSection`, `addNicoRankButton`, `restoreClassicVideoLayout`

#### Hybrid Approach

Some features use both approaches. For example, `restoreClassicVideoLayout` manipulates DOM to move elements but also modifies CSS Grid properties for layout.

## DOM Manipulation Best Practices

### Hiding Sections Properly

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

### Watch Page Layout Structure

- `.grid-area_[player]` - Video player container
- `.grid-area_[bottom]` - Video information (title, tags, uploader info)
- `.grid-area_[sidebar]` - Right sidebar (recommendations, comments)
- **Parent uses CSS Grid with `grid-template-areas`**

### CRITICAL - CSS Grid Architecture

Niconico's watch page uses CSS Grid's `grid-template-areas` property to control layout. This means:

- **DOM element order does not affect visual layout** - Grid items are positioned by their `grid-area` CSS property
- To change layout, modify the parent's `grid-template-areas` property, not DOM order
- Default: `'"player sidebar" "bottom sidebar" "bottom sidebar"'`
- Classic layout (implemented by extension): `'"bottom sidebar" "player sidebar" "bn-bottom sidebar"'`
  - `bottom`: Video info (title, tags, uploader) - moved to top
  - `player`: Video player - middle
  - `bn-bottom`: Parent/child works and ads - kept at bottom (custom grid area created by extension)

### CSS Class Escaping

When selecting classes with special characters (like brackets), escape them in `querySelector`:

```typescript
// Class: .grid-area_[player]
document.querySelector('.grid-area_\\[player\\]')
```

### Advanced DOM Manipulation for Layout Changes

For complex layout modifications that require moving elements between containers:

#### 1. Create Managed Containers

Create containers with unique IDs and marker attributes:

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

#### 2. Move Elements Safely

Check parent before moving:

```typescript
const section = getSectionElement();
if (section && section.parentElement === sourceContainer) {
  targetContainer.appendChild(section); // Moves the element
}
```

#### 3. Clean Up Properly

When feature is disabled:

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

#### 4. Update Grid Layout

Accommodate new areas:

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

### CSS Grid Row Sizing Pitfall

When working with CSS Grid layouts, especially with items that span multiple rows:

#### The Problem

If a grid item (like `.grid-area_[sidebar]`) spans all rows and has large content (~5460px), it will dominate the row sizing calculation. Using `grid-template-rows: min-content min-content min-content` causes each row to expand to accommodate the spanning item, creating massive rows (1600-1900px each) even when individual items are much smaller.

#### The Solution

- Use `grid-template-rows: auto auto auto` instead of `min-content`
- Constrain the spanning item with `max-height` and `overflow-y: auto`
- Use `position: sticky` for better UX (keeps sidebar visible while scrolling)
- Set `align-items: start` on the grid container and `align-self: start` on grid items

#### Why This Works

By constraining the sidebar's height and using `auto` for row sizing, the grid rows size based on their direct children rather than the spanning sidebar. This prevents unwanted whitespace above/below content.

#### Tailwind Class Conflicts

Niconico uses Tailwind's arbitrary value classes like `grid-tr_[min-content_min-content_1fr]`. These can conflict with inline styles. When modifying grid properties, remove the conflicting Tailwind classes first, then apply inline styles.

## Idempotency and MutationObserver Considerations

### Why Idempotency Matters

**CRITICAL**: Since the content script uses MutationObserver to handle dynamic content, all feature `apply()` functions **MUST be idempotent** (safe to call multiple times).

- MutationObserver triggers on every DOM change
- Without idempotency checks, features may cause infinite loops or performance issues
- Features may undo each other if they modify the same elements

### Best Practices

#### 1. Check Current State Before Modifying DOM

```typescript
// ✅ GOOD - Check if already in desired state
if (element.style.display === 'none') {
  return; // Already hidden, do nothing
}
element.style.display = 'none';
```

#### 2. Use Marker Attributes to Track Processing

```typescript
const MARKER = 'data-bn-processed';

if (element.getAttribute(MARKER) === 'true') {
  return; // Already processed
}
element.style.display = 'none';
element.setAttribute(MARKER, 'true');
```

#### 3. Verify CSS State Before Modifying Styles

```typescript
// For layout features that modify CSS
const parent = element.parentElement as HTMLElement;

if (parent.style.gridTemplateAreas === desiredLayout) {
  return; // Already in desired layout
}
parent.style.gridTemplateAreas = desiredLayout;
```

#### 4. Add Content Validation for Safety

```typescript
// When hiding elements, verify it's the intended target
const textContent = element.textContent || '';
if (!textContent.includes('ExpectedKeyword')) {
  // Silently skip - content may not be loaded yet due to MutationObserver timing
  // Avoid console.warn() here as it creates noise during dynamic content loading
  return; // Don't hide unintended elements
}
```

## Feature Testing Checklist

When implementing a new feature, test the following:

1. ✅ Feature works on a fresh page load
2. ✅ Toggling setting on/off works correctly multiple times
3. ✅ Feature handles dynamic content loading (scroll, click tabs)
4. ✅ Unrelated sections remain unaffected
5. ✅ No console errors or excessive logging
6. ✅ Feature is idempotent (calling `apply()` multiple times is safe)
7. ✅ Feature cleans up properly when disabled
8. ✅ Feature respects page-specific constraints (if applicable)

## Common Pitfalls

- **Not handling page-specific features**: Always check if feature should apply to current page
- **Forgetting idempotency**: Always add checks to prevent redundant operations
- **Direct element hiding**: Use `.closest()` to hide parent containers, not direct elements
- **Ignoring CSS Grid layout**: Niconico uses `grid-template-areas`, so DOM order doesn't affect visual layout
- **Not cleaning up**: Always remove created elements/classes when feature is disabled
- **Excessive logging**: Avoid logging in idempotent checks (creates noise)
- **Using `min-content` for grid rows**: Use `auto` and constrain spanning items with `max-height`
- **Not handling fullscreen mode**: Use Fullscreen API and event listeners for reliable detection
