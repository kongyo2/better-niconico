/**
 * Tests for src/content/features/videoDownload/fetcher.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { downloadSegmentsForMux, downloadSegments } from './fetcher';

describe('videoDownload/fetcher', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('downloadSegmentsForMux', () => {
    it('should download segments and return modified playlist', async () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
https://example.com/segment1.ts
#EXTINF:10.0,
https://example.com/segment2.ts
#EXT-X-ENDLIST`;

      const segment1Data = new Uint8Array([1, 2, 3]);
      const segment2Data = new Uint8Array([4, 5, 6]);

      let fetchCallCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          fetchCallCount++;
          if (url.includes('playlist')) {
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve(playlist),
            });
          } else if (url.includes('segment1')) {
            return Promise.resolve({
              ok: true,
              arrayBuffer: () => Promise.resolve(segment1Data.buffer),
            });
          } else if (url.includes('segment2')) {
            return Promise.resolve({
              ok: true,
              arrayBuffer: () => Promise.resolve(segment2Data.buffer),
            });
          }
          return Promise.reject(new Error('Unknown URL'));
        }),
      );

      const progressCallback = vi.fn();
      const result = await downloadSegmentsForMux(
        'https://example.com/playlist.m3u8',
        'video',
        progressCallback,
      );

      expect(result.isOk()).toBe(true);
      const data = result._unsafeUnwrap();
      expect(data.segments.length).toBe(2);
      expect(data.playlist).toContain('segment1.ts');
      expect(data.playlist).toContain('segment2.ts');
      expect(progressCallback).toHaveBeenCalled();
    });

    it('should handle EXT-X-MAP initialization segment', async () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MAP:URI="https://example.com/init.mp4"
#EXTINF:10.0,
https://example.com/segment1.ts
#EXT-X-ENDLIST`;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('playlist')) {
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve(playlist),
            });
          }
          return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
          });
        }),
      );

      const result = await downloadSegmentsForMux(
        'https://example.com/playlist.m3u8',
        'video',
        () => {},
      );

      expect(result.isOk()).toBe(true);
      const data = result._unsafeUnwrap();
      // Should have both init.mp4 and segment1.ts
      expect(data.segments.length).toBe(2);
      expect(data.playlist).toContain('URI="init.mp4"');
    });

    it('should handle EXT-X-KEY encryption key', async () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key.bin"
#EXTINF:10.0,
https://example.com/segment1.ts
#EXT-X-ENDLIST`;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('playlist')) {
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve(playlist),
            });
          }
          return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
          });
        }),
      );

      const result = await downloadSegmentsForMux(
        'https://example.com/playlist.m3u8',
        'video',
        () => {},
      );

      expect(result.isOk()).toBe(true);
      const data = result._unsafeUnwrap();
      expect(data.playlist).toContain('URI="key.bin"');
    });

    it('should handle relative URLs', async () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
segment2.ts
#EXT-X-ENDLIST`;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('playlist')) {
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve(playlist),
            });
          }
          return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
          });
        }),
      );

      const result = await downloadSegmentsForMux(
        'https://example.com/path/playlist.m3u8',
        'video',
        () => {},
      );

      expect(result.isOk()).toBe(true);
    });

    it('should resolve parent and root relative resource URLs', async () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MAP:URI="../init.mp4"
#EXTINF:10.0,
/segments/segment1.ts
#EXT-X-ENDLIST`;

      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('playlist')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(playlist),
          });
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await downloadSegmentsForMux(
        'https://example.com/path/media/playlist.m3u8',
        'video',
        () => {},
      );

      expect(result.isOk()).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/path/init.mp4', {
        credentials: 'include',
      });
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/segments/segment1.ts', {
        credentials: 'include',
      });
    });

    it('should return error when playlist fetch fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        }),
      );

      const result = await downloadSegmentsForMux(
        'https://example.com/playlist.m3u8',
        'video',
        () => {},
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('FETCH_ERROR');
    });

    it('should return error when no segments found', async () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-ENDLIST`;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(playlist),
        }),
      );

      const result = await downloadSegmentsForMux(
        'https://example.com/playlist.m3u8',
        'video',
        () => {},
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('UNKNOWN_ERROR');
      expect(result._unsafeUnwrapErr().message).toContain('No segments');
    });

    it('should return error when segment fetch fails', async () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
https://example.com/segment1.ts
#EXT-X-ENDLIST`;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('playlist')) {
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve(playlist),
            });
          }
          // Segment fetch fails
          return Promise.resolve({
            ok: false,
            status: 500,
          });
        }),
      );

      const result = await downloadSegmentsForMux(
        'https://example.com/playlist.m3u8',
        'video',
        () => {},
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('FETCH_ERROR');
    });

    it('should handle fetch exception', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await downloadSegmentsForMux(
        'https://example.com/playlist.m3u8',
        'video',
        () => {},
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('FETCH_ERROR');
    });
  });

  describe('downloadSegments (legacy)', () => {
    it('should concatenate segments into single Uint8Array', async () => {
      const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10.0,
https://example.com/segment1.ts
#EXTINF:10.0,
https://example.com/segment2.ts
#EXT-X-ENDLIST`;

      const segment1Data = new Uint8Array([1, 2, 3]);
      const segment2Data = new Uint8Array([4, 5, 6]);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('playlist')) {
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve(playlist),
            });
          } else if (url.includes('segment1')) {
            return Promise.resolve({
              ok: true,
              arrayBuffer: () => Promise.resolve(segment1Data.buffer),
            });
          } else if (url.includes('segment2')) {
            return Promise.resolve({
              ok: true,
              arrayBuffer: () => Promise.resolve(segment2Data.buffer),
            });
          }
          return Promise.reject(new Error('Unknown URL'));
        }),
      );

      const result = await downloadSegments('https://example.com/playlist.m3u8', () => {});

      expect(result.isOk()).toBe(true);
      const data = result._unsafeUnwrap();
      expect(data).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    it('should propagate errors from downloadSegmentsForMux', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await downloadSegments('https://example.com/playlist.m3u8', () => {});

      expect(result.isErr()).toBe(true);
    });
  });
});
