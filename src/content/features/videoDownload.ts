/**
 * Video Download Feature
 * Downloads videos from Niconico using nicozon.net bookmarklet
 * Based on: https://github.com/iiiiiinnnnnnnn/NicoNicoDownloader-for-Firefox
 *
 * @module videoDownload
 * @page /watch/* only
 */

const FEATURE_NAME = '[Better Niconico - Video Download]';
const BUTTON_MARKER = 'data-bn-download-button';

/**
 * Check if current page is a watch page
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * Get video ID from current URL
 */
function getVideoId(): string | null {
  const match = window.location.pathname.match(/\/watch\/([^/?]+)/);
  return match?.[1] || null;
}

/**
 * Open download page in new tab
 */
function handleDownloadClick(): void {
  const videoId = getVideoId();
  if (!videoId) {
    console.error(`${FEATURE_NAME} Video ID not found in URL`);
    return;
  }

  const downloadUrl = `https://ext.nicovideo.jp/?${videoId}`;

  console.log(`${FEATURE_NAME} Opening download page:`, downloadUrl);

  // Open in new tab
  window.open(downloadUrl, '_blank');
}

/**
 * Create download button in player control bar
 */
function createDownloadButton(): void {
  // Check if button already exists
  const existingButton = document.querySelector(`[${BUTTON_MARKER}]`);
  if (existingButton) {
    return;
  }

  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    // Player area not loaded yet, skip silently
    return;
  }

  // Find fullscreen button to insert before it
  const fullscreenButton = Array.from(playerArea.querySelectorAll('button')).find(
    (btn) => btn.getAttribute('aria-label') === '全画面表示する',
  );

  if (!fullscreenButton || !fullscreenButton.parentElement) {
    // Control bar not loaded yet, skip silently
    return;
  }

  const controlBarButtonGroup = fullscreenButton.parentElement;

  // Create download button
  const button = document.createElement('button');
  button.className = 'Pressable cursor_pointer';
  button.style.color = '#FFFFFF';
  button.setAttribute('aria-label', 'ダウンロード');
  button.setAttribute(BUTTON_MARKER, 'true');

  // SVG download icon (arrow down to tray)
  button.innerHTML = `
    <div class="d_flex ai_center jc_center gap_x0_5">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 28px; height: 28px;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      <span>保存</span>
    </div>
  `;

  // Add click handler
  button.addEventListener('click', handleDownloadClick);

  // Insert button before fullscreen button
  controlBarButtonGroup.insertBefore(button, fullscreenButton);

  console.log(`${FEATURE_NAME} Download button created`);
}

/**
 * Remove download button
 */
function removeDownloadButton(): void {
  const button = document.querySelector(`[${BUTTON_MARKER}]`);
  if (button) {
    button.remove();
    console.log(`${FEATURE_NAME} Download button removed`);
  }
}

/**
 * Apply video download feature
 * @param enabled - Whether the feature should be enabled
 */
export function apply(enabled: boolean): void {
  if (!isWatchPage()) {
    removeDownloadButton();
    return;
  }

  if (enabled) {
    createDownloadButton();
  } else {
    removeDownloadButton();
  }
}
