/**
 * Tests for src/content/features/videoDownload/index.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './index';
import { DOWNLOAD_BUTTON_ID } from './ui';

describe('videoDownload/index', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    vi.resetAllMocks();
  });

  describe('apply with enabled=true', () => {
    it('should add download button on watch page', () => {
      vi.stubGlobal('location', {
        pathname: '/watch/sm12345',
        href: 'https://www.nicovideo.jp/watch/sm12345',
      });

      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="control-bar">
            <button aria-label="全画面表示">Fullscreen</button>
          </div>
        </div>
      `;

      apply(true);

      const button = document.getElementById(DOWNLOAD_BUTTON_ID);
      expect(button).not.toBeNull();
    });

    it('should not add button on non-watch page', () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });

      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="control-bar">
            <button aria-label="全画面表示">Fullscreen</button>
          </div>
        </div>
      `;

      apply(true);

      const button = document.getElementById(DOWNLOAD_BUTTON_ID);
      expect(button).toBeNull();
    });

    it('should handle missing player area gracefully', () => {
      vi.stubGlobal('location', {
        pathname: '/watch/sm12345',
        href: 'https://www.nicovideo.jp/watch/sm12345',
      });

      document.body.innerHTML = '<div>No player area</div>';

      expect(() => apply(true)).not.toThrow();
    });
  });

  describe('apply with enabled=false', () => {
    it('should remove download button', () => {
      document.body.innerHTML = `<button id="${DOWNLOAD_BUTTON_ID}">Download</button>`;

      apply(false);

      const button = document.getElementById(DOWNLOAD_BUTTON_ID);
      expect(button).toBeNull();
    });

    it('should not throw when button does not exist', () => {
      document.body.innerHTML = '<div>No button</div>';

      expect(() => apply(false)).not.toThrow();
    });
  });

  describe('page detection', () => {
    it('should detect watch page correctly', () => {
      vi.stubGlobal('location', {
        pathname: '/watch/sm12345',
        href: 'https://www.nicovideo.jp/watch/sm12345',
      });

      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div><button aria-label="全画面表示"></button></div>
        </div>
      `;

      apply(true);

      expect(document.getElementById(DOWNLOAD_BUTTON_ID)).not.toBeNull();
    });

    it('should handle video ID with prefix', () => {
      vi.stubGlobal('location', {
        pathname: '/watch/so12345',
        href: 'https://www.nicovideo.jp/watch/so12345',
      });

      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div><button aria-label="全画面表示"></button></div>
        </div>
      `;

      apply(true);

      expect(document.getElementById(DOWNLOAD_BUTTON_ID)).not.toBeNull();
    });
  });
});
