/**
 * Video Downloader Feature
 * Downloads HLS streaming videos from Niconico using FFmpeg.wasm
 *
 * @module videoDownloader
 * @page /watch/* only
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { Parser } from 'm3u8-parser';
import { Result, ok, err } from 'neverthrow';
import type { DownloadError, PageError } from '@/types/errors';
import {
  hlsUrlNotFoundError,
  m3u8ParseFailedError,
  segmentDownloadFailedError,
  ffmpegEncodeFailedError,
  domElementNotFoundError,
} from '@/types/errors';

const FEATURE_NAME = '[Better Niconico - Video Downloader]';
const BUTTON_MARKER = 'data-bn-download-button';

// FFmpeg singleton instance
let ffmpegInstance: FFmpeg | null = null;
let isFFmpegLoading = false;

// Download state
interface DownloadState {
  isDownloading: boolean;
  currentVideoId: string;
  progress: number;
}

const downloadState: DownloadState = {
  isDownloading: false,
  currentVideoId: '',
  progress: 0,
};

/**
 * Check if current page is a watch page
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * Get video ID from current URL
 */
function getVideoId(): Result<string, PageError> {
  const match = window.location.pathname.match(/\/watch\/([^/?]+)/);
  if (!match || !match[1]) {
    return err(domElementNotFoundError('Video ID not found in URL', window.location.pathname));
  }
  return ok(match[1]);
}

/**
 * Extract HLS master URL from system messages
 * Uses pattern from reference implementation: nico_downloader
 */
function extractHLSUrl(): Result<string, DownloadError> {
  // Debug: Log all potential message containers
  console.log(`${FEATURE_NAME} Searching for HLS URL in system messages...`);

  // Pattern 1: Reference implementation (nico_downloader)
  // CSS: SystemMessageContainer-info
  // Pattern: 動画の読み込みを開始しました。（URL）
  const refMessages = document.getElementsByClassName('SystemMessageContainer-info');
  console.log(`${FEATURE_NAME} Found ${refMessages.length} SystemMessageContainer-info elements`);

  for (let i = 0; i < refMessages.length; i++) {
    const text = refMessages[i].textContent || '';
    console.log(`${FEATURE_NAME} Message ${i}:`, text.substring(0, 100));

    if (text.match(/(動画の読み込みを開始しました。).*/)) {
      // Extract URL by removing prefix and closing parenthesis
      const url = text.replace('動画の読み込みを開始しました。（', '').replace('）', '');
      if (url.startsWith('https://')) {
        console.log(`${FEATURE_NAME} Found HLS URL (ref pattern):`, url);
        return ok(url);
      }
    }
  }

  // Pattern 2: Fallback to previous implementation
  // CSS: .c_monotone\.L80
  // Pattern: 動画の初期化処理が完了しました (URL)
  const fallbackMessages = document.querySelectorAll('.c_monotone\\.L80');
  console.log(`${FEATURE_NAME} Found ${fallbackMessages.length} .c_monotone.L80 elements (fallback)`);

  for (const message of fallbackMessages) {
    const text = message.textContent || '';
    const match = text.match(/動画の初期化処理が完了しました \((https:\/\/[^)]+)\)/);
    if (match && match[1]) {
      console.log(`${FEATURE_NAME} Found HLS URL (fallback pattern):`, match[1]);
      return ok(match[1]);
    }
  }

  // Pattern 3: Generic search for any URLs in system-like messages
  const genericMessages = document.querySelectorAll('[class*="Message"], [class*="message"], [class*="System"], [class*="system"]');
  console.log(`${FEATURE_NAME} Found ${genericMessages.length} generic message elements`);

  for (const message of genericMessages) {
    const text = message.textContent || '';
    // Look for delivery.domand.nicovideo.jp URLs
    const urlMatch = text.match(/https:\/\/delivery\.domand\.nicovideo\.jp\/[^\s)）]+/);
    if (urlMatch) {
      console.log(`${FEATURE_NAME} Found HLS URL (generic pattern):`, urlMatch[0]);
      return ok(urlMatch[0]);
    }
  }

  console.error(`${FEATURE_NAME} No HLS URL found. Checked ${refMessages.length + fallbackMessages.length + genericMessages.length} message elements.`);
  return err(hlsUrlNotFoundError('HLS URL not found in system messages. Please ensure the video has loaded.'));
}

/**
 * Download text content with credentials
 */
async function downloadTextWithCredentials(url: string): Promise<Result<string, DownloadError>> {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      return err(
        segmentDownloadFailedError(
          `Failed to download: ${response.status} ${response.statusText}`,
          url,
        ),
      );
    }
    const text = await response.text();
    return ok(text);
  } catch (error) {
    return err(segmentDownloadFailedError('Network error during download', url, error));
  }
}

