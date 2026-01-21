/**
 * Tests for src/content/features/videoDownload/ui.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createDownloadButton,
  insertDownloadButton,
  removeDownloadButton,
  DOWNLOAD_BUTTON_ID,
  DOWNLOAD_BUTTON_MARKER,
} from './ui';

describe('videoDownload/ui', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
  });

  describe('createDownloadButton', () => {
    it('should create button with correct attributes', () => {
      const onClick = vi.fn();
      const button = createDownloadButton(onClick);

      expect(button.id).toBe(DOWNLOAD_BUTTON_ID);
      expect(button.getAttribute(DOWNLOAD_BUTTON_MARKER)).toBe('true');
      expect(button.type).toBe('button');
      expect(button.title).toBe('動画ダウンロード');
      expect(button.getAttribute('aria-label')).toBe('動画ダウンロード');
    });

    it('should have SVG icon', () => {
      const onClick = vi.fn();
      const button = createDownloadButton(onClick);

      const svg = button.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('should call onClick when clicked', () => {
      const onClick = vi.fn();
      const button = createDownloadButton(onClick);

      button.click();

      expect(onClick).toHaveBeenCalled();
    });

    it('should stop event propagation on click', () => {
      const onClick = vi.fn();
      const button = createDownloadButton(onClick);

      const event = new MouseEvent('click', { bubbles: true });
      const stopPropagation = vi.spyOn(event, 'stopPropagation');

      button.dispatchEvent(event);

      expect(stopPropagation).toHaveBeenCalled();
    });
  });

  describe('insertDownloadButton', () => {
    it('should return Ok(false) if button already exists', () => {
      document.body.innerHTML = `<button id="${DOWNLOAD_BUTTON_ID}">Existing</button>`;

      const button = document.createElement('button');
      const result = insertDownloadButton(button);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(false);
    });

    it('should return error if player area not found', () => {
      document.body.innerHTML = '<div>No player area</div>';

      const button = document.createElement('button');
      const result = insertDownloadButton(button);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('dom_element_not_found');
    });

    it('should return error if fullscreen button not found', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <button>Other button</button>
        </div>
      `;

      const button = document.createElement('button');
      const result = insertDownloadButton(button);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Fullscreen button');
    });

    it('should insert button before fullscreen button', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="control-bar">
            <button aria-label="全画面表示">Fullscreen</button>
          </div>
        </div>
      `;

      const button = createDownloadButton(() => {});
      const result = insertDownloadButton(button);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(true);
      expect(document.getElementById(DOWNLOAD_BUTTON_ID)).not.toBeNull();
    });

    it('should insert button before screenshot button if it exists', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="control-bar">
            <button id="bn-screenshot-button">Screenshot</button>
            <button aria-label="全画面表示">Fullscreen</button>
          </div>
        </div>
      `;

      const button = createDownloadButton(() => {});
      const result = insertDownloadButton(button);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(true);

      // Check button order
      const controlBar = document.querySelector('.control-bar');
      const children = Array.from(controlBar!.children);
      const downloadIndex = children.findIndex((el) => el.id === DOWNLOAD_BUTTON_ID);
      const screenshotIndex = children.findIndex((el) => el.id === 'bn-screenshot-button');
      expect(downloadIndex).toBeLessThan(screenshotIndex);
    });

    it('should support alternative aria-label for fullscreen button', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="control-bar">
            <button aria-label="全画面表示する">Fullscreen</button>
          </div>
        </div>
      `;

      const button = createDownloadButton(() => {});
      const result = insertDownloadButton(button);

      expect(result.isOk()).toBe(true);
    });

    it('should support data-title attribute for fullscreen button', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="control-bar">
            <button data-title="全画面表示">Fullscreen</button>
          </div>
        </div>
      `;

      const button = createDownloadButton(() => {});
      const result = insertDownloadButton(button);

      expect(result.isOk()).toBe(true);
    });

    it('should support FullScreenButton class', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="control-bar">
            <button class="FullScreenButton">Fullscreen</button>
          </div>
        </div>
      `;

      const button = createDownloadButton(() => {});
      const result = insertDownloadButton(button);

      expect(result.isOk()).toBe(true);
    });
  });

  describe('removeDownloadButton', () => {
    it('should remove existing button', () => {
      document.body.innerHTML = `<button id="${DOWNLOAD_BUTTON_ID}">Download</button>`;

      removeDownloadButton();

      expect(document.getElementById(DOWNLOAD_BUTTON_ID)).toBeNull();
    });

    it('should not throw when button does not exist', () => {
      document.body.innerHTML = '<div>No button</div>';

      expect(() => removeDownloadButton()).not.toThrow();
    });
  });
});
