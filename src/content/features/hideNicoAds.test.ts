/**
 * Tests for src/content/features/hideNicoAds.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apply } from './hideNicoAds';

const NICOAD_MARKER = 'data-bn-nicoad-hidden';

describe('hideNicoAds', () => {
  beforeEach(() => {
    // Reset DOM before each test
    document.body.innerHTML = '';
  });

  describe('apply with enabled=true (hide)', () => {
    it('should hide NicoAd section when h1 with "ニコニ広告" exists', () => {
      document.body.innerHTML = `
        <section>
          <h1>ニコニ広告</h1>
          <div>Ad content here</div>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('none');
      expect(section.getAttribute(NICOAD_MARKER)).toBe('true');
    });

    it('should not hide when no h1 with "ニコニ広告" exists', () => {
      document.body.innerHTML = `
        <section>
          <h1>Other heading</h1>
          <div>Other content</div>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).not.toBe('none');
    });

    it('should not throw when no sections exist', () => {
      document.body.innerHTML = '<div>No sections here</div>';

      expect(() => apply(true)).not.toThrow();
    });

    it('should not hide when h1 has "ニコニ広告" but no parent section', () => {
      document.body.innerHTML = `
        <div>
          <h1>ニコニ広告</h1>
        </div>
      `;

      expect(() => apply(true)).not.toThrow();
    });

    it('should not re-hide when already hidden', () => {
      document.body.innerHTML = `
        <section style="display: none" ${NICOAD_MARKER}="true">
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('none');
    });
  });

  describe('apply with enabled=false (show)', () => {
    it('should show hidden NicoAd section', () => {
      document.body.innerHTML = `
        <section style="display: none" ${NICOAD_MARKER}="true">
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(false);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('');
      expect(section.hasAttribute(NICOAD_MARKER)).toBe(false);
    });

    it('should not change when already visible', () => {
      document.body.innerHTML = `
        <section>
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(false);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('');
    });

    it('should not throw when section does not exist', () => {
      document.body.innerHTML = '<div>No NicoAd section</div>';

      expect(() => apply(false)).not.toThrow();
    });
  });
});
