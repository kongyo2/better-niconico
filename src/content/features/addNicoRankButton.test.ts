/**
 * Tests for src/content/features/addNicoRankButton.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './addNicoRankButton';

const BUTTON_MARKER = 'data-bn-nico-rank-button';
const CONTAINER_MARKER = 'data-bn-nico-rank-container';

describe('addNicoRankButton', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    // Mock location for video_top page
    vi.stubGlobal('location', {
      pathname: '/video_top',
      href: 'https://www.nicovideo.jp/video_top',
    });
  });

  describe('apply with enabled=true (add button)', () => {
    it('should add button when on video_top page with ranking link', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking">
              <div class="css-54sd46">
                <div class="css-14y3bdu"></div>
                <div><p class="css-ium6yj">ランキング</p></div>
              </div>
            </a>
          </div>
        </div>
      `;

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).not.toBeNull();
      expect(button?.getAttribute('href')).toBe('https://nico-rank.com/');
      expect(button?.getAttribute('target')).toBe('_blank');
    });

    it('should not add button when not on video_top page', () => {
      vi.stubGlobal('location', {
        pathname: '/watch/sm12345',
        href: 'https://www.nicovideo.jp/watch/sm12345',
      });

      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking">
              <div><p>ランキング</p></div>
            </a>
          </div>
        </div>
      `;

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
    });

    it('should not add button when sidebar container missing', () => {
      document.body.innerHTML = '<div class="other-content">No sidebar</div>';

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
    });

    it('should not add button when ranking link not found', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/other">
              <div><p>Other Link</p></div>
            </a>
          </div>
        </div>
      `;

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
    });

    it('should not add duplicate buttons', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking">
              <div><p class="css-ium6yj">ランキング</p></div>
            </a>
          </div>
        </div>
      `;

      apply(true);
      apply(true);

      const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
      expect(buttons.length).toBe(1);
    });

    it('should add button with podium icon SVG', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking">
              <div><p class="css-ium6yj">ランキング</p></div>
            </a>
          </div>
        </div>
      `;

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      const svg = button?.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('should work with collapsed sidebar class', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-gzpr6t">
            <a class="css-1i9dz1a" href="/ranking">
              <div><p class="css-ium6yj">ランキング</p></div>
            </a>
          </div>
        </div>
      `;

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).not.toBeNull();
    });
  });

  describe('apply with enabled=false (remove button)', () => {
    it('should remove existing button', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking">
              <div><p class="css-ium6yj">ランキング</p></div>
            </a>
          </div>
          <div ${CONTAINER_MARKER}="true">
            <a ${BUTTON_MARKER}="true" href="https://nico-rank.com/">ニコラン</a>
          </div>
        </div>
      `;

      apply(false);

      const container = document.querySelector(`[${CONTAINER_MARKER}]`);
      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(container).toBeNull();
      expect(button).toBeNull();
    });

    it('should not throw when no button exists', () => {
      document.body.innerHTML = '<div>No buttons</div>';

      expect(() => apply(false)).not.toThrow();
    });
  });

  describe('page detection', () => {
    it('should detect video_top page correctly', () => {
      vi.stubGlobal('location', { pathname: '/video_top' });
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking"><p class="css-ium6yj">ランキング</p></a>
          </div>
        </div>
      `;

      apply(true);
      expect(document.querySelector(`[${BUTTON_MARKER}]`)).not.toBeNull();
    });

    it('should detect video_top subpath', () => {
      vi.stubGlobal('location', { pathname: '/video_top/ranking' });
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking"><p class="css-ium6yj">ランキング</p></a>
          </div>
        </div>
      `;

      apply(true);
      expect(document.querySelector(`[${BUTTON_MARKER}]`)).not.toBeNull();
    });
  });
});
