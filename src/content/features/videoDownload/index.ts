import { createDownloadButton, insertDownloadButton, removeDownloadButton } from './ui';
import { getMasterUrl, getVariantStreams } from './stream';
import { downloadSegmentsForMux } from './fetcher';
import { saveAsFile } from './saver';
import { muxWithPlaylist } from './muxer';

let isDownloading = false;
let resourceTimingBufferConfigured = false;
let activeWatchPath = '';
let activeWatchStartedAt = 0;

const RESOURCE_TIMING_BUFFER_SIZE = 5000;
const WATCH_ROUTE_CHANGE_LOOKBACK_MS = 3000;

interface WatchContext {
  videoId: string;
  playlistStartedAfter: number;
}

function configureResourceTimingBuffer(): void {
  if (resourceTimingBufferConfigured) {
    return;
  }

  performance.setResourceTimingBufferSize?.(RESOURCE_TIMING_BUFFER_SIZE);
  resourceTimingBufferConfigured = true;
}

function getVideoIdFromPath(pathname: string): string {
  const match = pathname.match(/\/([^/]+)\/?$/);
  return decodeURIComponent(match?.[1] ?? 'video');
}

function getWatchContext(): WatchContext | null {
  const { pathname } = window.location;
  if (!pathname.startsWith('/watch/')) {
    return null;
  }

  if (pathname !== activeWatchPath) {
    activeWatchStartedAt =
      activeWatchPath === '' ? 0 : Math.max(0, performance.now() - WATCH_ROUTE_CHANGE_LOOKBACK_MS);
    activeWatchPath = pathname;
  }

  return {
    videoId: getVideoIdFromPath(pathname),
    playlistStartedAfter: activeWatchStartedAt,
  };
}

async function handleDownload() {
  if (isDownloading) {
    alert('ダウンロードは既に進行中です。完了するまでお待ちください。');
    return;
  }

  isDownloading = true;
  console.log('[BetterNiconico] Download started.');

  try {
    configureResourceTimingBuffer();
    const watchContext = getWatchContext();
    const videoId = watchContext?.videoId ?? 'video';

    // 1. Get Master URL
    const masterUrlResult = getMasterUrl({
      minStartTime: watchContext?.playlistStartedAfter ?? 0,
    });
    if (masterUrlResult.isErr()) {
      throw masterUrlResult.error;
    }
    const masterUrl = masterUrlResult.value;
    console.log('[BetterNiconico] Master URL found:', masterUrl);

    // 2. Get Variants
    const streamsResult = await getVariantStreams(masterUrl);
    if (streamsResult.isErr()) {
      throw streamsResult.error;
    }
    const streams = streamsResult.value;
    console.log('[BetterNiconico] Streams parsed:', streams);

    // 3. Download Segments with M3U8 info for FFmpeg
    const videoTask = downloadSegmentsForMux(streams.video.url, 'video', (p) => {
      console.log(`[BetterNiconico] Video Progress: ${(p * 100).toFixed(1)}%`);
    });
    const audioTask = downloadSegmentsForMux(streams.audio.url, 'audio', (p) => {
      console.log(`[BetterNiconico] Audio Progress: ${(p * 100).toFixed(1)}%`);
    });

    const [videoResult, audioResult] = await Promise.all([videoTask, audioTask]);

    if (videoResult.isErr()) throw videoResult.error;
    if (audioResult.isErr()) throw audioResult.error;

    console.log('[BetterNiconico] Segments downloaded. Muxing with M3U8 approach...');
    console.log('[BetterNiconico] Video segments:', videoResult.value.segments.length);
    console.log('[BetterNiconico] Audio segments:', audioResult.value.segments.length);

    // 4. Mux using M3U8 playlist approach (like nico_downloader)
    const muxResult = await muxWithPlaylist(
      videoResult.value.playlist,
      videoResult.value.segments,
      audioResult.value.playlist,
      audioResult.value.segments,
      `${videoId}.mp4`,
    );

    if (muxResult.isErr()) throw muxResult.error;
    const muxedData = muxResult.value;

    // 5. Save MP4
    saveAsFile(muxedData, `${videoId}.mp4`, 'video/mp4');

    console.log('[BetterNiconico] Download complete!');
    alert('ダウンロードが完了しました！');
  } catch (e: unknown) {
    console.error('[BetterNiconico] Download failed:', e);
    let msg = '不明なエラーが発生しました';
    if (e instanceof Error) {
      msg = e.message;
    } else if (typeof e === 'object' && e !== null) {
      const errObj = e as { message?: string; type?: string };
      if (errObj.message) msg = errObj.message;
      if (errObj.type && errObj.message) msg = `[${errObj.type}] ${errObj.message}`;
    }
    alert(`ダウンロードに失敗しました: ${msg}`);
  } finally {
    isDownloading = false;
  }
}

export function apply(enabled: boolean): void {
  configureResourceTimingBuffer();
  const watchContext = getWatchContext();

  if (enabled) {
    if (watchContext) {
      const button = createDownloadButton(handleDownload);
      insertDownloadButton(button);
    }
  } else {
    removeDownloadButton();
  }
}
