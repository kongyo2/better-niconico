import { Result, ok, err } from 'neverthrow';
import { domElementNotFoundError, PageError } from '../../../types/errors';

export const DOWNLOAD_BUTTON_ID = 'bn-download-button';
export const DOWNLOAD_BUTTON_MARKER = 'data-bn-download-button';

/**
 * Creates the download button element with Niconico styling
 */
export function createDownloadButton(onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = DOWNLOAD_BUTTON_ID;
  button.setAttribute(DOWNLOAD_BUTTON_MARKER, 'true');
  button.type = 'button';
  button.title = '動画ダウンロード';
  button.setAttribute('aria-label', '動画ダウンロード');

  // Use Niconico's native control bar button classes
  button.className = 'Pressable cursor_pointer';
  // Set explicit color to match other buttons (white)
  button.style.color = '#FFFFFF';

  // SVG Icon (Download Arrow)
  button.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 17L7 10H11V3H17V10H21L14 17Z" fill="currentColor"/>
      <rect x="7" y="19" width="14" height="2" fill="currentColor"/>
    </svg>
  `;

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  return button;
}

/**
 * Inserts the download button into the player control bar
 * Returns:
 * - Ok(true) if inserted
 * - Ok(false) if already exists
 * - Err(PageError) if target container not found
 */
export function insertDownloadButton(button: HTMLButtonElement): Result<boolean, PageError> {
  // Check if already exists
  if (document.getElementById(DOWNLOAD_BUTTON_ID)) {
    return ok(false);
  }

  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return err(domElementNotFoundError('Player area not found', '.grid-area_[player]'));
  }

  // Find the target to insert before (e.g., Settings button or Screenshot button if exists)
  // Logic: Insert before screenshot button if it exists, otherwise before fullscreen button,
  // or generally in the right-side control group.

  // Strategy: Find the parent container of buttons.
  // In videoScreenshot.ts, it finds '全画面表示' button and gets its parent.
  const buttons = Array.from(playerArea.querySelectorAll('button'));

  // Try to find Fullscreen button as a stable anchor
  const fullscreenButton = buttons.find(
    (b) =>
      b.className.includes('FullScreenButton') ||
      b.getAttribute('aria-label') === '全画面表示' ||
      b.getAttribute('aria-label') === '全画面表示する' ||
      b.getAttribute('data-title') === '全画面表示' ||
      b.getAttribute('data-title') === '全画面表示する',
  );

  if (!fullscreenButton) {
    return err(
      domElementNotFoundError('Fullscreen button not found', 'button[aria-label="全画面表示"]'),
    );
  }

  const controlBarButtonGroup = fullscreenButton.parentElement;
  if (!controlBarButtonGroup) {
    return err(
      domElementNotFoundError(
        'Control bar button group not found',
        'fullscreenButton.parentElement',
      ),
    );
  }

  // Insert before the screenshot button if it exists (to keep them grouped), otherwise before fullscreen
  const screenshotButton = document.getElementById('bn-screenshot-button');

  if (screenshotButton && controlBarButtonGroup.contains(screenshotButton)) {
    controlBarButtonGroup.insertBefore(button, screenshotButton);
  } else {
    controlBarButtonGroup.insertBefore(button, fullscreenButton);
  }

  return ok(true);
}

/**
 * Removes the download button from the DOM
 */
export function removeDownloadButton(): void {
  const button = document.getElementById(DOWNLOAD_BUTTON_ID);
  if (button) {
    button.remove();
  }
}
