// Storage utility functions with Result types
// Provides type-safe wrappers around Chrome Storage API

import { Result, ok, err, ResultAsync } from 'neverthrow';
import type { BetterNiconicoSettings } from '../types/settings';
import { DEFAULT_SETTINGS, STORAGE_KEY, BetterNiconicoSettingsSchema } from '../types/settings';
import type { StorageError, ValidationError } from '../types/errors';
import {
  storageGetFailedError,
  storageSetFailedError,
  storageSyncUnavailableError,
  validationFailedError,
} from '../types/errors';

/**
 * Load settings from Chrome storage with runtime validation
 * Returns Result<BetterNiconicoSettings, StorageError | ValidationError>
 *
 * Uses Zod schema to validate settings loaded from chrome.storage.sync:
 * - Ensures all fields have correct types (boolean)
 * - Applies default values for missing fields
 * - Prevents corrupt/invalid data from breaking the extension
 * - Provides detailed error information on validation failure
 */
export function loadSettings(): ResultAsync<
  BetterNiconicoSettings,
  StorageError | ValidationError
> {
  return ResultAsync.fromPromise(
    new Promise<BetterNiconicoSettings>((resolve, reject) => {
      if (!chrome?.storage?.sync) {
        reject(storageSyncUnavailableError('Chrome storage sync API is not available'));
        return;
      }

      chrome.storage.sync.get([STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          reject(
            storageGetFailedError(chrome.runtime.lastError.message ?? 'Unknown storage get error'),
          );
          return;
        }

        // Get raw data from storage (may be undefined or invalid)
        const rawSettings = result[STORAGE_KEY];

        // If no settings found, use defaults
        if (rawSettings === undefined) {
          resolve(DEFAULT_SETTINGS);
          return;
        }

        // Validate settings with Zod schema
        const parseResult = BetterNiconicoSettingsSchema.safeParse(rawSettings);

        if (!parseResult.success) {
          // Validation failed - log detailed error and use defaults
          console.warn('[Better Niconico] Settings validation failed:', parseResult.error);
          console.warn('[Better Niconico] Using default settings');
          reject(
            validationFailedError(
              'Settings validation failed. Using default settings.',
              parseResult.error,
            ),
          );
          return;
        }

        // Validation succeeded - return validated settings
        resolve(parseResult.data);
      });
    }),
    (error) => {
      // Type guard for known error types
      if (typeof error === 'object' && error !== null && 'type' in error) {
        return error as StorageError | ValidationError;
      }
      return storageGetFailedError(String(error));
    },
  );
}

/**
 * Save settings to Chrome storage with validation
 * Returns Result<void, StorageError | ValidationError>
 *
 * Validates settings before saving to ensure data integrity:
 * - All fields must be present and have correct types
 * - Prevents saving corrupt data to storage
 * - Provides detailed error information on validation failure
 */
export function saveSettings(
  settings: BetterNiconicoSettings,
): ResultAsync<void, StorageError | ValidationError> {
  return ResultAsync.fromPromise(
    new Promise<void>((resolve, reject) => {
      if (!chrome?.storage?.sync) {
        reject(storageSyncUnavailableError('Chrome storage sync API is not available'));
        return;
      }

      // Validate settings before saving
      const parseResult = BetterNiconicoSettingsSchema.safeParse(settings);

      if (!parseResult.success) {
        // Validation failed - reject with detailed error
        console.error('[Better Niconico] Attempted to save invalid settings:', parseResult.error);
        reject(
          validationFailedError(
            'Cannot save invalid settings. Validation failed.',
            parseResult.error,
          ),
        );
        return;
      }

      // Save validated settings
      chrome.storage.sync.set({ [STORAGE_KEY]: parseResult.data }, () => {
        if (chrome.runtime.lastError) {
          reject(
            storageSetFailedError(chrome.runtime.lastError.message ?? 'Unknown storage set error'),
          );
          return;
        }
        resolve();
      });
    }),
    (error) => {
      if (typeof error === 'object' && error !== null && 'type' in error) {
        return error as StorageError | ValidationError;
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
