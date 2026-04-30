/**
 * Tests for src/content/features/videoDownload/saver.ts
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { saveAsFile } from './saver';

describe('videoDownload/saver', () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
  let mockClick: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Mock URL methods
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
    mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    // Mock click
    mockClick = vi.fn();
    HTMLAnchorElement.prototype.click = mockClick;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveAsFile', () => {
    it('should create a blob and trigger download', () => {
      const data = new Uint8Array([1, 2, 3, 4]);

      saveAsFile(data, 'test.mp4', 'video/mp4');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });

    it('should create anchor with correct attributes', () => {
      const data = new Uint8Array([1, 2, 3, 4]);

      saveAsFile(data, 'video.mp4', 'video/mp4');

      // Check that anchor was appended to body
      const anchor = document.body.querySelector('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.download).toBe('video.mp4');
      expect(anchor?.href).toBe('blob:test-url');
      expect(anchor?.style.display).toBe('none');
    });

    it('should use default mime type when not specified', () => {
      const data = new Uint8Array([1, 2, 3, 4]);

      saveAsFile(data, 'video.ts');

      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should cleanup after timeout', async () => {
      vi.useFakeTimers();
      const data = new Uint8Array([1, 2, 3, 4]);

      saveAsFile(data, 'test.mp4');

      // Verify anchor exists before cleanup
      expect(document.body.querySelector('a')).not.toBeNull();

      // Fast forward time
      vi.advanceTimersByTime(1000);

      // Verify cleanup occurred
      expect(document.body.querySelector('a')).toBeNull();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url');

      vi.useRealTimers();
    });
  });
});
