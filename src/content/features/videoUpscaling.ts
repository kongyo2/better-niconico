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
 * - Video src changes (navigation, playlist) are detected and upscaling is re-initialized
 * - Fullscreen mode automatically disables upscaling to prevent issues
 */

import { render, ModeA } from 'anime4k-webgpu';
import { Result, ok, err } from 'neverthrow';
import type { WebGPUError, VideoError } from '../../types/errors';
import {
  webgpuNotSupportedError,
  webgpuAdapterUnavailableError,
  webgpuInitializationFailedError,
  webgpuRenderFailedError,
  videoNotReadyError,
  videoDimensionsInvalidError,
  videoParentMissingError,
} from '../../types/errors';

// 処理済みマーカー属性
const UPSCALING_MARKER = 'data-bn-upscaling';
const UPSCALING_ACTIVE = 'active';
const UPSCALING_INACTIVE = 'inactive';

// Canvas要素のID
const CANVAS_ID = 'bn-upscaled-canvas';
const CANVAS_MARKER = 'data-bn-canvas';

// WebGPU対応状態のキャッシュ（初回チェック後は再利用）
let webGPUSupportCache: boolean | null = null;

// Note: anime4k-webgpu の render() 関数は signal パラメータをサポートしていません
// render loop は requestVideoFrameCallback を使用しており、
// canvas 要素を削除することで自動的に停止します

// 現在処理中の動画のsrcを追跡（動画変更を検出するため）
let currentVideoSrc: string | null = null;

// 現在の動画要素への参照（動画変更を検出するため）
let currentVideoElement: HTMLVideoElement | null = null;

// 現在の設定状態（全画面モード対応のため）
let currentEnabled: boolean = false;

// 動画監視用のMutationObserver
let videoObserver: MutationObserver | null = null;

// 全画面モードイベントリスナーのセットアップ済みフラグ
let fullscreenListenerSetup: boolean = false;

/**
 * 動画視聴ページかどうかを判定
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * 全画面モードかどうかを判定
 */
function isFullscreenMode(): boolean {
  // Fullscreen APIを優先的に使用
  if (document.fullscreenElement) {
    return true;
  }

  // フォールバック: DOMベースの検出
  // 全画面モード時、プレイヤーエリアに100dvw x 100dvhの要素が存在する
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (playerArea) {
    const fullscreenElement = playerArea.querySelector('.w_\\[100dvw\\].h_\\[100dvh\\]');
    if (fullscreenElement) {
      return true;
    }
  }

  return false;
}

/**
 * WebGPU対応ブラウザかどうかを判定（結果をキャッシュ）
 * Result型を返す
 */
async function isWebGPUSupported(): Promise<Result<boolean, WebGPUError>> {
  // キャッシュがあればそれを返す
  if (webGPUSupportCache !== null) {
    return ok(webGPUSupportCache);
  }

  if (!navigator.gpu) {
    const error = webgpuNotSupportedError('WebGPU is not supported in this browser');
    console.warn('[Better Niconico]', error.message);
    webGPUSupportCache = false;
    return err(error);
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      const error = webgpuAdapterUnavailableError('WebGPU adapter not available');
      console.warn('[Better Niconico]', error.message);
      webGPUSupportCache = false;
      return err(error);
    }
    webGPUSupportCache = true;
    return ok(true);
  } catch (error) {
    const gpuError = webgpuInitializationFailedError('WebGPU initialization failed', error);
    console.warn('[Better Niconico]', gpuError.message, error);
    webGPUSupportCache = false;
    return err(gpuError);
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
 * - より確実にメインコンテンツ動画を特定するため、複数の条件をチェック
 */
function getVideoElement(): HTMLVideoElement | null {
  // プレイヤーエリア内のすべてのvideo要素を取得
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return null;
  }

  const videos = Array.from(playerArea.querySelectorAll('video')) as HTMLVideoElement[];

  // 有効なコンテンツ動画を探す（広告とプレースホルダーを除外）
  // より確実に特定するため、readyStateもチェック
  let bestVideo: HTMLVideoElement | null = null;
  let bestReadyState = -1;

  for (const video of videos) {
    if (isValidContentVideo(video)) {
      // readyStateが高い動画を優先（よりロード済みの動画）
      if (video.readyState > bestReadyState) {
        bestVideo = video;
        bestReadyState = video.readyState;
      }
    }
  }

  return bestVideo;
}

/**
 * 動画が変更されたかどうかを判定
 * - srcが変更された場合
 * - 動画要素自体が変更された場合
 */
function hasVideoChanged(video: HTMLVideoElement | null): boolean {
  if (!video) {
    return currentVideoElement !== null || currentVideoSrc !== null;
  }

  // 動画要素が変更された場合
  if (currentVideoElement !== video) {
    return true;
  }

  // srcが変更された場合
  if (currentVideoSrc !== video.src) {
    return true;
  }

  return false;
}

/**
 * Canvas要素を作成してvideo要素と全く同じ位置・スタイルで配置
 * Result型を返す
 */
