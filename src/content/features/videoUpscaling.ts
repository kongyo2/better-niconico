/**
 * Anime4K-WebGPUを使用した動画アップスケーリング機能
 * watch ページでのみ動作します
 *
 * 参考: https://github.com/Anime4KWebBoost/Anime4K-WebGPU
 *
 * IMPORTANT IMPLEMENTATION NOTES:
 * - Niconico's video player contains multiple <video> elements (main content, ads, placeholders)
 * - Videos are absolutely positioned inside nested containers with aspect ratio control
 * - Ad videos are inside #nv_watch_VideoAdContainer and must be excluded
 * - Main content video uses blob: URLs and may not appear until ads finish
 * - Canvas must replace video in the exact same position with same styling
 * - The render() function from anime4k-webgpu handles its own render loop using requestVideoFrameCallback
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

// アクティブなレンダリングコントローラー（クリーンアップ用）
let activeRenderController: AbortController | null = null;

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
 * 動画要素が広告かどうかを判定
 */
function isAdVideo(video: HTMLVideoElement): boolean {
  // 広告コンテナ内の動画は除外
  const adContainer = document.getElementById('nv_watch_VideoAdContainer');
  if (adContainer && adContainer.contains(video)) {
    return true;
  }
  return false;
}

/**
 * 有効な動画要素かどうかを判定
 * - src が存在する
 * - videoWidth と videoHeight が 0 より大きい
 * - 広告動画ではない
 */
function isValidContentVideo(video: HTMLVideoElement): boolean {
  return (
    video.src !== '' &&
    video.videoWidth > 0 &&
    video.videoHeight > 0 &&
    !isAdVideo(video)
  );
}

/**
 * メインコンテンツの動画要素を取得
 * - 複数の video 要素から、実際のコンテンツ動画を特定
 * - 広告動画は除外
 * - 空のプレースホルダー動画は除外
 */
function getVideoElement(): HTMLVideoElement | null {
  // プレイヤーエリア内のすべてのvideo要素を取得
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return null;
  }

  const videos = Array.from(playerArea.querySelectorAll('video')) as HTMLVideoElement[];

  // 有効なコンテンツ動画を探す（広告とプレースホルダーを除外）
  for (const video of videos) {
    if (isValidContentVideo(video)) {
      return video;
    }
  }

  return null;
}

/**
 * Canvas要素を作成してvideo要素と全く同じ位置・スタイルで配置
 * - videoと同じ親要素に配置
 * - videoと同じ絶対位置
 * - videoと同じサイズとスタイル
 */
function createUpscaledCanvas(video: HTMLVideoElement): HTMLCanvasElement | null {
  // 既存のcanvasがあれば再利用
  let canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.setAttribute(CANVAS_MARKER, 'true');

    // videoの親要素に挿入（videoの直後）
    if (!video.parentElement) {
      console.error('[Better Niconico] Video element has no parent');
      return null;
    }

    // videoの次の要素として挿入
    video.parentElement.insertBefore(canvas, video.nextSibling);
  }

  // videoの現在の計算済みスタイルを取得
  const computedStyle = window.getComputedStyle(video);

  // アップスケーリング倍率（2倍）
  const targetWidth = video.videoWidth * 2;
  const targetHeight = video.videoHeight * 2;

  // Canvas内部の解像度を設定
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // Canvasの表示スタイルをvideoと完全に一致させる
  // position: absolute を維持し、videoと同じ配置とサイズにする
  canvas.style.cssText = `
    position: ${computedStyle.position};
    top: ${computedStyle.top};
    left: ${computedStyle.left};
    right: ${computedStyle.right};
    bottom: ${computedStyle.bottom};
    width: ${computedStyle.width};
    height: ${computedStyle.height};
    object-fit: ${computedStyle.objectFit};
    transform: ${computedStyle.transform};
    display: block;
    z-index: ${computedStyle.zIndex};
  `;

  // videoのクラスをコピー（レイアウトを維持）
  canvas.className = video.className;

  return canvas;
}

/**
 * 動画がロード完了するまで待機
 * anime4k-webgpu の render() 関数は内部で HAVE_FUTURE_DATA を待つが、
 * canvas作成前に基本的な準備が整っているか確認する
 */
async function waitForVideoReady(video: HTMLVideoElement): Promise<boolean> {
  // すでにロード済みの場合
  if (video.readyState >= video.HAVE_METADATA && video.videoWidth && video.videoHeight) {
    return true;
  }

  // ロード完了を待機（タイムアウト付き）
  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const handler = () => {
      if (resolved) return;
      resolved = true;
      video.removeEventListener('loadedmetadata', handler);

      if (video.videoWidth && video.videoHeight) {
        resolve(true);
      } else {
        resolve(false);
      }
    };

    video.addEventListener('loadedmetadata', handler);

    // タイムアウト（10秒）
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      video.removeEventListener('loadedmetadata', handler);
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
    // 動画要素が見つからない場合は静かに終了
    // MutationObserverで再試行される
    return;
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
    if (!canvas) {
      console.error('[Better Niconico] Failed to create canvas element');
      return;
    }

    console.log('[Better Niconico] Starting video upscaling with Anime4K-WebGPU', {
      nativeResolution: `${video.videoWidth}x${video.videoHeight}`,
      targetResolution: `${canvas.width}x${canvas.height}`,
    });

    // 前回のレンダリングコントローラーがあれば中止
    if (activeRenderController) {
      activeRenderController.abort();
    }

    // 新しいAbortControllerを作成
    activeRenderController = new AbortController();

    // Anime4K-WebGPUのrender関数でアップスケーリングを開始
    // ModeAプリセット: Clamp Highlights → Restore (CNNVL) → Upscale (CNNx2VL/CNNx2M)
    // render()関数は自動的にrequestVideoFrameCallbackを使ってレンダリングループを開始する
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
      signal: activeRenderController.signal,
    });

    // video要素を非表示にしてcanvasを表示
    // render()関数が開始した後に行う
    video.style.display = 'none';
    canvas.style.display = 'block';

    // マーカーを設定
    video.setAttribute(UPSCALING_MARKER, UPSCALING_ACTIVE);

    console.log('[Better Niconico] Video upscaling enabled successfully');
  } catch (error) {
    // AbortErrorは正常なクリーンアップなのでログに出さない
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('[Better Niconico] Video upscaling stopped (cleanup)');
      return;
    }

    console.error('[Better Niconico] Failed to enable video upscaling:', error);

    // エラー時のクリーンアップ
    cleanupUpscaling(video);
  }
}

/**
 * アップスケーリングのクリーンアップ
 */
function cleanupUpscaling(video: HTMLVideoElement | null): void {
  // レンダリングを停止（AbortControllerでrender()のループを停止）
  if (activeRenderController) {
    activeRenderController.abort();
    activeRenderController = null;
  }

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

  // すべてのvideoのマーカーをクリア（念のため）
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (playerArea) {
    const videos = playerArea.querySelectorAll('video');
    videos.forEach((v) => {
      (v as HTMLVideoElement).style.display = '';
      v.setAttribute(UPSCALING_MARKER, UPSCALING_INACTIVE);
    });
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
