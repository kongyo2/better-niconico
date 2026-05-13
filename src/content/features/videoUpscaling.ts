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

import { render, ModeA, ModeAA, type Anime4KPipeline } from 'anime4k-webgpu';
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
const UPSCALING_PENDING = 'pending';
const UPSCALING_INACTIVE = 'inactive';
const UPSCALING_TOKEN = 'data-bn-upscaling-token';

// Canvas要素のID
const CANVAS_ID = 'bn-upscaled-canvas';
const CANVAS_MARKER = 'data-bn-canvas';
const CANVAS_TOKEN = 'data-bn-canvas-token';

type Dimensions = {
  width: number;
  height: number;
};

type InlineVideoStyle = {
  display: string;
  visibility: string;
};

const DEFAULT_FALLBACK_UPSCALE = 2;
const LOW_RESOLUTION_HEIGHT = 480;
const MEDIUM_RESOLUTION_HEIGHT = 720;
const LOW_RESOLUTION_MAX_UPSCALE = 4;
const MEDIUM_RESOLUTION_MAX_UPSCALE = 2;
const HIGH_RESOLUTION_MAX_UPSCALE = 1;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_TARGET_PIXELS = 3840 * 2160;
const HIGH_QUALITY_PRESET_MAX_PIXELS = 1920 * 1080;
const RETRY_DELAY_MS = 250;
const RESIZE_RETRY_DELAY_MS = 100;

// WebGPU対応状態のキャッシュ（初回チェック後は再利用）
let webGPUSupportCache: boolean | null = null;

// Note: anime4k-webgpu の render() 関数は signal パラメータをサポートしていません
// render loop は requestVideoFrameCallback を使用しており、
// canvas 要素を削除することで自動的に停止します

// 現在処理中の動画のsrcを追跡（動画変更を検出するため）
let currentVideoSrc: string | null = null;

// 現在の動画要素への参照（動画変更を検出するため）
let currentVideoElement: HTMLVideoElement | null = null;

// 現在の描画解像度（表示サイズ変更を検出するため）
let currentTargetDimensions: Dimensions | null = null;

// 現在の設定状態（全画面モード対応のため）
let currentEnabled: boolean = false;

// 動画監視用のMutationObserver
let videoObserver: MutationObserver | null = null;

// プレイヤー差し替え監視用のMutationObserver
let pageObserver: MutationObserver | null = null;

// ResizeObserver（プレイヤーサイズ変更時の再初期化用）
let resizeObserver: ResizeObserver | null = null;

let observedPlayerArea: Element | null = null;
let resizeListenerSetup = false;
let retryTimer: number | null = null;
let activationToken = 0;

// 全画面モードイベントリスナーのセットアップ済みフラグ
let fullscreenListenerSetup: boolean = false;

const hiddenVideoStyles = new WeakMap<HTMLVideoElement, InlineVideoStyle>();