function createUpscaledCanvas(video: HTMLVideoElement): Result<HTMLCanvasElement, VideoError> {
  // videoの親要素チェック
  if (!video.parentElement) {
    const error = videoParentMissingError('Video element has no parent');
    console.error('[Better Niconico]', error.message);
    return err(error);
  }

  // video dimensionsチェック
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    const error = videoDimensionsInvalidError(
      'Invalid video dimensions',
      video.videoWidth,
      video.videoHeight,
    );
    console.error('[Better Niconico]', error.message);
    return err(error);
  }

  // 既存のcanvasがあれば再利用
  let canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.setAttribute(CANVAS_MARKER, 'true');

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

  return ok(canvas);
}

/**
 * 動画がロード完了するまで待機
 * Result型を返す
 */
async function waitForVideoReady(
  video: HTMLVideoElement,
  retryCount = 0,
): Promise<Result<boolean, VideoError>> {
  // すでにロード済みの場合
  if (video.readyState >= video.HAVE_METADATA && video.videoWidth && video.videoHeight) {
    return ok(true);
  }

  // 最大3回までリトライ
  const maxRetries = 3;
  if (retryCount >= maxRetries) {
    const error = videoNotReadyError('Video ready check failed after max retries', retryCount);
    console.warn('[Better Niconico]', error.message);
    return err(error);
  }

  // ロード完了を待機（タイムアウト付き）
  return new Promise<Result<boolean, VideoError>>((resolve) => {
    let resolved = false;

    const handler = () => {
      if (resolved) return;
      resolved = true;
      video.removeEventListener('loadedmetadata', handler);
      video.removeEventListener('loadeddata', handler);

      // 少し待ってから再度チェック（DOM更新を待つ）
      setTimeout(() => {
        if (video.videoWidth && video.videoHeight) {
          resolve(ok(true));
        } else if (retryCount < maxRetries) {
          // リトライ
          void waitForVideoReady(video, retryCount + 1).then(resolve);
        } else {
          const error = videoNotReadyError('Video dimensions not available', retryCount);
          resolve(err(error));
        }
      }, 100);
    };

    // loadedmetadataとloadeddataの両方を監視
    video.addEventListener('loadedmetadata', handler);
    video.addEventListener('loadeddata', handler);

    // タイムアウト（10秒）
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      video.removeEventListener('loadedmetadata', handler);
      video.removeEventListener('loadeddata', handler);

      if (retryCount < maxRetries) {
        // リトライ
        void waitForVideoReady(video, retryCount + 1).then(resolve);
      } else {
        const error = videoNotReadyError('Video ready check timeout', retryCount);
        resolve(err(error));
      }
    }, 10000);
  });
}

/**
 * アップスケーリングを有効化（Result型を使用）
 */
async function enableUpscaling(): Promise<void> {
  if (!isWatchPage()) {
    return;
  }

  // 全画面モードの場合はアップスケーリングを無効化
  if (isFullscreenMode()) {
    console.log('[Better Niconico] 全画面表示中のため、動画アップスケーリングを無効化します');
    // 既存のアップスケーリングがあればクリーンアップ
    if (currentVideoElement) {
      cleanupUpscaling(currentVideoElement);
    }
    return;
  }

  const video = getVideoElement();
  if (!video) {
    // 動画要素が見つからない場合は静かに終了
    // MutationObserverで再試行される
    return;
  }

  // 動画が変更された場合は、既存のアップスケーリングをクリーンアップ
  if (hasVideoChanged(video)) {
    console.log('[Better Niconico] 動画が変更されました。既存のアップスケーリングを停止します');
    if (currentVideoElement) {
      cleanupUpscaling(currentVideoElement);
    }
    // 状態をリセット
    currentVideoElement = null;
    currentVideoSrc = null;
  }

  // すでに有効化されている場合は何もしない（冪等性）
  // ただし、動画が変更された場合は上記でクリーンアップ済み
  if (video.getAttribute(UPSCALING_MARKER) === UPSCALING_ACTIVE) {
    return;
  }

  // WebGPU対応チェック（キャッシュされる）
  const gpuSupportedResult = await isWebGPUSupported();
  if (gpuSupportedResult.isErr()) {
    console.error('[Better Niconico] Video upscaling requires WebGPU support:', gpuSupportedResult.error);
    return;
  }

  // 動画がロードされるまで待機
  const videoReadyResult = await waitForVideoReady(video);
  if (videoReadyResult.isErr()) {
    console.warn('[Better Niconico] Video not ready:', videoReadyResult.error);
    return;
  }

  // Canvas作成
  const canvasResult = createUpscaledCanvas(video);
  if (canvasResult.isErr()) {
    console.error('[Better Niconico] Failed to create canvas:', canvasResult.error);
    return;
  }

  const canvas = canvasResult.value;

  console.log('[Better Niconico] Starting video upscaling with Anime4K-WebGPU', {
    nativeResolution: `${video.videoWidth}x${video.videoHeight}`,
    targetResolution: `${canvas.width}x${canvas.height}`,
    videoSrc: video.src.substring(0, 50) + (video.src.length > 50 ? '...' : ''),
  });

  try {
    // Anime4K-WebGPUのrender関数でアップスケーリングを開始
    // ModeAプリセット: Clamp Highlights → Restore (CNNVL) → Upscale (CNNx2VL/CNNx2M)
    // render()関数は自動的にrequestVideoFrameCallbackを使ってレンダリングループを開始する
    // render loopはcanvas.remove()で自動的に停止される
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
    // render()関数が開始した後に行う
    video.style.display = 'none';
    canvas.style.display = 'block';

    // マーカーを設定
    video.setAttribute(UPSCALING_MARKER, UPSCALING_ACTIVE);

    // 現在の動画情報を記録
    currentVideoElement = video;
    currentVideoSrc = video.src;

    console.log('[Better Niconico] Video upscaling enabled successfully');
  } catch (error) {
    // AbortErrorは正常なクリーンアップなのでログに出さない
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('[Better Niconico] Video upscaling stopped (cleanup)');
      return;
    }

    const renderError = webgpuRenderFailedError('Failed to render video upscaling', error);
    console.error('[Better Niconico]', renderError.message, error);

    // エラー時のクリーンアップ
    cleanupUpscaling(video);
    // 状態をリセット
    currentVideoElement = null;
    currentVideoSrc = null;
  }
}

