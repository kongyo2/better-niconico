/**
 * Tests for src/content/features/restoreClassicVideoLayout.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './restoreClassicVideoLayout';

const LAYOUT_MARKER = 'data-bn-layout';

describe('restoreClassicVideoLayout', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    // Mock watch page
    vi.stubGlobal('location', {
      pathname: '/watch/sm12345',
      href: 'https://www.nicovideo.jp/watch/sm12345',
    });
    // Mock fullscreen API
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  describe('apply with enabled=true (classic layout)', () => {
    it('should not apply when not on watch page', () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });

      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBeNull();
    });

    it('should not apply when in fullscreen mode', () => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).not.toBe('classic');
    });

    it('should not apply when player area is missing', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[bottom]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      expect(() => apply(true)).not.toThrow();
    });

    it('should not apply when bottom area is missing', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      expect(() => apply(true)).not.toThrow();
    });

    it('should not apply when detail info section is missing', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>Other Section</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBeNull();
    });

    it('should apply classic layout when all conditions met', () => {
      document.body.innerHTML = `
        <div class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div class="video-info">Video Info</div>
            <section><h1>動画の詳細情報</h1></section>
            <section><h1>ニコニ広告</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBe('classic');
    });

    it('should not re-apply when already in classic layout', () => {
      document.body.innerHTML = `
        <div class="parent-grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      // Should not throw or cause issues
      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBe('classic');
    });
  });

  describe('apply with enabled=false (default layout)', () => {
    it('should restore default layout', () => {
      document.body.innerHTML = `
        <div class="parent-grid" style="grid-template-areas: 'custom'">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(false);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBe('default');
    });

    it('should not change when already in default layout', () => {
      document.body.innerHTML = `
        <div class="parent-grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="default"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="default"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(false);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBe('default');
    });

    it('should not change when no marker exists', () => {
      document.body.innerHTML = `
        <div class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(false);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBeNull();
    });
  });

  describe('fullscreen detection', () => {
    it('should detect fullscreen via Fullscreen API', () => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.createElement('div'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).not.toBe('classic');
    });

    it('should detect fullscreen via DOM element', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]">
            <div class="w_[100dvw] h_[100dvh]">Fullscreen element</div>
          </div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).not.toBe('classic');
    });
  });
});
