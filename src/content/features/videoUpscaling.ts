/**
 * Anime4K-WebGPUを使用した動画アップスケーリング機能
 * watch ページでのみ動作します
 * 
 * 参考: https://github.com/Anime4KWebBoost/Anime4K-WebGPU
 */

import { render, ModeA } from 'anime4k-webgpu';

// 処理済みマーカー属性
const UPSCALING_MARKER = 'data-bn-upscaling';
const UPSCALING_ACTIVE = 'active';
const UPSCALING_INACTIVE = 'inactive';

// Canvas要素のID
const CANVAS_ID = 'bn-upscaled-canvas';
const CANVAS_MARKER = 'data-bn-canvas';

// WebGPU対応状態のキャッシュ（初回チェック後は再利用）
let webGPUSupportCache: boolean | null = null;

/**
 * 動画視聴ページかどうかを判定
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * WebGPU対応ブラウザかどうかを判定（結果をキャッシュ）
 */
async function isWebGPUSupported(): Promise<boolean> {
  // キャッシュがあればそれを返す
  if (webGPUSupportCache !== null) {
    return webGPUSupportCache;
  }

  if (!navigator.gpu) {
    console.warn('[Better Niconico] WebGPU is not supported in this browser');
    webGPUSupportCache = false;
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.warn('[Better Niconico] WebGPU adapter not available');
      webGPUSupportCache = false;
      return false;
    }
    webGPUSupportCache = true;
    return true;
  } catch (error) {
    console.warn('[Better Niconico] WebGPU initialization failed:', error);
    webGPUSupportCache = false;
    return false;
  }
}

/**
 * 動画要素を取得
 */
function getVideoElement(): HTMLVideoElement | null {
  // ニコニコ動画のvideo要素を探す
  const videos = Array.from(document.querySelectorAll('video'));

  // プレイヤーエリア内のvideo要素を優先
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (playerArea) {
    const videoInPlayer = playerArea.querySelector('video') as HTMLVideoElement;
    if (videoInPlayer) {
      return videoInPlayer;
    }
  }

  // フォールバック: 最初のvideo要素
  if (videos.length > 0) {
    return videos[0];
  }

  return null;
}

/**
 * Canvas要素を作成してvideo要素と同じ位置に配置
 */
function createUpscaledCanvas(video: HTMLVideoElement): HTMLCanvasElement {
  let canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.setAttribute(CANVAS_MARKER, 'true');

    // videoの親要素に挿入
    if (video.parentElement) {
      video.parentElement.insertBefore(canvas, video.nextSibling);
    }
  }

  // canvasのサイズとスタイルを設定
  const computedStyle = window.getComputedStyle(video);

  // 2倍のアップスケーリング（ModeAが自動的に最適な倍率を選択）
  const targetWidth = video.videoWidth * 2;
  const targetHeight = video.videoHeight * 2;

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // videoと同じスタイルを適用してレイアウトを維持
  canvas.style.cssText = `
    position: ${video.style.position || 'relative'};
    width: ${computedStyle.width};
    height: ${computedStyle.height};
    object-fit: ${computedStyle.objectFit || 'contain'};
    display: block;
    max-width: 100%;
    max-height: 100%;
  `;

  // videoのクラスをコピー（レイアウトを維持）
  canvas.className = video.className;

  return canvas;
}

/**
 * 動画がロード完了するまで待機
 */
async function waitForVideoReady(video: HTMLVideoElement): Promise<boolean> {
  // すでにロード済みの場合
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    return true;
  }

  // ロード完了を待機（タイムアウト付き）
  return new Promise<boolean>((resolve) => {
    const handler = () => {
      video.removeEventListener('loadeddata', handler);
      if (video.videoWidth && video.videoHeight) {
        resolve(true);
      } else {
        resolve(false);
      }
    };
    video.addEventListener('loadeddata', handler);

    // タイムアウト（10秒）
    setTimeout(() => {
      video.removeEventListener('loadeddata', handler);
      resolve(false);
    }, 10000);
  });
}

/**
 * アップスケーリングを有効化
 */
async function enableUpscaling(): Promise<void> {
  if (!isWatchPage()) {
    return;
  }

  const video = getVideoElement();
  if (!video) {
    return; // 動画要素が見つからない場合は静かに終了（MutationObserverで再試行される）
  }

  // すでに有効化されている場合は何もしない（冪等性）
  if (video.getAttribute(UPSCALING_MARKER) === UPSCALING_ACTIVE) {
    return;
  }

  // WebGPU対応チェック（キャッシュされる）
  const gpuSupported = await isWebGPUSupported();
  if (!gpuSupported) {
    console.error('[Better Niconico] Video upscaling requires WebGPU support');
    return;
  }

  // 動画がロードされるまで待機
  const videoReady = await waitForVideoReady(video);
  if (!videoReady) {
    console.warn('[Better Niconico] Video dimensions not available after timeout');
    return;
  }

  try {
    const canvas = createUpscaledCanvas(video);

    console.log('[Better Niconico] Starting video upscaling with Anime4K-WebGPU', {
      nativeResolution: `${video.videoWidth}x${video.videoHeight}`,
      targetResolution: `${canvas.width}x${canvas.height}`,
    });

    // Anime4K-WebGPUのrender関数でアップスケーリングを開始
    // ModeAプリセット: Clamp Highlights → Restore (CNNVL) → Upscale (CNNx2VL/CNNx2M)
    await render({
      video,
      canvas,
      pipelineBuilder: (device, inputTexture) => {
        return [
          new ModeA({
            device,
            inputTexture,
            nativeDimensions: {
              width: video.videoWidth,
              height: video.videoHeight,
            },
            targetDimensions: {
              width: canvas.width,
              height: canvas.height,
            },
          }),
        ];
      },
    });

    // video要素を非表示にしてcanvasを表示
    video.style.display = 'none';
    canvas.style.display = 'block';

    // マーカーを設定
    video.setAttribute(UPSCALING_MARKER, UPSCALING_ACTIVE);

    console.log('[Better Niconico] Video upscaling enabled successfully');
  } catch (error) {
    console.error('[Better Niconico] Failed to enable video upscaling:', error);

    // エラー時のクリーンアップ
    cleanupUpscaling(video);
  }
}

/**
 * アップスケーリングのクリーンアップ
 */
function cleanupUpscaling(video: HTMLVideoElement | null): void {
  // canvas要素を削除
  const canvas = document.getElementById(CANVAS_ID);
  if (canvas) {
    canvas.remove();
  }

  // video要素を再表示
  if (video) {
    video.style.display = '';
    video.setAttribute(UPSCALING_MARKER, UPSCALING_INACTIVE);
  }
}

/**
 * アップスケーリングを無効化
 */
function disableUpscaling(): void {
  const video = getVideoElement();
  cleanupUpscaling(video);
  console.log('[Better Niconico] Video upscaling disabled');
}

/**
 * 設定を適用する（冪等性を保証）
 * @param enabled - true: アップスケーリング有効, false: アップスケーリング無効
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    void enableUpscaling();
  } else {
    disableUpscaling();
  }
}