/**
 * 動画視聴ページかどうかを判定
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

function getPlayerArea(): Element | null {
  return document.querySelector('.grid-area_\\[player\\]');
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
  const playerArea = getPlayerArea();
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
  return video.src !== '' && video.videoWidth > 0 && video.videoHeight > 0 && !isAdVideo(video);
}

function getVideoScore(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  const visibleArea = rect.width * rect.height;
  let score = video.readyState * 10;

  if (video.getAttribute('data-name') === 'video-content') {
    score += 1000;
  }

  if (!video.paused) {
    score += 50;
  }

  if (visibleArea > 0) {
    score += 25 + Math.min(visibleArea / 10000, 50);
  }

  score += Math.min((video.videoWidth * video.videoHeight) / 100000, 50);
  return score;
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
  const playerArea = getPlayerArea();
  if (!playerArea) {
    return null;
  }

  const videos = Array.from(playerArea.querySelectorAll('video')) as HTMLVideoElement[];
  const candidates = videos.filter((video) => isValidContentVideo(video));

  if (candidates.length === 0) {
    return null;
  }

  return candidates.toSorted((a, b) => getVideoScore(b) - getVideoScore(a))[0];
}

function getMaxUpscaleFactor(video: HTMLVideoElement): number {
  if (video.videoHeight <= LOW_RESOLUTION_HEIGHT) {
    return LOW_RESOLUTION_MAX_UPSCALE;
  }

  if (video.videoHeight <= MEDIUM_RESOLUTION_HEIGHT) {
    return MEDIUM_RESOLUTION_MAX_UPSCALE;
  }

  return HIGH_RESOLUTION_MAX_UPSCALE;
}

function getDisplayDimensions(video: HTMLVideoElement): Dimensions {
  const rect = video.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(video);
  const computedWidth = Number.parseFloat(computedStyle.width);
  const computedHeight = Number.parseFloat(computedStyle.height);
  const fallbackScale = Math.min(DEFAULT_FALLBACK_UPSCALE, getMaxUpscaleFactor(video));

  return {
    width:
      rect.width ||
      video.clientWidth ||
      (Number.isFinite(computedWidth) ? computedWidth : 0) ||
      video.videoWidth * fallbackScale,
    height:
      rect.height ||
      video.clientHeight ||
      (Number.isFinite(computedHeight) ? computedHeight : 0) ||
      video.videoHeight * fallbackScale,
  };
}

function getDevicePixelRatio(): number {
  const ratio = window.devicePixelRatio || 1;
  return Math.min(Math.max(ratio, 1), MAX_DEVICE_PIXEL_RATIO);
}

function clampTargetPixels(dimensions: Dimensions): Dimensions {
  const pixelCount = dimensions.width * dimensions.height;
  if (pixelCount <= MAX_TARGET_PIXELS) {
    return dimensions;
  }

  const scale = Math.sqrt(MAX_TARGET_PIXELS / pixelCount);
  return {
    width: Math.max(1, Math.floor(dimensions.width * scale)),
    height: Math.max(1, Math.floor(dimensions.height * scale)),
  };
}

function getTargetDimensions(video: HTMLVideoElement): Dimensions {
  const displayDimensions = getDisplayDimensions(video);
  const devicePixelRatio = getDevicePixelRatio();
  const displayScale = Math.max(
    (displayDimensions.width * devicePixelRatio) / video.videoWidth,
    (displayDimensions.height * devicePixelRatio) / video.videoHeight,
  );
  const targetScale = Math.min(displayScale, getMaxUpscaleFactor(video));

  return clampTargetPixels({
    width: Math.max(1, Math.ceil(video.videoWidth * targetScale)),
    height: Math.max(1, Math.ceil(video.videoHeight * targetScale)),
  });
}

function dimensionsEqual(left: Dimensions | null, right: Dimensions | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.width === right.width && left.height === right.height;
}

function shouldUseHighQualityPreset(
  video: HTMLVideoElement,
  targetDimensions: Dimensions,
): boolean {
  return (
    video.videoHeight <= MEDIUM_RESOLUTION_HEIGHT &&
    targetDimensions.width * targetDimensions.height <= HIGH_QUALITY_PRESET_MAX_PIXELS
  );
}

/**
 * 動画が変更されたかどうかを判定
 * - srcが変更された場合
 * - 動画要素自体が変更された場合
 */
function hasVideoChanged(
  video: HTMLVideoElement | null,
  targetDimensions: Dimensions | null,
): boolean {
  if (!video) {
    return (
      currentVideoElement !== null || currentVideoSrc !== null || currentTargetDimensions !== null
    );
  }

  // 動画要素が変更された場合
  if (currentVideoElement !== video) {
    return true;
  }

  // srcが変更された場合
  if (currentVideoSrc !== video.src) {
    return true;
  }

  if (!dimensionsEqual(currentTargetDimensions, targetDimensions)) {
    return true;
  }

  return false;
}

