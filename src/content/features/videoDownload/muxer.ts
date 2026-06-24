/**
 * FFmpeg Muxer - Direct content script FFmpeg execution
 * Based on nico_downloader's approach: M3U8 → FFmpeg → MP4
 *
 * Key insight from DeepWiki: nico_downloader uses single M3U8 input with
 * original filenames extracted from URLs, not combined M3U8 playlists.
 */

import { ResultAsync, ok, err } from 'neverthrow';
import { DownloadResult, DownloadError } from './types';

// Global FFmpeg core instance
let ffmpegCore: any = null;

// Result storage for FFMPEG_END callback
let pendingResult: {
  outputFile: string;
  resolve: ((value: Uint8Array) => void) | null;
  reject: ((error: DownloadError) => void) | null;
} = {
  outputFile: '',
  resolve: null,
  reject: null,
};

/**
 * Wait for ffmpeg-core2.js to be loaded (injected via manifest content_scripts)
 */
function waitForFFmpegScript(): ResultAsync<void, DownloadError> {
  if ((window as any).createFFmpegCore) {
    return ResultAsync.fromSafePromise(Promise.resolve());
  }

  return ResultAsync.fromPromise(
    new Promise<void>((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50;

      const check = () => {
        if ((window as any).createFFmpegCore) {
          resolve();
        } else if (attempts++ < maxAttempts) {
          setTimeout(check, 100);
        } else {
          reject();
        }
      };
      check();
    }),
    (): DownloadError => ({
      type: 'FFMPEG_SCRIPT_NOT_LOADED',
      message: 'FFmpeg script not loaded.',
    }),
  );
}

/**
 * Initialize FFmpeg core with FFMPEG_END callback
 */
function initFFmpeg(): ResultAsync<any, DownloadError> {
  if (ffmpegCore) {
    return ResultAsync.fromSafePromise(Promise.resolve(ffmpegCore));
  }

  return waitForFFmpegScript().andThen(() => {
    const createFFmpegCore = (window as any).createFFmpegCore;
    if (!createFFmpegCore) {
      return err({
        type: 'FFMPEG_NOT_LOADED',
        message: 'FFmpeg core not loaded.',
      } as DownloadError);
    }

    console.log('[FFmpeg] Initializing...');

    return ResultAsync.fromPromise(
      createFFmpegCore({
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return chrome.runtime.getURL('ffmpeg/ffmpeg-core.wasm');
          }
          return path;
        },
        print: (msg: string) => {
          console.log('[FFmpeg]', msg);

          // Read output when FFMPEG_END is detected
          if (msg.startsWith('FFMPEG_END') && pendingResult.resolve) {
            try {
              const data = ffmpegCore.FS.readFile(pendingResult.outputFile) as Uint8Array;
              console.log('[FFmpeg] Output read in callback, size:', data.length);
              pendingResult.resolve(data);
            } catch (e) {
              console.error('[FFmpeg] Failed to read output:', e);
              if (pendingResult.reject) {
                pendingResult.reject({
                  type: 'FFMPEG_FS_ERROR',
                  message: 'Failed to read FFmpeg output',
                  cause: e,
                });
              }
            }
            pendingResult.resolve = null;
            pendingResult.reject = null;
          }
        },
        printErr: () => {
          // Suppress FFmpeg warnings (e.g., crypto segment warnings)
          // These don't affect functionality but would clutter user's console
        },
      }).then((core: any) => {
        ffmpegCore = core;
        console.log('[FFmpeg] Initialized');
        return core;
      }),
      (error): DownloadError => ({
        type: 'FFMPEG_ERROR',
        message: 'FFmpeg initialization failed',
        cause: error,
      }),
    );
  });
}

/**
 * Parse FFmpeg command arguments
 */
function parseArgs(core: any, args: string[]): [number, number] {
  const argsPtr = core._malloc(args.length * 4);
  args.forEach((s, idx) => {
    const buf = core._malloc(s.length + 1);
    core.writeAsciiToMemory(s, buf);
    core.setValue(argsPtr + 4 * idx, buf, 'i32');
  });
  return [args.length, argsPtr];
}

/**
 * Mux video and audio using M3U8 playlist approach (like nico_downloader)
 * Uses original filenames from URLs and modified M3U8 playlists
 */
