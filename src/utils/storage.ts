// Storage utility functions with Result types
// Provides type-safe wrappers around Chrome Storage API

import { Result, ok, err, ResultAsync } from 'neverthrow';
import type { BetterNiconicoSettings } from '../types/settings';
import { DEFAULT_SETTINGS, STORAGE_KEY } from '../types/settings';
import type { StorageError } from '../types/errors';
import {
  storageGetFailedError,
  storageSetFailedError,
  storageSyncUnavailableError,
} from '../types/errors';

/**
 * Load settings from Chrome storage
 * Returns Result<BetterNiconicoSettings, StorageError>
 */
export function loadSettings(): ResultAsync<BetterNiconicoSettings, StorageError> {
  return ResultAsync.fromPromise(
    new Promise<BetterNiconicoSettings>((resolve, reject) => {
      if (!chrome?.storage?.sync) {
        reject(storageSyncUnavailableError('Chrome storage sync API is not available'));
        return;
      }

      chrome.storage.sync.get([STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          reject(storageGetFailedError(chrome.runtime.lastError.message));
          return;
        }

        const settings = result[STORAGE_KEY] as BetterNiconicoSettings | undefined;
        resolve(settings || DEFAULT_SETTINGS);
      });
    }),
    (error) => {
      if (typeof error === 'object' && error !== null && 'type' in error) {
        return error as StorageError;
      }
      return storageGetFailedError(String(error));
    },
  );
}

/**
 * Save settings to Chrome storage
 * Returns Result<void, StorageError>
 */
export function saveSettings(settings: BetterNiconicoSettings): ResultAsync<void, StorageError> {
  return ResultAsync.fromPromise(
    new Promise<void>((resolve, reject) => {
      if (!chrome?.storage?.sync) {
        reject(storageSyncUnavailableError('Chrome storage sync API is not available'));
        return;
      }

      chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => {
        if (chrome.runtime.lastError) {
          reject(storageSetFailedError(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    }),
    (error) => {
      if (typeof error === 'object' && error !== null && 'type' in error) {
        return error as StorageError;
      }
      return storageSetFailedError(String(error));
    },
  );
}

/**
 * Check if Chrome storage sync is available
 * Returns Result<boolean, StorageError>
 */
export function isStorageAvailable(): Result<boolean, StorageError> {
  if (!chrome?.storage?.sync) {
    return err(storageSyncUnavailableError('Chrome storage sync API is not available'));
  }
  return ok(true);
}