function syncCanvasStyle(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  targetDimensions: Dimensions,
): void {
  const computedStyle = window.getComputedStyle(video);

  canvas.width = targetDimensions.width;
  canvas.height = targetDimensions.height;

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
    transform-origin: ${computedStyle.transformOrigin};
    border-radius: ${computedStyle.borderRadius};
    clip-path: ${computedStyle.clipPath};
    display: block;
    visibility: visible;
    pointer-events: none;
    z-index: ${computedStyle.zIndex};
  `;

  // videoのクラスをコピー（レイアウトを維持）
  canvas.className = video.className;
}

/**
 * Canvas要素を作成してvideo要素と全く同じ位置・スタイルで配置
 * Result型を返す
 */
function createUpscaledCanvas(
  video: HTMLVideoElement,
  targetDimensions: Dimensions,
): Result<HTMLCanvasElement, VideoError> {
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
  let canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;
  if (canvas && canvas.parentElement !== video.parentElement) {
    canvas.remove();
    canvas = null;
  }

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.setAttribute(CANVAS_MARKER, 'true');

    // videoの次の要素として挿入
    video.parentElement.insertBefore(canvas, video.nextSibling);
  }

  syncCanvasStyle(canvas, video, targetDimensions);

  return ok(canvas);
}

function hideOriginalVideo(video: HTMLVideoElement): void {
  if (!hiddenVideoStyles.has(video)) {
    hiddenVideoStyles.set(video, {
      display: video.style.display,
      visibility: video.style.visibility,
    });
  }

  // display:none にするとレイアウト情報が失われ、リサイズ時の再初期化が不安定になる。
  video.style.visibility = 'hidden';
}

function restoreOriginalVideo(video: HTMLVideoElement): void {
  const previousStyle = hiddenVideoStyles.get(video);
  if (previousStyle) {
    video.style.display = previousStyle.display;
    video.style.visibility = previousStyle.visibility;
    hiddenVideoStyles.delete(video);
    return;
  }

  video.style.display = '';
  video.style.visibility = '';
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

function clearScheduledEnable(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleEnableUpscaling(delay = RETRY_DELAY_MS): void {
  if (!currentEnabled) {
    return;
  }

  clearScheduledEnable();
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void enableUpscaling();
  }, delay);
}

function isActivationCurrent(token: number, video: HTMLVideoElement): boolean {
  return (
    currentEnabled &&
    activationToken === token &&
    isWatchPage() &&
    !isFullscreenMode() &&
    video.isConnected
  );
}

/**
 * アップスケーリングを有効化（Result型を使用）
 */
async function enableUpscaling(): Promise<void> {
  if (!isWatchPage()) {
    if (currentVideoElement) {
      cleanupUpscaling(currentVideoElement);
    }
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
    // MutationObserverとタイマーで再試行される
    scheduleEnableUpscaling(RETRY_DELAY_MS);
    return;
  }

  const targetDimensions = getTargetDimensions(video);
  const existingCanvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;

  // すでに有効化されていて、動画と描画解像度が同じ場合はスタイルだけ同期する
  if (
    video.getAttribute(UPSCALING_MARKER) === UPSCALING_ACTIVE &&
    currentVideoElement === video &&
    currentVideoSrc === video.src &&
    dimensionsEqual(currentTargetDimensions, targetDimensions) &&
    existingCanvas
  ) {
    syncCanvasStyle(existingCanvas, video, targetDimensions);
    return;
  }

  if (video.getAttribute(UPSCALING_MARKER) === UPSCALING_PENDING) {
    return;
  }

  // 動画が変更された場合は、既存のアップスケーリングをクリーンアップ
  if (hasVideoChanged(video, targetDimensions)) {
    console.log('[Better Niconico] 動画が変更されました。既存のアップスケーリングを停止します');
    if (currentVideoElement) {
      cleanupUpscaling(currentVideoElement);
    }
    // 状態をリセット
    currentVideoElement = null;
    currentVideoSrc = null;
    currentTargetDimensions = null;
  }

  // すでに有効化されている場合は何もしない（冪等性）
  // ただし、動画が変更された場合は上記でクリーンアップ済み
  if (video.getAttribute(UPSCALING_MARKER) === UPSCALING_ACTIVE) {
    return;
  }

  const token = ++activationToken;
  video.setAttribute(UPSCALING_MARKER, UPSCALING_PENDING);
  video.setAttribute(UPSCALING_TOKEN, String(token));

  // WebGPU対応チェック（キャッシュされる）
  const gpuSupportedResult = await isWebGPUSupported();
  if (gpuSupportedResult.isErr()) {
    console.error(
      '[Better Niconico] Video upscaling requires WebGPU support:',
      gpuSupportedResult.error,
    );
    cleanupUpscaling(video, token);
    return;
  }

  if (!isActivationCurrent(token, video)) {
    cleanupUpscaling(video, token);
    return;
  }

  // 動画がロードされるまで待機
  const videoReadyResult = await waitForVideoReady(video);
  if (videoReadyResult.isErr()) {
    console.warn('[Better Niconico] Video not ready:', videoReadyResult.error);
    cleanupUpscaling(video, token);
    return;
  }

  if (!isActivationCurrent(token, video)) {
    cleanupUpscaling(video, token);
    return;
  }

  const freshTargetDimensions = getTargetDimensions(video);

  // Canvas作成
  const canvasResult = createUpscaledCanvas(video, freshTargetDimensions);
  if (canvasResult.isErr()) {
    console.error('[Better Niconico] Failed to create canvas:', canvasResult.error);
    cleanupUpscaling(video, token);
    return;
  }

  const canvas = canvasResult.value;
  canvas.setAttribute(CANVAS_TOKEN, String(token));
  const useHighQualityPreset = shouldUseHighQualityPreset(video, freshTargetDimensions);

  console.log('[Better Niconico] Starting video upscaling with Anime4K-WebGPU', {
    nativeResolution: `${video.videoWidth}x${video.videoHeight}`,
    targetResolution: `${canvas.width}x${canvas.height}`,
    preset: useHighQualityPreset ? 'ModeAA' : 'ModeA',
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
        const nativeDimensions = {
          width: video.videoWidth,
          height: video.videoHeight,
        };
        const targetDimensions = {
          width: canvas.width,
          height: canvas.height,
        };
        const preset: Anime4KPipeline = useHighQualityPreset
          ? new ModeAA({
              device,
              inputTexture,
              nativeDimensions,
              targetDimensions,
            })
          : new ModeA({
              device,
              inputTexture,
              nativeDimensions,
              targetDimensions,
            });

        return [preset] as [Anime4KPipeline];
      },
    });

    if (!isActivationCurrent(token, video)) {
      cleanupUpscaling(video, token);
      return;
    }

    // video要素を非表示にしてcanvasを表示
    // render()関数が開始した後に行う
    hideOriginalVideo(video);
    canvas.style.display = 'block';

    // マーカーを設定
    video.setAttribute(UPSCALING_MARKER, UPSCALING_ACTIVE);
    video.setAttribute(UPSCALING_TOKEN, String(token));

    // 現在の動画情報を記録
    currentVideoElement = video;
    currentVideoSrc = video.src;
    currentTargetDimensions = freshTargetDimensions;
    setupResizeObserver();

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
    cleanupUpscaling(video, token);
    // 状態をリセット
    currentVideoElement = null;
    currentVideoSrc = null;
    currentTargetDimensions = null;
  }
}

/**
 * アップスケーリングのクリーンアップ
 */
function cleanupUpscaling(video: HTMLVideoElement | null, token?: number): void {
  const tokenString = token ? String(token) : null;

  // canvas要素を削除
  // これにより requestVideoFrameCallback のループが自動的に停止される
  const canvas = document.getElementById(CANVAS_ID);
  if (canvas && (!tokenString || canvas.getAttribute(CANVAS_TOKEN) === tokenString)) {
    canvas.remove();
  }

  // video要素を再表示
  if (video && (!tokenString || video.getAttribute(UPSCALING_TOKEN) === tokenString)) {
    restoreOriginalVideo(video);
    video.setAttribute(UPSCALING_MARKER, UPSCALING_INACTIVE);
    video.removeAttribute(UPSCALING_TOKEN);
  }

  // すべてのvideoのマーカーをクリア（念のため）
  const playerArea = getPlayerArea();
  if (playerArea) {
    const videos = playerArea.querySelectorAll('video');
    videos.forEach((v) => {
      const videoElement = v as HTMLVideoElement;
      if (!tokenString || videoElement.getAttribute(UPSCALING_TOKEN) === tokenString) {
        restoreOriginalVideo(videoElement);
        videoElement.setAttribute(UPSCALING_MARKER, UPSCALING_INACTIVE);
        videoElement.removeAttribute(UPSCALING_TOKEN);
      }
    });
  }

  // 状態をリセット
  if (!token || activationToken === token) {
    currentVideoElement = null;
    currentVideoSrc = null;
    currentTargetDimensions = null;
  }
}

/**
 * アップスケーリングを無効化
 */
function disableUpscaling(): void {
  activationToken += 1;
  clearScheduledEnable();
  const video = getVideoElement();
  cleanupUpscaling(video || currentVideoElement);
  stopResizeObserver();
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
    if (!currentEnabled) {
      return;
    }

    if (document.fullscreenElement) {
      // 全画面表示に入った - アップスケーリングを無効化
      console.log(
        '[Better Niconico] 全画面表示に入りました。動画アップスケーリングを無効化します。',
      );
      activationToken += 1;
      clearScheduledEnable();
      if (currentVideoElement) {
        cleanupUpscaling(currentVideoElement);
      }
    } else {
      // 全画面表示から抜けた - 設定がONなら自動的にアップスケーリングを再適用
      console.log('[Better Niconico] 全画面表示から抜けました。');
      // DOM更新を待つために少し遅延させる
      scheduleEnableUpscaling(100);
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
  if (!isWatchPage()) {
    return;
  }

  const playerArea = getPlayerArea();
  if (!playerArea) {
    return;
  }

  if (videoObserver && observedPlayerArea === playerArea) {
    return;
  }

  stopVideoObserver();
  observedPlayerArea = playerArea;

  videoObserver = new MutationObserver((mutations) => {
    // 動画要素の変更を検出
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class' && currentEnabled) {
        if (isFullscreenMode()) {
          activationToken += 1;
          clearScheduledEnable();
          if (currentVideoElement) {
            cleanupUpscaling(currentVideoElement);
          }
        } else {
          scheduleEnableUpscaling(RESIZE_RETRY_DELAY_MS);
        }
      }

      if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
        // src属性が変更された
        const video = mutation.target as HTMLVideoElement;
        if (isValidContentVideo(video) && currentEnabled) {
          console.log(
            '[Better Niconico] 動画のsrcが変更されました。アップスケーリングを再初期化します。',
          );
          // 既存のアップスケーリングをクリーンアップ
          if (currentVideoElement) {
            activationToken += 1;
            cleanupUpscaling(currentVideoElement);
          }
          // 少し遅延させてから再適用（DOM更新を待つ）
          scheduleEnableUpscaling(200);
        }
      }

      // 新しいvideo要素が追加された場合
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            if (element.tagName === 'VIDEO' || element.querySelector('video')) {
              if (currentEnabled) {
                console.log(
                  '[Better Niconico] 新しい動画要素が検出されました。アップスケーリングを再適用します。',
                );
                // 少し遅延させてから再適用（DOM更新を待つ）
                scheduleEnableUpscaling(200);
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
    attributeFilter: ['src', 'class'],
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
  observedPlayerArea = null;
}

function nodeContainsPlayerOrVideo(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const element = node as Element;
  return (
    element.matches('.grid-area_\\[player\\], video') ||
    !!element.querySelector('.grid-area_\\[player\\], video')
  );
}

function setupPageObserver(): void {
  if (pageObserver || !document.body) {
    return;
  }

  pageObserver = new MutationObserver((mutations) => {
    if (!currentEnabled) {
      return;
    }

    let shouldRescanPlayer =
      observedPlayerArea !== null && !document.body.contains(observedPlayerArea);

    for (const mutation of mutations) {
      if (mutation.type !== 'childList') {
        continue;
      }

      const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
      if (changedNodes.some((node) => nodeContainsPlayerOrVideo(node))) {
        shouldRescanPlayer = true;
        break;
      }
    }

    if (!shouldRescanPlayer) {
      return;
    }

    setupVideoObserver();
    setupResizeObserver();
    scheduleEnableUpscaling(RETRY_DELAY_MS);
  });

  pageObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function stopPageObserver(): void {
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }
}

function handleWindowResize(): void {
  scheduleEnableUpscaling(RESIZE_RETRY_DELAY_MS);
}

function setupResizeListener(): void {
  if (resizeListenerSetup) {
    return;
  }

  window.addEventListener('resize', handleWindowResize);
  resizeListenerSetup = true;
}

function stopResizeListener(): void {
  if (!resizeListenerSetup) {
    return;
  }

  window.removeEventListener('resize', handleWindowResize);
  resizeListenerSetup = false;
}

function setupResizeObserver(): void {
  if (typeof ResizeObserver === 'undefined') {
    return;
  }

  const playerArea = getPlayerArea();
  if (!playerArea) {
    return;
  }

  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  resizeObserver = new ResizeObserver(() => {
    scheduleEnableUpscaling(RESIZE_RETRY_DELAY_MS);
  });

  resizeObserver.observe(playerArea);

  const video = getVideoElement();
  if (video?.parentElement) {
    resizeObserver.observe(video.parentElement);
  }
}

function stopResizeObserver(): void {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
}

/**
 * 設定を適用する（冪等性を保証）
 * @param enabled - true: アップスケーリング有効, false: アップスケーリング無効
 */
export async function apply(enabled: boolean): Promise<void> {
  currentEnabled = enabled;

  if (enabled) {
    // 全画面表示イベントリスナーをセットアップ（初回のみ）
    setupFullscreenListener();
    // プレイヤー自体の差し替えを監視
    setupPageObserver();
    // 動画要素監視をセットアップ（初回のみ）
    setupVideoObserver();
    // プレイヤーサイズ変更を監視
    setupResizeListener();
    setupResizeObserver();
    await enableUpscaling();
  } else {
    disableUpscaling();
    // 動画監視を停止
    stopVideoObserver();
    stopPageObserver();
    stopResizeListener();
  }
}