/**
 * Download binary segment with credentials
 */
async function downloadSegment(url: string): Promise<Result<Uint8Array, DownloadError>> {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      return err(
        segmentDownloadFailedError(
          `Failed to download segment: ${response.status} ${response.statusText}`,
          url,
        ),
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return ok(new Uint8Array(arrayBuffer));
  } catch (error) {
    return err(segmentDownloadFailedError('Network error during segment download', url, error));
  }
}

/**
 * Parse M3U8 playlist
 */
function parseM3U8(content: string): Result<Parser, DownloadError> {
  try {
    const parser = new Parser();
    parser.push(content);
    parser.end();
    return ok(parser);
  } catch (error) {
    return err(m3u8ParseFailedError('Failed to parse M3U8 playlist', error));
  }
}

/**
 * Initialize FFmpeg instance
 */
async function initFFmpeg(): Promise<Result<FFmpeg, DownloadError>> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ok(ffmpegInstance);
  }

  if (isFFmpegLoading) {
    // Wait for ongoing initialization with timeout
    const result = await Promise.race([
      new Promise<FFmpeg>((resolve) => {
        const checkInterval = setInterval(() => {
          if (ffmpegInstance && ffmpegInstance.loaded) {
            clearInterval(checkInterval);
            resolve(ffmpegInstance);
          }
        }, 100);
      }),
      new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('FFmpeg initialization timeout')), 30000);
      }),
    ]).catch(() => null);

    if (result) {
      return ok(result);
    }
    return err(ffmpegEncodeFailedError('FFmpeg initialization timeout', null));
  }

  isFFmpegLoading = true;

  try {
    const ffmpeg = new FFmpeg();

    // Set up logging
    ffmpeg.on('log', ({ message }) => {
      console.log(`${FEATURE_NAME} FFmpeg:`, message);
    });

    // Set up progress tracking
    ffmpeg.on('progress', ({ progress, time }) => {
      downloadState.progress = Math.round(progress * 100);
      console.log(`${FEATURE_NAME} Encoding progress: ${downloadState.progress}% (${time}s)`);
      updateButtonText(`変換中 ${downloadState.progress}%`);
    });

    // Load FFmpeg core
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    isFFmpegLoading = false;

    console.log(`${FEATURE_NAME} FFmpeg loaded successfully`);
    return ok(ffmpeg);
  } catch (error) {
    isFFmpegLoading = false;
    return err(ffmpegEncodeFailedError('Failed to initialize FFmpeg', error));
  }
}

/**
 * Get video title from page
 */
function getVideoTitle(): string {
  const titleElement = document.querySelector('.fs_xl.fw_bold');
  if (titleElement) {
    return titleElement.textContent?.trim() || 'video';
  }
  return 'video';
}

/**
 * Update download button text
 */
function updateButtonText(text: string): void {
  const button = document.querySelector(`[${BUTTON_MARKER}]`) as HTMLButtonElement;
  if (button) {
    const textSpan = button.querySelector('span:last-child');
    if (textSpan) {
      textSpan.textContent = text;
    }
  }
}

/**
 * Create download button in player control bar
 */
function createDownloadButton(): Result<HTMLButtonElement, PageError> {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return err(domElementNotFoundError('Player area not found', '.grid-area_[player]'));
  }

  // Find fullscreen button to insert before it
  const fullscreenButton = Array.from(playerArea.querySelectorAll('button')).find(
    (btn) => btn.getAttribute('aria-label') === '全画面表示する',
  );

  if (!fullscreenButton || !fullscreenButton.parentElement) {
    return err(
      domElementNotFoundError(
        'Fullscreen button or its parent not found',
        'button[aria-label="全画面表示する"]',
      ),
    );
  }

  const controlBarButtonGroup = fullscreenButton.parentElement;

  // Check if button already exists
  const existingButton = controlBarButtonGroup.querySelector(`[${BUTTON_MARKER}]`);
  if (existingButton) {
    return ok(existingButton as HTMLButtonElement);
  }

  // Create download button
  const button = document.createElement('button');
  button.className = 'Pressable cursor_pointer';
  button.style.color = '#FFFFFF';
  button.setAttribute('aria-label', 'ダウンロード');
  button.setAttribute(BUTTON_MARKER, 'true');

  // SVG download icon (arrow down to tray)
  button.innerHTML = `
    <div class="d_flex ai_center jc_center gap_x0_5">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 28px; height: 28px;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      <span>保存</span>
    </div>
  `;

  // Add click handler
  button.addEventListener('click', async () => {
    if (downloadState.isDownloading) {
      console.log(`${FEATURE_NAME} Download already in progress`);
      return;
    }
    await handleDownloadClick();
  });

  // Insert button before fullscreen button
  controlBarButtonGroup.insertBefore(button, fullscreenButton);

  console.log(`${FEATURE_NAME} Download button created`);
  return ok(button);
}