/**
 * アップスケーリングのクリーンアップ
 */
function cleanupUpscaling(video: HTMLVideoElement | null): void {
  // canvas要素を削除
  // これにより requestVideoFrameCallback のループが自動的に停止される
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

  // 状態をリセット
  currentVideoElement = null;
  currentVideoSrc = null;
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
 * 全画面表示イベントのリスナーをセットアップ
 * 全画面表示への遷移を確実に捕捉し、アップスケーリングを適切に切り替える
 */
function setupFullscreenListener(): void {
  if (!isWatchPage() || fullscreenListenerSetup) {
    return;
  }

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      // 全画面表示に入った - アップスケーリングを無効化
      console.log('[Better Niconico] 全画面表示に入りました。動画アップスケーリングを無効化します。');
      if (currentVideoElement) {
        cleanupUpscaling(currentVideoElement);
      }
    } else {
      // 全画面表示から抜けた - 設定がONなら自動的にアップスケーリングを再適用
      console.log('[Better Niconico] 全画面表示から抜けました。');
      if (currentEnabled) {
        // DOM更新を待つために少し遅延させる
        setTimeout(() => {
          console.log('[Better Niconico] 動画アップスケーリングを再適用します。');
          void enableUpscaling();
        }, 100);
      }
    }
  });

  fullscreenListenerSetup = true;
  console.log('[Better Niconico] 全画面表示イベントリスナーをセットアップしました');
}

/**
 * 動画要素の変更を監視するMutationObserverをセットアップ
 * src変更や動画の切り替えを検出する
 */
function setupVideoObserver(): void {
  if (!isWatchPage() || videoObserver) {
    return;
  }

  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return;
  }

  videoObserver = new MutationObserver((mutations) => {
    // 動画要素の変更を検出
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
        // src属性が変更された
        const video = mutation.target as HTMLVideoElement;
        if (isValidContentVideo(video) && currentEnabled) {
          console.log('[Better Niconico] 動画のsrcが変更されました。アップスケーリングを再初期化します。');
          // 既存のアップスケーリングをクリーンアップ
          if (currentVideoElement) {
            cleanupUpscaling(currentVideoElement);
          }
          // 少し遅延させてから再適用（DOM更新を待つ）
          setTimeout(() => {
            void enableUpscaling();
          }, 200);
        }
      }

      // 新しいvideo要素が追加された場合
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            if (element.tagName === 'VIDEO' || element.querySelector('video')) {
              if (currentEnabled) {
                console.log('[Better Niconico] 新しい動画要素が検出されました。アップスケーリングを再適用します。');
                // 少し遅延させてから再適用（DOM更新を待つ）
                setTimeout(() => {
                  void enableUpscaling();
                }, 200);
              }
              break;
            }
          }
        }
      }
    }
  });

  videoObserver.observe(playerArea, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });

  console.log('[Better Niconico] 動画要素監視をセットアップしました');
}

/**
 * 動画監視を停止
 */
function stopVideoObserver(): void {
  if (videoObserver) {
    videoObserver.disconnect();
    videoObserver = null;
  }
}

/**
 * 設定を適用する（冪等性を保証）
 * @param enabled - true: アップスケーリング有効, false: アップスケーリング無効
 */
export function apply(enabled: boolean): void {
  currentEnabled = enabled;

  if (enabled) {
    // 全画面表示イベントリスナーをセットアップ（初回のみ）
    setupFullscreenListener();
    // 動画要素監視をセットアップ（初回のみ）
    setupVideoObserver();
    void enableUpscaling();
  } else {
    disableUpscaling();
    // 動画監視を停止
    stopVideoObserver();
  }
}
