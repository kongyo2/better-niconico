/**
 * Tests for src/content/features/hideShortsButton.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apply } from './hideShortsButton';

const HIDE_SHORTS_CLASS = 'bn-hide-shorts-button';

describe('hideShortsButton', () => {
  beforeEach(() => {
    // Reset body classes before each test
    document.body.className = '';
  });

  describe('apply', () => {
    it('should add class when enabled is true', () => {
      apply(true);
      expect(document.body.classList.contains(HIDE_SHORTS_CLASS)).toBe(true);
    });

    it('should not add duplicate class when already enabled', () => {
      apply(true);
      apply(true);
      // Count occurrences of the class
      const classCount = document.body.className
        .split(' ')
        .filter((c) => c === HIDE_SHORTS_CLASS).length;
      expect(classCount).toBe(1);
    });

    it('should remove class when enabled is false', () => {
      document.body.classList.add(HIDE_SHORTS_CLASS);
      apply(false);
      expect(document.body.classList.contains(HIDE_SHORTS_CLASS)).toBe(false);
    });

    it('should not throw when removing non-existent class', () => {
      expect(() => apply(false)).not.toThrow();
      expect(document.body.classList.contains(HIDE_SHORTS_CLASS)).toBe(false);
    });

    it('should toggle class correctly', () => {
      // Enable
      apply(true);
      expect(document.body.classList.contains(HIDE_SHORTS_CLASS)).toBe(true);

      // Disable
      apply(false);
      expect(document.body.classList.contains(HIDE_SHORTS_CLASS)).toBe(false);

      // Enable again
      apply(true);
      expect(document.body.classList.contains(HIDE_SHORTS_CLASS)).toBe(true);
    });
  });
});
