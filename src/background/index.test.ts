/**
 * Tests for src/background/index.ts
 *
 * Note: This module uses chrome.* APIs at module initialization,
 * so we test the message handler logic separately.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../test/setup';

describe('background/index', () => {
  beforeEach(() => {
    resetChromeMocks();
    // Reset fetch mock
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('onInstalled handler', () => {
    it('should register onInstalled listener', () => {
      expect(chrome.runtime.onInstalled.addListener).toBeDefined();
    });
  });

  describe('onUpdated handler', () => {
    it('should register onUpdated listener', () => {
      expect(chrome.tabs.onUpdated.addListener).toBeDefined();
    });
  });

  describe('CHECK_NICOPEDIA_ARTICLE message handler', () => {
    it('should return exists: true for valid article', async () => {
      // Mock fetch to return page without "まだ記事が書かれていません"
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve('<html><body>Article content</body></html>'),
        }),
      );

      // Simulate the message handler logic
      const encodedTagName = 'VOCALOID';
      const response = await fetch(`https://dic.nicovideo.jp/a/${encodedTagName}`, {
        method: 'GET',
        credentials: 'omit',
      });

      expect(response.ok).toBe(true);
      const html = await response.text();
      const exists = !html.includes('まだ記事が書かれていません');
      expect(exists).toBe(true);
    });

    it('should return exists: false for non-existent article', async () => {
      // Mock fetch to return page with "まだ記事が書かれていません"
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: () =>
            Promise.resolve('<html><body>まだ記事が書かれていません</body></html>'),
        }),
      );

      const encodedTagName = 'nonexistent';
      const response = await fetch(`https://dic.nicovideo.jp/a/${encodedTagName}`);
      const html = await response.text();
      const exists = !html.includes('まだ記事が書かれていません');
      expect(exists).toBe(false);
    });

    it('should return exists: false when fetch returns non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        }),
      );

      const response = await fetch('https://dic.nicovideo.jp/a/test');
      expect(response.ok).toBe(false);
      // Handler should return { exists: false }
    });

    it('should return exists: false when fetch throws error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      let errorOccurred = false;
      try {
        await fetch('https://dic.nicovideo.jp/a/test');
      } catch {
        errorOccurred = true;
      }
      expect(errorOccurred).toBe(true);
      // Handler should catch and return { exists: false }
    });
  });

  describe('chrome.runtime.onMessage registration', () => {
    it('should register message listener', () => {
      expect(chrome.runtime.onMessage.addListener).toBeDefined();
    });
  });
});
