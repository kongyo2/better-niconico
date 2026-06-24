/**
 * Tests for src/content/features/hideOnAirAnime.ts
 *
 * 非表示そのものは index.css の CSS ルール（body.bn-hide-onair-anime 配下の :has() セレクタ）が
 * 担うため、ユニットテストでは JS の責務である「body クラスのトグル」を検証する。
 * 実際の対象ブロック特定は実機 video_top で確認済み（class / href の2系統セレクタが
 * 対象1ブロックのみに一致）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apply } from './hideOnAirAnime';

const HIDE_ONAIR_ANIME_CLASS = 'bn-hide-onair-anime';

describe('hideOnAirAnime', () => {
  beforeEach(() => {
    // Reset body classes before each test
    document.body.className = '';
  });

  describe('apply with enabled=true (hide)', () => {
    it('should add class when enabled is true', () => {
      apply(true);
      expect(document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)).toBe(true);
    });

    it('should not add duplicate class when already enabled', () => {
      apply(true);
      apply(true);
      const classCount = document.body.className
        .split(' ')
        .filter((c) => c === HIDE_ONAIR_ANIME_CLASS).length;
      expect(classCount).toBe(1);
    });
  });

  describe('apply with enabled=false (show)', () => {
    it('should remove class when enabled is false', () => {
      document.body.classList.add(HIDE_ONAIR_ANIME_CLASS);
      apply(false);
      expect(document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)).toBe(false);
    });

    it('should not throw when removing non-existent class', () => {
      expect(() => apply(false)).not.toThrow();
      expect(document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)).toBe(false);
    });
  });

  describe('toggle behavior', () => {
    it('should toggle class correctly', () => {
      // Enable
      apply(true);
      expect(document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)).toBe(true);

      // Disable
      apply(false);
      expect(document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)).toBe(false);

      // Enable again
      apply(true);
      expect(document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)).toBe(true);
    });
  });

  describe('robustness', () => {
    // 他機能の body クラス（例: bn-hide-shorts-button）を巻き込んで消さないこと
    it('should preserve unrelated body classes when toggling', () => {
      document.body.classList.add('bn-hide-shorts-button');
      document.body.classList.add('bn-square-icons');

      apply(true);
      expect(document.body.classList.contains('bn-hide-shorts-button')).toBe(true);
      expect(document.body.classList.contains('bn-square-icons')).toBe(true);
      expect(document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)).toBe(true);

      apply(false);
      expect(document.body.classList.contains('bn-hide-shorts-button')).toBe(true);
      expect(document.body.classList.contains('bn-square-icons')).toBe(true);
      expect(document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)).toBe(false);
    });

    // 連続トグルでも状態が破綻しないこと（冪等性）
    it('should remain consistent across repeated applies', () => {
      apply(true);
      apply(true);
      apply(false);
      apply(false);
      apply(true);
      expect(document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)).toBe(true);
      const classCount = document.body.className
        .split(' ')
        .filter((c) => c === HIDE_ONAIR_ANIME_CLASS).length;
      expect(classCount).toBe(1);
    });
  });
});
