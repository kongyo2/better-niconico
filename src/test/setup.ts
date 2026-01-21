/**
 * Vitest setup file
 * Mocks for Chrome Extension APIs
 */
import { vi } from 'vitest';

// Mock chrome.storage API
const mockStorage: Record<string, unknown> = {};

const mockChrome = {
  storage: {
    sync: {
      get: vi.fn((keys: string[], callback: (result: Record<string, unknown>) => void) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        }
        callback(result);
      }),
      set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(mockStorage, items);
        if (callback) callback();
      }),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  runtime: {
    lastError: null as chrome.runtime.LastError | null,
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    getManifest: vi.fn(() => ({ version: '1.0.0' })),
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
  },
  tabs: {
    onUpdated: {
      addListener: vi.fn(),
    },
  },
};

// Assign to global
Object.defineProperty(globalThis, 'chrome', {
  value: mockChrome,
  writable: true,
});

// Export for test utilities
export function getMockStorage() {
  return mockStorage;
}

export function clearMockStorage() {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
}

export function setMockStorageData(data: Record<string, unknown>) {
  Object.assign(mockStorage, data);
}

export function setLastError(error: chrome.runtime.LastError | null) {
  mockChrome.runtime.lastError = error;
}

export function resetChromeMocks() {
  clearMockStorage();
  setLastError(null);
  vi.clearAllMocks();
}
