/**
 * Download Helper for ext.nicovideo.jp
 * Automatically injects nicozon bookmarklet when page loads
 */

console.log('[Better Niconico] Download helper loaded on ext.nicovideo.jp');

// Wait for page to be fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectBookmarklet);
} else {
  injectBookmarklet();
}

function injectBookmarklet(): void {
  console.log('[Better Niconico] Injecting nicozon bookmarklet...');

  try {
    const script = document.createElement('script');
    script.setAttribute('charset', 'utf-8');
    script.src = 'https://www.nicozon.net/js/bookmarklet.js';
    document.body.appendChild(script);
    console.log('[Better Niconico] Bookmarklet script injected successfully');
  } catch (error) {
    console.error('[Better Niconico] Failed to inject bookmarklet:', error);
  }
}
