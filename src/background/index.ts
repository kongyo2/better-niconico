// Background script (Service Worker) for Chrome Extension
// This script runs in the background and handles events

/**
 * Type definitions for messages
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
 * Listen for extension installation or update
 */
chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
  if (details.reason === 'install') {
    console.log('Extension installed successfully');

    // Initialize default settings or perform setup tasks
    chrome.storage.local.set({
      initialized: true,
      installedAt: new Date().toISOString()
    });
  } else if (details.reason === 'update') {
    const previousVersion = details.previousVersion;
    const currentVersion = chrome.runtime.getManifest().version;
    console.log(`Extension updated from ${previousVersion} to ${currentVersion}`);
  }
});

/**
 * Listen for extension icon clicks
 * Remove this listener if you add a popup page
 */
chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
  if (!tab.id) {
    console.warn('No tab ID available');
    return;
  }

  // Check if the tab is a restricted page where content scripts can't run
  if (tab.url && (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('edge://') ||
    tab.url.startsWith('moz-extension://') ||
    tab.url.startsWith('about:')
  )) {
    console.warn('Cannot access content script on restricted page:', tab.url);
    return;
  }

  try {
    // First, check if content script is injected by sending a test message
    const testResponse = await chrome.tabs.sendMessage(
      tab.id,
      { action: 'ping' } as Message
    ) as MessageResponse;

    if (testResponse && testResponse.success) {
      // Content script is available, send the actual message
      const response = await chrome.tabs.sendMessage(
        tab.id,
        { action: 'iconClicked' } as Message
      ) as MessageResponse;

      if (response.success) {
        console.log('Message sent successfully:', response.data);
      } else {
        console.error('Message failed:', response.error);
      }
    }
  } catch (error) {
    // This error often occurs when content script hasn't loaded yet
    // or when trying to access restricted pages
    if (error instanceof Error) {
      console.error('Error sending message:', error.message);

      if (error.message.includes('Could not establish connection')) {
        console.warn('Content script not available. Attempting to inject it...');
        
        try {
          // Try to inject the content script programmatically
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          
          console.log('Content script injected successfully');
          
          // Now try sending the message again
          const response = await chrome.tabs.sendMessage(
            tab.id,
            { action: 'iconClicked' } as Message
          ) as MessageResponse;
          
          if (response.success) {
            console.log('Message sent successfully after injection:', response.data);
          } else {
            console.error('Message failed after injection:', response.error);
          }
        } catch (injectError) {
          console.error('Failed to inject content script:', injectError);
          console.warn('This might be a restricted page or the tab was closed.');
        }
      }
    }
  }
});

/**
 * Listen for messages from content scripts or other parts of the extension
 */
chrome.runtime.onMessage.addListener(
  (
    request: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    console.log('Message received in background:', request);

    // Handle different message actions
    switch (request.action) {
      case 'getData':
        // Example: Fetch data from storage
        chrome.storage.local.get(['someKey'], (result) => {
          sendResponse({
            success: true,
            data: result.someKey
          });
        });
        return true; // Keep the message channel open for async response

      case 'saveData':
        // Example: Save data to storage
        chrome.storage.local.set({ someKey: request.data }, () => {
          sendResponse({
            success: true
          });
        });
        return true; // Keep the message channel open for async response

      default:
        sendResponse({
          success: false,
          error: `Unknown action: ${request.action}`
        });
        return false;
    }
  }
);

// Example: Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log(`Tab ${tabId} finished loading: ${tab.url}`);
  }
});

console.log('Background service worker initialized');
