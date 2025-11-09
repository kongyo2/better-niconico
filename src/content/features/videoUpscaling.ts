/**
 * Anime4K-WebGPUを使用した動画アップスケーリング機能
 * watch ページでのみ動作します
 */

import { render, ModeA } from 'anime4k-webgpu';

// 処理済みマーカー属性
const UPSCALING_MARKER = 'data-bn-upscaling';
const UPSCALING_ACTIVE = 'active';
const UPSCALING_INACTIVE = 'inactive';

// Canvas要素のID
const CANVAS_ID = 'bn-upscaled-canvas';
const CANVAS_MARKER = 'data-bn-canvas';

// アニメーションフレームID保存用
let renderAnimationFrameId: number | null = null;

/**
 * 動画視聴ページかどうかを判定
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * WebGPU対応ブラウザかどうかを判定
 */
async function isWebGPUSupported(): Promise<boolean> {
  if (!navigator.gpu) {
    console.warn('[Better Niconico] WebGPU is not supported in this browser');
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.warn('[Better Niconico] WebGPU adapter not available');
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[Better Niconico] WebGPU initialization failed:', error);
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

  // 2倍のアップスケーリング
  const targetWidth = video.videoWidth * 2;
  const targetHeight = video.videoHeight * 2;

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // videoと同じスタイルを適用
  canvas.style.position = video.style.position || 'relative';
  canvas.style.width = computedStyle.width;
  canvas.style.height = computedStyle.height;
  canvas.style.objectFit = computedStyle.objectFit || 'contain';
  canvas.style.display = 'block';
  canvas.style.maxWidth = '100%';
  canvas.style.maxHeight = '100%';

  // videoのクラスをコピー（レイアウトを維持）
  canvas.className = video.className;

  return canvas;
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
    console.warn('[Better Niconico] Video element not found');
    return;
  }

  // すでに有効化されている場合は何もしない
  if (video.getAttribute(UPSCALING_MARKER) === UPSCALING_ACTIVE) {
    return;
  }

  // WebGPU対応チェック
  const gpuSupported = await isWebGPUSupported();
  if (!gpuSupported) {
    console.error('[Better Niconico] Video upscaling requires WebGPU support');
    return;
  }

  // 動画がロードされるまで待機
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const handler = () => {
        video.removeEventListener('loadeddata', handler);
        resolve();
      };
      video.addEventListener('loadeddata', handler);

      // タイムアウト（10秒）
      setTimeout(() => {
        video.removeEventListener('loadeddata', handler);
        resolve();
      }, 10000);
    });
  }

  // video要素の解像度が有効かチェック
  if (!video.videoWidth || !video.videoHeight) {
    console.warn('[Better Niconico] Video dimensions not available');
    return;
  }

  try {
    const canvas = createUpscaledCanvas(video);

    // Anime4K-WebGPUでレンダリング
    console.log('[Better Niconico] Starting video upscaling with Anime4K-WebGPU');

    // render関数を呼び出してアップスケーリングを開始
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

    // エラー時にcanvasを削除
    const canvas = document.getElementById(CANVAS_ID);
    if (canvas) {
      canvas.remove();
    }

    // videoを表示
    video.style.display = '';
    video.setAttribute(UPSCALING_MARKER, UPSCALING_INACTIVE);
  }
}

/**
 * アップスケーリングを無効化
 */
function disableUpscaling(): void {
  const video = getVideoElement();

  if (video) {
    // video要素を再表示
    video.style.display = '';
    video.setAttribute(UPSCALING_MARKER, UPSCALING_INACTIVE);
  }

  // canvas要素を削除
  const canvas = document.getElementById(CANVAS_ID);
  if (canvas) {
    canvas.remove();
  }

  // レンダリングを停止
  if (renderAnimationFrameId !== null) {
    cancelAnimationFrame(renderAnimationFrameId);
    renderAnimationFrameId = null;
  }

  console.log('[Better Niconico] Video upscaling disabled');
}

/**
 * 設定を適用する
 * @param enabled - true: アップスケーリング有効, false: アップスケーリング無効
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    enableUpscaling();
  } else {
    disableUpscaling();
  }
}
