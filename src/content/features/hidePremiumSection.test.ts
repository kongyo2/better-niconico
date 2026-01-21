/**
 * Tests for src/content/features/hidePremiumSection.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apply } from './hidePremiumSection';

const PREMIUM_SELECTOR = '.TagPushVideosContainer';
const PREMIUM_MARKER = 'data-bn-premium-hidden';

describe('hidePremiumSection', () => {
  beforeEach(() => {
    // Reset DOM before each test
    document.body.innerHTML = '';
  });

  describe('apply with enabled=true (hide)', () => {
    it('should hide premium section when container exists', () => {
      // Create DOM structure
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="${PREMIUM_SELECTOR.slice(1)}">
            <span>プレミアム会員なら見放題</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('none');
      expect(parentBlock.getAttribute(PREMIUM_MARKER)).toBe('true');
    });

    it('should not hide when container does not exist', () => {
      document.body.innerHTML = '<div class="other-content">Other content</div>';

      expect(() => apply(true)).not.toThrow();
    });

    it('should not hide when parent block does not exist', () => {
      document.body.innerHTML = `<div class="${PREMIUM_SELECTOR.slice(1)}">Content</div>`;

      expect(() => apply(true)).not.toThrow();
    });

    it('should not hide when text does not contain premium keywords', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="${PREMIUM_SELECTOR.slice(1)}">
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
        <div class="BaseLayout-block" style="display: none" ${PREMIUM_MARKER}="true">
          <div class="${PREMIUM_SELECTOR.slice(1)}">
            <span>プレミアム会員</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('none');
    });
  });

  describe('apply with enabled=false (show)', () => {
    it('should show hidden premium section', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block" style="display: none" ${PREMIUM_MARKER}="true">
          <div class="${PREMIUM_SELECTOR.slice(1)}">
            <span>プレミアム会員</span>
          </div>
        </div>
      `;

      apply(false);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('');
      expect(parentBlock.hasAttribute(PREMIUM_MARKER)).toBe(false);
    });

    it('should not change when already visible', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="${PREMIUM_SELECTOR.slice(1)}">
            <span>プレミアム会員</span>
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
