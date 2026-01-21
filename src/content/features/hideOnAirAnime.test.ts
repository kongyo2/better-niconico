/**
 * Tests for src/content/features/hideOnAirAnime.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apply } from './hideOnAirAnime';

const ANIME_SELECTOR = '.OnTvAnimeVideosContainer';
const ANIME_MARKER = 'data-bn-anime-hidden';

describe('hideOnAirAnime', () => {
  beforeEach(() => {
    // Reset DOM before each test
    document.body.innerHTML = '';
  });

  describe('apply with enabled=true (hide)', () => {
    it('should hide anime section when container exists', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>TV放送中のアニメ</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('none');
      expect(parentBlock.getAttribute(ANIME_MARKER)).toBe('true');
    });

    it('should not hide when container does not exist', () => {
      document.body.innerHTML = '<div class="other-content">Other content</div>';

      expect(() => apply(true)).not.toThrow();
    });

    it('should not hide when parent block does not exist', () => {
      document.body.innerHTML = `<div class="${ANIME_SELECTOR.slice(1)}">Content</div>`;

      expect(() => apply(true)).not.toThrow();
    });

    it('should not hide when text does not contain anime keywords', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>Other content without keywords</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).not.toBe('none');
    });

    it('should not re-hide when already hidden', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block" style="display: none" ${ANIME_MARKER}="true">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>TV放送中アニメ</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('none');
    });
  });

  describe('apply with enabled=false (show)', () => {
    it('should show hidden anime section', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block" style="display: none" ${ANIME_MARKER}="true">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>TV放送中アニメ</span>
          </div>
        </div>
      `;

      apply(false);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('');
      expect(parentBlock.hasAttribute(ANIME_MARKER)).toBe(false);
    });

    it('should not change when already visible', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>TV放送中アニメ</span>
          </div>
        </div>
      `;

      apply(false);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('');
    });

    it('should not throw when container does not exist', () => {
      document.body.innerHTML = '<div>Other content</div>';

      expect(() => apply(false)).not.toThrow();
    });
  });
});
