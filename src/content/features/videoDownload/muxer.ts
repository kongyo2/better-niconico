/**
 * FFmpeg Muxer - Direct content script FFmpeg execution
 * Based on nico_downloader's approach: M3U8 → FFmpeg → MP4
 *
 * Key insight from DeepWiki: nico_downloader uses single M3U8 input with
 * original filenames extracted from URLs, not combined M3U8 playlists.
 */

// Global FFmpeg core instance
let ffmpegCore: any = null;

// Result storage for FFMPEG_END callback
let pendingResult: {
  outputFile: string;
  resolve: ((value: Uint8Array) => void) | null;
  reject: ((error: Error) => void) | null;
} = {
  outputFile: '',
  resolve: null,
  reject: null,
};

/**
 * Wait for ffmpeg-core2.js to be loaded (injected via manifest content_scripts)
 */
async function waitForFFmpegScript(): Promise<void> {
  if ((window as any).createFFmpegCore) {
    return;
  }

  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50;

    const check = () => {
      if ((window as any).createFFmpegCore) {
        resolve();
      } else if (attempts++ < maxAttempts) {
        setTimeout(check, 100);
      } else {
        reject(new Error('FFmpeg script not loaded.'));
      }
    };
    check();
  });
}

/**
 * Initialize FFmpeg core with FFMPEG_END callback
 */
async function initFFmpeg(): Promise<any> {
  if (ffmpegCore) return ffmpegCore;

  await waitForFFmpegScript();

  const createFFmpegCore = (window as any).createFFmpegCore;
  if (!createFFmpegCore) {
    throw new Error('FFmpeg core not loaded.');
  }

  console.log('[FFmpeg] Initializing...');

  ffmpegCore = await createFFmpegCore({
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
            pendingResult.reject(e as Error);
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
  });

  console.log('[FFmpeg] Initialized');
  return ffmpegCore;
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
export async function muxWithPlaylist(
  videoPlaylist: string,
  videoSegments: { name: string; data: Uint8Array }[],
  audioPlaylist: string,
  audioSegments: { name: string; data: Uint8Array }[],
  outputFilename: string = 'output.mp4',
): Promise<Uint8Array> {
  const core = await initFFmpeg();

  console.log('[FFmpeg] Writing segment files to FS...');
  console.log(
    `[FFmpeg] Video segments: ${videoSegments.length}, Audio segments: ${audioSegments.length}`,
  );

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
  } catch (fsError) {
    console.error('[FFmpeg] FS write error:', fsError);
    throw new Error(`FS error: ${fsError instanceof Error ? fsError.message : String(fsError)}`);
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
        reject(new Error('FFmpeg timeout - no valid output'));
      }
    }, 10000); // 10 second timeout
  });

  const result = await Promise.race([resultPromise, timeoutPromise]);

  // Cleanup
  try {
    for (const seg of videoSegments) core.FS.unlink(seg.name);
    for (const seg of audioSegments) core.FS.unlink(seg.name);
    core.FS.unlink('video.m3u8');
    core.FS.unlink('audio.m3u8');
    core.FS.unlink('master.m3u8');
    core.FS.unlink(outputFilename);
  } catch (e) {
    /* ignore cleanup errors */
  }

  console.log('[FFmpeg] Muxing complete, size:', result.length);
  return result;
}

/**
 * Legacy function for backwards compatibility
 */
export async function muxToMp4(
  videoData: Uint8Array,
  audioData: Uint8Array,
  outputFilename: string = 'output.mp4',
): Promise<Uint8Array> {
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
