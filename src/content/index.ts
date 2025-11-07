// Content script for Chrome Extension
// This script runs in the context of web pages
import './index.css';

/**
 * Type definitions
 */
interface Message {
  action: string;
  data?: unknown;
}

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Application state
 */
class ExtensionState {
  private isActive = false;

  getActive(): boolean {
    return this.isActive;
  }

  setActive(value: boolean): void {
    this.isActive = value;
  }

  toggle(): void {
    this.isActive = !this.isActive;
  }
}

const state = new ExtensionState();

/**
 * Utility functions
 */

/**
 * Creates a DOM element with specified attributes and properties
 */
function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string;
    textContent?: string;
    id?: string;
    attributes?: Record<string, string>;
  } = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (options.className) {
    element.className = options.className;
  }
  if (options.textContent) {
    element.textContent = options.textContent;
  }
  if (options.id) {
    element.id = options.id;
  }
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }

  return element;
}

/**
 * Storage operations with error handling
 */
async function getStorageData<T = unknown>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result[key] as T);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function setStorageData(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Example: Inject a notification element into the page
 */
function showNotification(message: string): void {
  // Remove existing notification if any
  const existing = document.getElementById('extension-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification element
  const notification = createElement('div', {
    id: 'extension-notification',
    className: 'extension-notification',
    textContent: message
  });

  document.body.appendChild(notification);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

/**
 * Example: Main functionality - toggle feature on/off
 */
function toggleFeature(): void {
  state.toggle();

  if (state.getActive()) {
    // Feature is now active
    console.log('Feature activated');
    showNotification('Extension feature activated!');

    // Example: Add a class to the body
    document.body.classList.add('extension-active');

    // Save state
    void setStorageData('featureActive', true);
  } else {
    // Feature is now inactive
    console.log('Feature deactivated');
    showNotification('Extension feature deactivated!');

    // Example: Remove the class from body
    document.body.classList.remove('extension-active');

    // Save state
    void setStorageData('featureActive', false);
  }
}

/**
 * Message listener - receives messages from background script
 */
chrome.runtime.onMessage.addListener(
  (
    request: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    console.log('Message received in content script:', request);

    try {
      switch (request.action) {
        case 'ping':
          // Respond to ping to confirm content script is available
          sendResponse({ success: true, data: 'pong' });
          break;

        case 'iconClicked':
          // Handle icon click
          toggleFeature();
          sendResponse({ success: true });
          break;

        case 'getState':
          // Return current state
          sendResponse({
            success: true,
            data: { isActive: state.getActive() }
          });
          break;

        default:
          sendResponse({
            success: false,
            error: `Unknown action: ${request.action}`
          });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return false; // Synchronous response
  }
);

/**
 * Initialization
 */
async function initialize(): Promise<void> {
  try {
    console.log('Content script initialized');

    // Load saved state
    const savedState = await getStorageData<boolean>('featureActive');
    if (savedState !== undefined) {
      state.setActive(savedState);

      if (state.getActive()) {
        document.body.classList.add('extension-active');
      }
    }

    // You can add more initialization logic here
  } catch (error) {
    console.error('Error initializing content script:', error);
  }
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initialize());
} else {
  void initialize();
}