/**
 * Remove download button
 */
function removeDownloadButton(): void {
  const button = document.querySelector(`[${BUTTON_MARKER}]`);
  if (button) {
    button.remove();
    console.log(`${FEATURE_NAME} Download button removed`);
  }
}

/**
 * Handle download button click
 */
async function handleDownloadClick(): Promise<void> {
  console.log(`${FEATURE_NAME} Download initiated`);

  downloadState.isDownloading = true;
  downloadState.progress = 0;
  updateButtonText('処理開始');

  const videoIdResult = getVideoId();
  if (videoIdResult.isErr()) {
    console.error(`${FEATURE_NAME} ${videoIdResult.error.message}`);
    updateButtonText('エラー');
    downloadState.isDownloading = false;
    return;
  }

  downloadState.currentVideoId = videoIdResult.value;
  const videoTitle = getVideoTitle();

  // Extract HLS URL
  updateButtonText('URL取得中');
  const hlsUrlResult = extractHLSUrl();
  if (hlsUrlResult.isErr()) {
    console.error(`${FEATURE_NAME} ${hlsUrlResult.error.message}`);
    updateButtonText('URL取得失敗');
    downloadState.isDownloading = false;
    return;
  }

  const masterUrl = hlsUrlResult.value;

  // Download master playlist
  updateButtonText('プレイリスト取得中');
  const masterContentResult = await downloadTextWithCredentials(masterUrl);
  if (masterContentResult.isErr()) {
    console.error(`${FEATURE_NAME} ${masterContentResult.error.message}`);
    updateButtonText('取得失敗');
    downloadState.isDownloading = false;
    return;
  }

  // Parse master playlist
  const masterParserResult = parseM3U8(masterContentResult.value);
  if (masterParserResult.isErr()) {
    console.error(`${FEATURE_NAME} ${masterParserResult.error.message}`);
    updateButtonText('解析失敗');
    downloadState.isDownloading = false;
    return;
  }

  const masterParser = masterParserResult.value;
  console.log(`${FEATURE_NAME} Master playlist:`, masterParser.manifest);

  // Get audio and video URLs
  const audioUrl = masterParser.manifest.mediaGroups?.AUDIO?.audio?.main?.uri;
  const videoUrl = masterParser.manifest.playlists?.[0]?.uri;

  if (!audioUrl || !videoUrl) {
    console.error(`${FEATURE_NAME} Audio or video URL not found in master playlist`);
    updateButtonText('URL抽出失敗');
    downloadState.isDownloading = false;
    return;
  }

  console.log(`${FEATURE_NAME} Audio URL:`, audioUrl);
  console.log(`${FEATURE_NAME} Video URL:`, videoUrl);

  // Download audio and video playlists
  updateButtonText('音声/映像情報取得中');
  const [audioContentResult, videoContentResult] = await Promise.all([
    downloadTextWithCredentials(audioUrl),
    downloadTextWithCredentials(videoUrl),
  ]);

  if (audioContentResult.isErr() || videoContentResult.isErr()) {
    console.error(`${FEATURE_NAME} Failed to download audio/video playlists`);
    updateButtonText('取得失敗');
    downloadState.isDownloading = false;
    return;
  }

  // Parse audio and video playlists
  const audioParserResult = parseM3U8(audioContentResult.value);
  const videoParserResult = parseM3U8(videoContentResult.value);

  if (audioParserResult.isErr() || videoParserResult.isErr()) {
    console.error(`${FEATURE_NAME} Failed to parse audio/video playlists`);
    updateButtonText('解析失敗');
    downloadState.isDownloading = false;
    return;
  }

  const audioParser = audioParserResult.value;
  const videoParser = videoParserResult.value;

  // Collect all segment URLs
  const audioSegments = audioParser.manifest.segments || [];
  const videoSegments = videoParser.manifest.segments || [];

  console.log(
    `${FEATURE_NAME} Audio segments: ${audioSegments.length}, Video segments: ${videoSegments.length}`,
  );

  // Download segments
  updateButtonText(`セグメント取得中 0/${audioSegments.length + videoSegments.length}`);

  // Download audio init and segments
  const audioInitUrl = audioParser.manifest.segments?.[0]?.map?.uri;
  const videoInitUrl = videoParser.manifest.segments?.[0]?.map?.uri;

  let downloadedCount = 0;
  const totalSegments = audioSegments.length + videoSegments.length + 2; // +2 for init segments

  // Initialize FFmpeg
  updateButtonText('FFmpeg初期化中');
  const ffmpegResult = await initFFmpeg();
  if (ffmpegResult.isErr()) {
    console.error(`${FEATURE_NAME} ${ffmpegResult.error.message}`);
    updateButtonText('初期化失敗');
    downloadState.isDownloading = false;
    return;
  }

  const ffmpeg = ffmpegResult.value;

  // Download and write init segments
  if (audioInitUrl) {
    const initResult = await downloadSegment(audioInitUrl);
    if (initResult.isOk()) {
      await ffmpeg.writeFile('audio_init.mp4', initResult.value);
      downloadedCount++;
      updateButtonText(`セグメント取得中 ${downloadedCount}/${totalSegments}`);
    }
  }

  if (videoInitUrl) {
    const initResult = await downloadSegment(videoInitUrl);
    if (initResult.isOk()) {
      await ffmpeg.writeFile('video_init.mp4', initResult.value);
      downloadedCount++;
      updateButtonText(`セグメント取得中 ${downloadedCount}/${totalSegments}`);
    }
  }

  // Download audio segments (parallel with batching to manage memory)
  const audioDownloadPromises = audioSegments.map(async (segment, i) => {
    if (segment.uri) {
      const segmentResult = await downloadSegment(segment.uri);
      if (segmentResult.isOk()) {
        await ffmpeg.writeFile(`audio_seg_${i}.m4s`, segmentResult.value);
        downloadedCount++;
        if (downloadedCount % 10 === 0 || downloadedCount === totalSegments) {
          updateButtonText(`セグメント取得中 ${downloadedCount}/${totalSegments}`);
        }
      }
    }
  });

  // Download video segments (parallel with batching to manage memory)
  const videoDownloadPromises = videoSegments.map(async (segment, i) => {
    if (segment.uri) {
      const segmentResult = await downloadSegment(segment.uri);
      if (segmentResult.isOk()) {
        await ffmpeg.writeFile(`video_seg_${i}.m4s`, segmentResult.value);
        downloadedCount++;
        if (downloadedCount % 10 === 0 || downloadedCount === totalSegments) {
          updateButtonText(`セグメント取得中 ${downloadedCount}/${totalSegments}`);
        }
      }
    }
  });

  // Wait for all downloads to complete
  await Promise.all([...audioDownloadPromises, ...videoDownloadPromises]);

  console.log(`${FEATURE_NAME} All segments downloaded`);

  // Create concat lists
  let audioConcat = 'file audio_init.mp4\n';
  for (let i = 0; i < audioSegments.length; i++) {
    audioConcat += `file audio_seg_${i}.m4s\n`;
  }

  let videoConcat = 'file video_init.mp4\n';
  for (let i = 0; i < videoSegments.length; i++) {
    videoConcat += `file video_seg_${i}.m4s\n`;
  }

  await ffmpeg.writeFile('audio_list.txt', audioConcat);
  await ffmpeg.writeFile('video_list.txt', videoConcat);

  // Merge segments
  updateButtonText('変換中 0%');

  try {
    // Concatenate audio segments
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'audio_list.txt', '-c', 'copy', 'audio.m4a']);

    // Concatenate video segments
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'video_list.txt', '-c', 'copy', 'video.m4v']);

    // Merge audio and video
    await ffmpeg.exec(['-i', 'video.m4v', '-i', 'audio.m4a', '-c', 'copy', 'output.mp4']);

    // Read output file
    const data = await ffmpeg.readFile('output.mp4');

    // Save file
    updateButtonText('保存中');
    const blob = new Blob([data], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${videoTitle}_${downloadState.currentVideoId}.mp4`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    console.log(`${FEATURE_NAME} Download completed successfully`);
    updateButtonText('保存完了');

    // Reset after 3 seconds
    setTimeout(() => {
      updateButtonText('保存');
      downloadState.isDownloading = false;
    }, 3000);
  } catch (error) {
    console.error(`${FEATURE_NAME} FFmpeg encoding failed:`, error);
    updateButtonText('変換失敗');
    downloadState.isDownloading = false;
  }
}

/**
 * Apply video download feature
 * @param enabled - Whether the feature should be enabled
 */
export function apply(enabled: boolean): void {
  if (!isWatchPage()) {
    removeDownloadButton();
    return;
  }

  if (enabled) {
    const result = createDownloadButton();
    if (result.isErr()) {
      console.error(`${FEATURE_NAME} ${result.error.message}`);
    }
  } else {
    removeDownloadButton();
  }
}
