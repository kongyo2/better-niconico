/**
 * Tests for src/content/features/restoreNicopediaLink.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './restoreNicopediaLink';

const MARKER = 'data-bn-nicopedia-processed';
const LINK_MARKER = 'data-bn-nicopedia-link';

describe('restoreNicopediaLink', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    // Mock watch page
    vi.stubGlobal('location', {
      pathname: '/watch/sm12345',
      href: 'https://www.nicovideo.jp/watch/sm12345',
    });
    // Reset chrome.runtime.sendMessage mock
    vi.mocked(chrome.runtime.sendMessage).mockReset();
  });

  describe('apply with enabled=true (add links)', () => {
    it('should not add links when not on watch page', async () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/test">test</a>
          </div>
        </div>
      `;

      apply(true);

      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(0);
    });

    it('should not add links when tag container not found', async () => {
      document.body.innerHTML = '<div>No tag container</div>';

      apply(true);

      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(0);
    });

    it('should add link when article exists', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: true });

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/VOCALOID">VOCALOID</a>
          </div>
        </div>
      `;

      apply(true);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      const processedTag = document.querySelector(`[${MARKER}]`);
      expect(processedTag).not.toBeNull();
    });

    it('should not add link when article does not exist', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: false });

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/nonexistent">nonexistent</a>
          </div>
        </div>
      `;

      apply(true);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(0);
    });

    it('should skip already processed tags', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: true });

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/test" ${MARKER}="true">test</a>
          </div>
        </div>
      `;

      apply(true);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not call sendMessage for already processed tag
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle sendMessage error gracefully', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Connection error'));

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/test">test</a>
          </div>
        </div>
      `;

      expect(() => apply(true)).not.toThrow();

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });

  describe('apply with enabled=false (remove links)', () => {
    it('should remove existing nicopedia links', () => {
      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/test" ${MARKER}="true">
              test
              <a ${LINK_MARKER}="true" href="https://dic.nicovideo.jp/a/test">dic</a>
            </a>
          </div>
        </div>
      `;

      apply(false);

      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(0);

      // Marker should also be removed
      const markers = document.querySelectorAll(`[${MARKER}]`);
      expect(markers.length).toBe(0);
    });

    it('should not throw when no links exist', () => {
      document.body.innerHTML = '<div>No links</div>';

      expect(() => apply(false)).not.toThrow();
    });

    it('should not run on non-watch pages', () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });

      document.body.innerHTML = `
        <a ${LINK_MARKER}="true">Link</a>
        <a ${MARKER}="true">Tag</a>
      `;

      apply(false);

      // Links should still exist because we're not on watch page
      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(1);
    });
  });

  describe('page detection', () => {
    it('should detect watch page correctly', () => {
      expect(window.location.pathname.startsWith('/watch/')).toBe(true);
    });

    it('should not detect other pages as watch page', () => {
      vi.stubGlobal('location', { pathname: '/video_top' });
      expect(window.location.pathname.startsWith('/watch/')).toBe(false);
    });
  });
});