export function muxWithPlaylist(
  videoPlaylist: string,
  videoSegments: { name: string; data: Uint8Array }[],
  audioPlaylist: string,
  audioSegments: { name: string; data: Uint8Array }[],
  outputFilename: string = 'output.mp4',
): ResultAsync<Uint8Array, DownloadError> {
  return initFFmpeg().andThen((core) => {
    console.log('[FFmpeg] Writing segment files to FS...');
    console.log(
      `[FFmpeg] Video segments: ${videoSegments.length}, Audio segments: ${audioSegments.length}`,
    );

    // Write files to FS
    const writeResult = writeFilesToFS(
      core,
      videoPlaylist,
      videoSegments,
      audioPlaylist,
      audioSegments,
    );
    if (writeResult.isErr()) {
      return err(writeResult.error);
    }

    console.log('[FFmpeg] Muxing with M3U8 input...');

    // Set up result promise
    const resultPromise = new Promise<Uint8Array>((resolve, reject) => {
      pendingResult.outputFile = outputFilename;
      pendingResult.resolve = resolve;
      pendingResult.reject = reject;
    });

    // Run FFmpeg with M3U8 input (like nico_downloader)
    const args = [
      'ffmpeg',
      '-nostdin',
      '-allowed_extensions',
      'ALL',
      '-i',
      'master.m3u8',
      '-c',
      'copy',
      '-y',
      outputFilename,
    ];

    console.log('[FFmpeg] Command:', args.join(' '));
    const [argc, argv] = parseArgs(core, args);

    try {
      core.ccall('main', 'number', ['number', 'number'], [argc, argv]);
    } catch (e) {
      console.log('[FFmpeg] Caught exit:', e);
    }

    // Wait for FFMPEG_END or timeout
    const timeoutPromise = new Promise<Uint8Array>((_, reject) => {
      setTimeout(() => {
        if (pendingResult.resolve) {
          // Try fallback read
          try {
            console.log('[FFmpeg] Timeout - attempting fallback read');
            const data = core.FS.readFile(outputFilename) as Uint8Array;
            console.log('[FFmpeg] Fallback read size:', data.length);
            if (data.length > 1000) {
              pendingResult.resolve(data);
              pendingResult.resolve = null;
              return;
            }
          } catch (e) {
            console.error('[FFmpeg] Fallback read failed:', e);
          }
          reject({
            type: 'FFMPEG_TIMEOUT',
            message: 'FFmpeg timeout - no valid output',
          } as DownloadError);
        }
      }, 10000); // 10 second timeout
    });

    return ResultAsync.fromPromise(
      Promise.race([resultPromise, timeoutPromise]).then((result) => {
        // Cleanup
        cleanupFS(core, videoSegments, audioSegments, outputFilename);
        console.log('[FFmpeg] Muxing complete, size:', result.length);
        return result;
      }),
      (error): DownloadError => {
        // Cleanup on error too
        cleanupFS(core, videoSegments, audioSegments, outputFilename);
        if (typeof error === 'object' && error !== null && 'type' in error) {
          return error as DownloadError;
        }
        return {
          type: 'FFMPEG_ERROR',
          message: 'FFmpeg muxing failed',
          cause: error,
        };
      },
    );
  });
}

/**
 * Write segment files and playlists to FFmpeg FS
 */
function writeFilesToFS(
  core: any,
  videoPlaylist: string,
  videoSegments: { name: string; data: Uint8Array }[],
  audioPlaylist: string,
  audioSegments: { name: string; data: Uint8Array }[],
): DownloadResult<void> {
  try {
    // Write video segments with original filenames
    for (let i = 0; i < videoSegments.length; i++) {
      const seg = videoSegments[i];
      console.log(`[FFmpeg] Writing: ${seg.name} (${seg.data.length} bytes)`);
      core.FS.writeFile(seg.name, seg.data);
    }

    // Write audio segments with original filenames
    for (let i = 0; i < audioSegments.length; i++) {
      const seg = audioSegments[i];
      console.log(`[FFmpeg] Writing: ${seg.name} (${seg.data.length} bytes)`);
      core.FS.writeFile(seg.name, seg.data);
    }

    // Write modified video playlist (with local filenames)
    console.log('[FFmpeg] Writing video.m3u8');
    core.FS.writeFile('video.m3u8', new TextEncoder().encode(videoPlaylist));

    // Write modified audio playlist (with local filenames)
    console.log('[FFmpeg] Writing audio.m3u8');
    core.FS.writeFile('audio.m3u8', new TextEncoder().encode(audioPlaylist));

    // Create master playlist that references both streams
    const masterPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="audio",DEFAULT=YES,URI="audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=0,AUDIO="audio"
video.m3u8`;

    console.log('[FFmpeg] Writing master.m3u8');
    core.FS.writeFile('master.m3u8', new TextEncoder().encode(masterPlaylist));

    return ok(undefined);
  } catch (fsError) {
    console.error('[FFmpeg] FS write error:', fsError);
    return err({
      type: 'FFMPEG_FS_ERROR',
      message: `FS error: ${fsError instanceof Error ? fsError.message : String(fsError)}`,
      cause: fsError,
    });
  }
}

/**
 * Cleanup filesystem after muxing
 */
function cleanupFS(
  core: any,
  videoSegments: { name: string; data: Uint8Array }[],
  audioSegments: { name: string; data: Uint8Array }[],
  outputFilename: string,
): void {
  try {
    for (const seg of videoSegments) core.FS.unlink(seg.name);
    for (const seg of audioSegments) core.FS.unlink(seg.name);
    core.FS.unlink('video.m3u8');
    core.FS.unlink('audio.m3u8');
    core.FS.unlink('master.m3u8');
    core.FS.unlink(outputFilename);
  } catch {
    /* ignore cleanup errors */
  }
}

/**
 * Legacy function for backwards compatibility
 */
export function muxToMp4(
  videoData: Uint8Array,
  audioData: Uint8Array,
  outputFilename: string = 'output.mp4',
): ResultAsync<Uint8Array, DownloadError> {
  console.warn('[FFmpeg] muxToMp4 called - use muxWithPlaylist for M3U8-based muxing');

  // Create simple wrapper
  return muxWithPlaylist(
    '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:0,\nvideo.ts',
    [{ name: 'video.ts', data: videoData }],
    '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:0,\naudio.ts',
    [{ name: 'audio.ts', data: audioData }],
    outputFilename,
  );
}
