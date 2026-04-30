/**
 * Tests for src/utils/storage.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSettings, saveSettings, isStorageAvailable } from './storage';
import { DEFAULT_SETTINGS, STORAGE_KEY } from '../types/settings';
import { resetChromeMocks, setMockStorageData, setLastError } from '../test/setup';

describe('storage utilities', () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  describe('isStorageAvailable', () => {
    it('should return ok(true) when chrome.storage.sync is available', () => {
      const result = isStorageAvailable();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(true);
    });

    it('should return error when chrome.storage.sync is unavailable', () => {
      const originalStorage = chrome.storage;
      // @ts-expect-error - testing unavailable storage
      chrome.storage = undefined;

      const result = isStorageAvailable();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('storage_sync_unavailable');

      chrome.storage = originalStorage;
    });
  });

  describe('loadSettings', () => {
    it('should return default settings when no settings are stored', async () => {
      const result = await loadSettings();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(DEFAULT_SETTINGS);
    });

    it('should return stored settings when valid settings exist', async () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        hidePremiumSection: false,
        hideOnAirAnime: false,
      };
      setMockStorageData({ [STORAGE_KEY]: customSettings });

      const result = await loadSettings();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().hidePremiumSection).toBe(false);
      expect(result._unsafeUnwrap().hideOnAirAnime).toBe(false);
    });

    it('should apply defaults for missing fields in stored settings', async () => {
      // Partial settings (missing some fields)
      setMockStorageData({
        [STORAGE_KEY]: {
          hidePremiumSection: false,
        },
      });

      const result = await loadSettings();
      expect(result.isOk()).toBe(true);
      const settings = result._unsafeUnwrap();
      expect(settings.hidePremiumSection).toBe(false);
      // Other fields should have default values
      expect(settings.hideOnAirAnime).toBe(true);
    });

    it('should return error when chrome.storage.sync is unavailable', async () => {
      const originalStorage = chrome.storage;
      // @ts-expect-error - testing unavailable storage
      chrome.storage = { sync: undefined };

      const result = await loadSettings();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('storage_sync_unavailable');

      chrome.storage = originalStorage;
    });

    it('should return error when chrome.runtime.lastError is set', async () => {
      setLastError({ message: 'Storage error' });

      const result = await loadSettings();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('storage_get_failed');
    });

    it('should return validation error for invalid settings data', async () => {
      // Invalid settings (wrong types)
      setMockStorageData({
        [STORAGE_KEY]: {
          hidePremiumSection: 'not a boolean',
          invalidField: 123,
        },
      });

      const result = await loadSettings();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('validation_failed');
    });
  });

  describe('saveSettings', () => {
    it('should save valid settings successfully', async () => {
      const result = await saveSettings(DEFAULT_SETTINGS);
      expect(result.isOk()).toBe(true);
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });

    it('should save modified settings', async () => {
      const modifiedSettings = {
        ...DEFAULT_SETTINGS,
        hidePremiumSection: false,
        enableVideoUpscaling: true,
      };

      const result = await saveSettings(modifiedSettings);
      expect(result.isOk()).toBe(true);
    });

    it('should return error when chrome.storage.sync is unavailable', async () => {
      const originalStorage = chrome.storage;
      // @ts-expect-error - testing unavailable storage
      chrome.storage = { sync: undefined };

      const result = await saveSettings(DEFAULT_SETTINGS);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('storage_sync_unavailable');

      chrome.storage = originalStorage;
    });

    it('should return error when chrome.runtime.lastError is set during save', async () => {
      // Mock the set function to trigger lastError
      vi.mocked(chrome.storage.sync.set).mockImplementationOnce(
        (_items: Record<string, unknown>, callback?: () => void) => {
          setLastError({ message: 'Save error' });
          if (callback) callback();
        },
      );

      const result = await saveSettings(DEFAULT_SETTINGS);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('storage_set_failed');
    });

    it('should return validation error for invalid settings', async () => {
      const invalidSettings = {
        ...DEFAULT_SETTINGS,
        hidePremiumSection: 'not a boolean',
      } as unknown as Parameters<typeof saveSettings>[0];

      const result = await saveSettings(invalidSettings);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('validation_failed');
    });
  });
});
