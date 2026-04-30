/**
 * Tests for src/content/features/videoDownload/stream.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMasterUrl, getMasterUrlFromWatchApi, getVariantStreams } from './stream';

describe('videoDownload/stream', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    // Clear performance entries
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
  });

  describe('getMasterUrl', () => {
    it('should return master URL from performance API when available', () => {
      const mockEntry = {
        name: 'https://delivery.domand.nicovideo.jp/playlists/variants/master.m3u8',
        entryType: 'resource',
        startTime: 0,
        duration: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([mockEntry]);

      const result = getMasterUrl();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(
        'https://delivery.domand.nicovideo.jp/playlists/variants/master.m3u8',
      );
    });

    it('should prefer the newest master URL from performance API', () => {
      const oldEntry = {
        name: 'https://delivery.domand.nicovideo.jp/hlsbid/old/playlists/variants/old.m3u8',
        entryType: 'resource',
        startTime: 100,
        duration: 0,
        toJSON: () => ({}),
      };
      const currentEntry = {
        name: 'https://delivery.domand.nicovideo.jp/hlsbid/current/playlists/variants/current.m3u8',
        entryType: 'resource',
        startTime: 200,
        duration: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([oldEntry, currentEntry]);

      const result = getMasterUrl();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(
        'https://delivery.domand.nicovideo.jp/hlsbid/current/playlists/variants/current.m3u8',
      );
    });

    it('should ignore performance entries before minStartTime', () => {
      const oldEntry = {
        name: 'https://delivery.domand.nicovideo.jp/hlsbid/old/playlists/variants/old.m3u8',
        entryType: 'resource',
        startTime: 100,
        duration: 0,
        toJSON: () => ({}),
      };
      const currentEntry = {
        name: 'https://delivery.domand.nicovideo.jp/hlsbid/current/playlists/variants/current.m3u8',
        entryType: 'resource',
        startTime: 300,
        duration: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([oldEntry, currentEntry]);

      const result = getMasterUrl({ minStartTime: 200 });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(
        'https://delivery.domand.nicovideo.jp/hlsbid/current/playlists/variants/current.m3u8',
      );
    });

    it('should not return stale performance entries before minStartTime', () => {
      const oldEntry = {
        name: 'https://delivery.domand.nicovideo.jp/hlsbid/old/playlists/variants/old.m3u8',
        entryType: 'resource',
        startTime: 100,
        duration: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([oldEntry]);

      const result = getMasterUrl({ minStartTime: 200 });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('MASTER_URL_NOT_FOUND');
    });

    it('should fallback to any m3u8 URL if variant check fails', () => {
      const mockEntry = {
        name: 'https://example.com/video.m3u8',
        entryType: 'resource',
        startTime: 0,
        duration: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([mockEntry]);

      const result = getMasterUrl();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('https://example.com/video.m3u8');
    });

    it('should exclude media playlists from fallback', () => {
      const mockEntry = {
        name: 'https://example.com/playlists/media/stream.m3u8',
        entryType: 'resource',
        startTime: 0,
        duration: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([mockEntry]);

      const result = getMasterUrl();
      // Should fall through to DOM scraping
      expect(result.isErr()).toBe(true);
    });

    it('should extract URL from system message in DOM', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="c_monotone L80">動画の初期化処理が完了しました (https://delivery.domand.nicovideo.jp/video.m3u8)</div>
        </div>
      `;

      const result = getMasterUrl();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('https://delivery.domand.nicovideo.jp/video.m3u8');
    });

    it('should prefer the latest system message in DOM fallback', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="c_monotone L80">動画の初期化処理が完了しました (https://delivery.domand.nicovideo.jp/old.m3u8)</div>
          <div class="c_monotone L80">動画の初期化処理が完了しました (https://delivery.domand.nicovideo.jp/current.m3u8)</div>
        </div>
      `;

      const result = getMasterUrl();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('https://delivery.domand.nicovideo.jp/current.m3u8');
    });

    it('should ignore stale system messages outside the current player area', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="c_monotone L80">動画の初期化処理が完了しました (https://delivery.domand.nicovideo.jp/current.m3u8)</div>
        </div>
        <div class="c_monotone L80">動画の初期化処理が完了しました (https://delivery.domand.nicovideo.jp/stale.m3u8)</div>
      `;

      const result = getMasterUrl();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('https://delivery.domand.nicovideo.jp/current.m3u8');
    });

    it('should find URL in player area candidates', () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div>
            <span>動画の初期化処理が完了しました (https://delivery.domand.nicovideo.jp/test.m3u8)</span>
          </div>
        </div>
      `;

      const result = getMasterUrl();
      expect(result.isOk()).toBe(true);
    });

    it('should return error when no master URL found', () => {
      document.body.innerHTML = '<div>No video content</div>';

      const result = getMasterUrl();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('MASTER_URL_NOT_FOUND');
    });

    it('should return error when player area missing', () => {
      document.body.innerHTML = '<div>No player area</div>';

      const result = getMasterUrl();
      expect(result.isErr()).toBe(true);
    });
  });

  describe('getVariantStreams', () => {
    it('should parse M3U8 and return video and audio streams', async () => {
      const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Main",DEFAULT=YES,URI="https://example.com/audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio"
https://example.com/video_1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,AUDIO="audio"
https://example.com/video_720p.m3u8
`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(m3u8Content),
      });

      const result = await getVariantStreams('https://example.com/master.m3u8');

      expect(result.isOk()).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/master.m3u8', {
        credentials: 'include',
      });
      const streams = result._unsafeUnwrap();
      // Should select highest bandwidth video
      expect(streams.video.bandwidth).toBe(5000000);
      expect(streams.video.resolution).toBe('1920x1080');
      expect(streams.video.url).toBe('https://example.com/video_1080p.m3u8');
      // Should have audio
      expect(streams.audio.url).toBe('https://example.com/audio.m3u8');
    });

    it('should resolve relative stream URLs against the master playlist URL', async () => {
      const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Main",DEFAULT=YES,URI="../media/audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio"
video_1080p.m3u8
`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(m3u8Content),
      });

      const result = await getVariantStreams(
        'https://delivery.domand.nicovideo.jp/hlsbid/current/playlists/variants/master.m3u8',
      );

      expect(result.isOk()).toBe(true);
      const streams = result._unsafeUnwrap();
      expect(streams.video.url).toBe(
        'https://delivery.domand.nicovideo.jp/hlsbid/current/playlists/variants/video_1080p.m3u8',
      );
      expect(streams.audio.url).toBe(
        'https://delivery.domand.nicovideo.jp/hlsbid/current/playlists/media/audio.m3u8',
      );
    });

    it('should return error when fetch fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await getVariantStreams('https://example.com/master.m3u8');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('FETCH_ERROR');
    });

    it('should return error when no video streams found', async () => {
      const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Main",DEFAULT=YES,URI="https://example.com/audio.m3u8"
`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(m3u8Content),
      });

      const result = await getVariantStreams('https://example.com/master.m3u8');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('UNKNOWN_ERROR');
      expect(result._unsafeUnwrapErr().message).toContain('No video streams');
    });

    it('should return error when no audio streams found', async () => {
      const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
https://example.com/video_1080p.m3u8
`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(m3u8Content),
      });

      const result = await getVariantStreams('https://example.com/master.m3u8');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('UNKNOWN_ERROR');
      expect(result._unsafeUnwrapErr().message).toContain('No audio streams');
    });

    it('should handle fetch exception', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await getVariantStreams('https://example.com/master.m3u8');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('FETCH_ERROR');
    });

    it('should parse streams without resolution', async () => {
      const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Main",DEFAULT=YES,URI="https://example.com/audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000
https://example.com/video.m3u8
`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(m3u8Content),
      });

      const result = await getVariantStreams('https://example.com/master.m3u8');

      expect(result.isOk()).toBe(true);
      const streams = result._unsafeUnwrap();
      expect(streams.video.resolution).toBe('unknown');
    });
  });

  describe('getMasterUrlFromWatchApi', () => {
    it('should fetch a fresh master URL for the current video', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                response: {
                  client: { watchTrackId: 'track-1' },
                  media: {
                    domand: {
                      accessRightKey: 'access-key',
                      videos: [
                        { id: 'video-h264-360p', isAvailable: true, qualityLevel: 1 },
                        { id: 'video-h264-720p', isAvailable: true, qualityLevel: 3 },
                      ],
                      audios: [
                        { id: 'audio-aac-64kbps', isAvailable: true, qualityLevel: 0 },
                        { id: 'audio-aac-192kbps', isAvailable: true, qualityLevel: 1 },
                      ],
                    },
                  },
                },
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                contentUrl:
                  'https://delivery.domand.nicovideo.jp/hlsbid/current/playlists/variants/master.m3u8',
              },
            }),
        });
      globalThis.fetch = fetchMock;

      const result = await getMasterUrlFromWatchApi('sm12345');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(
        'https://delivery.domand.nicovideo.jp/hlsbid/current/playlists/variants/master.m3u8',
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://www.nicovideo.jp/watch/sm12345?responseType=json',
        { credentials: 'include' },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://nvapi.nicovideo.jp/v1/watch/sm12345/access-rights/hls?actionTrackId=track-1',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({
            'x-access-right-key': 'access-key',
            'x-request-with': 'nicovideo',
          }),
          body: JSON.stringify({
            outputs: [
              ['video-h264-720p', 'audio-aac-192kbps'],
              ['video-h264-720p', 'audio-aac-64kbps'],
              ['video-h264-360p', 'audio-aac-192kbps'],
              ['video-h264-360p', 'audio-aac-64kbps'],
            ],
          }),
        }),
      );
    });

    it('should return an error when current video access data is missing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { response: { media: { domand: {} } } } }),
      });

      const result = await getMasterUrlFromWatchApi('sm12345');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('MASTER_URL_NOT_FOUND');
    });
  });
});
