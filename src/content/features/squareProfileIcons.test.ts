/**
 * Tests for src/content/features/squareProfileIcons.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apply } from './squareProfileIcons';

const SQUARE_ICONS_CLASS = 'bn-square-icons';

describe('squareProfileIcons', () => {
  beforeEach(() => {
    // Reset body classes before each test
    document.body.className = '';
  });

  describe('apply', () => {
    it('should add class when enabled is true', () => {
      apply(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);
    });

    it('should not add duplicate class when already enabled', () => {
      apply(true);
      apply(true);
      // Count occurrences of the class
      const classCount = document.body.className
        .split(' ')
        .filter((c) => c === SQUARE_ICONS_CLASS).length;
      expect(classCount).toBe(1);
    });

    it('should remove class when enabled is false', () => {
      document.body.classList.add(SQUARE_ICONS_CLASS);
      apply(false);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(false);
    });

    it('should not throw when removing non-existent class', () => {
      expect(() => apply(false)).not.toThrow();
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(false);
    });

    it('should toggle class correctly', () => {
      // Enable
      apply(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      // Disable
      apply(false);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(false);

      // Enable again
      apply(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);
    });
  });
});
