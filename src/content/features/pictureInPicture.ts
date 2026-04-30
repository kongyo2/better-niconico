/**
 * Picture-in-Picture (PiP) 機能
 * ニコニコ動画の動画、サポーター表示、コメントを合成してPiP表示する
 * watch ページでのみ動作します
 *
 * 参考実装:
 * - https://github.com/Kiikurage/NicoPIP (基本構造)
 * - https://github.com/rutan/nicopip-chrome (最適化手法)
 *
 * IMPLEMENTATION NOTES:
 * - Main video element: blob: URL, outside #nv_watch_VideoAdContainer
 * - Comment canvas: [data-name="comment"] canvas
 * - Supporter canvas: [data-name="supporter-content"] canvas (optional)
 * - Combines video, supporter view, and comments with aspect ratio preservation
 * - Uses requestVideoFrameCallback for frame sync when available
 * - Falls back to requestAnimationFrame
 * - Uses canvas.captureStream(0) with manual frame capture for tight sync
 * - Adds PiP button to player control bar near the fullscreen button
 * - Reconnects sources while PiP is open when Niconico replaces the player DOM
 */

import { Result, ok, err } from 'neverthrow';
import type { VideoError, PageError } from '../../types/errors';
import {
  videoElementNotFoundError,
  videoNotReadyError,
  videoDimensionsInvalidError,
  domElementNotFoundError,
} from '../../types/errors';

// マーカー属性
const PIP_BUTTON_MARKER = 'data-bn-pip-button';
const PIP_VIDEO_MARKER = 'data-bn-pip-video';
const PIP_CANVAS_MARKER = 'data-bn-pip-canvas';

// 要素ID
const PIP_BUTTON_ID = 'bn-pip-button';
const PIP_CANVAS_ID = 'bn-pip-canvas';
const PIP_VIDEO_ID = 'bn-pip-video';

// Video Upscalingのキャンバス要素ID（videoUpscaling.tsと同期）
const UPSCALED_CANVAS_ID = 'bn-upscaled-canvas';

const RETRY_DELAY_MS = 250;
const RECONNECT_DELAY_MS = 100;
const PIP_TARGET_SELECTOR =
  '.grid-area_\\[player\\], video, canvas, button, [data-name="comment"], [data-name="supporter-content"]';

type Dimensions = {
  width: number;
  height: number;
};

type HiddenElementStyle = {
  visibility: string;
};

type PiPSources = {
  video: HTMLVideoElement;
  videoSrc: string;
  commentCanvas: HTMLCanvasElement | null;
  supporterCanvas: HTMLCanvasElement | null;
  upscaledCanvas: HTMLCanvasElement | null;
};

// グローバル状態
let currentEnabled = false;
let isRunningInPIP = false;
let isStartingPIP = false;
let isStoppingPIP = false;
let videoFrameCallbackId: number | null = null;
let animationFrameId: number | null = null;
let pipButton: HTMLButtonElement | null = null;
let pipCanvas: HTMLCanvasElement | null = null;
let pipCanvasContext: CanvasRenderingContext2D | null = null;
let pipVideo: HTMLVideoElement | null = null;
let pipStream: MediaStream | null = null;
let mainVideo: HTMLVideoElement | null = null;
let currentVideoSrc: string | null = null;
let currentCompositeDimensions: Dimensions | null = null;
let upscaledCanvas: HTMLCanvasElement | null = null;
let commentCanvas: HTMLCanvasElement | null = null;
let supporterCanvas: HTMLCanvasElement | null = null;
let hiddenVideoSurface: HTMLElement | null = null;
let hiddenCommentCanvas: HTMLCanvasElement | null = null;
let sourceReconnectTimer: number | null = null;
let featureObserver: MutationObserver | null = null;
let navigationIntervalId: number | null = null;
let lastPageUrl = '';
let pipSessionToken = 0;

const hiddenElementStyles = new WeakMap<HTMLElement, HiddenElementStyle>();

// requestVideoFrameCallback サポートチェック
function supportsRequestVideoFrameCallback(): boolean {
  return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
}

/**
 * 動画視聴ページかどうかを判定
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

function getPlayerArea(): Element | null {
  return document.querySelector('.grid-area_\\[player\\]');
}

function getVideoSource(video: HTMLVideoElement): string {
  return video.currentSrc || video.src || video.getAttribute('src') || '';
}

/**
 * アスペクト比を保持しながらリサイズした寸法を計算
 */
function calcSize(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Dimensions {
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const wr = dstWidth / srcWidth;
  const hr = dstHeight / srcHeight;
  const rate = Math.min(wr, hr);
  return {
    width: Math.floor(srcWidth * rate),
    height: Math.floor(srcHeight * rate),
  };
}

function dimensionsEqual(left: Dimensions | null, right: Dimensions | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.width === right.width && left.height === right.height;
}

/**
 * 広告動画かどうかを判定
 */
function isAdVideo(video: HTMLVideoElement): boolean {
  const adContainer = document.getElementById('nv_watch_VideoAdContainer');
  return adContainer?.contains(video) ?? false;
}

/**
 * 有効なコンテンツ動画かどうかを判定
 */
function isValidContentVideo(video: HTMLVideoElement): boolean {
  return (
    video.isConnected &&
    getVideoSource(video) !== '' &&
    video.videoWidth > 0 &&
    video.videoHeight > 0 &&
    !isAdVideo(video)
  );
}

function getVideoScore(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  const visibleArea = rect.width * rect.height;
  let score = video.readyState * 10;

  if (video.getAttribute('data-name') === 'video-content') {
    score += 1000;
  }

  if (!video.paused) {
    score += 70;
  }

  if (getVideoSource(video).startsWith('blob:')) {
    score += 20;
  }

  if (visibleArea > 0) {
    score += 25 + Math.min(visibleArea / 10000, 50);
  }

  score += Math.min((video.videoWidth * video.videoHeight) / 100000, 50);
  return score;
}

/**
 * メインコンテンツの動画要素を取得
 * Result型を返す
 */
function getMainVideo(): Result<HTMLVideoElement, VideoError | PageError> {
  const playerArea = getPlayerArea();
  if (!playerArea) {
    return err(domElementNotFoundError('Player area not found', '.grid-area_[player]'));
  }

  const videos = Array.from(playerArea.querySelectorAll('video')) as HTMLVideoElement[];
  const candidates = videos.filter((video) => isValidContentVideo(video));

  if (candidates.length === 0) {
    return err(videoElementNotFoundError('Valid content video not found'));
  }

  candidates.sort((a, b) => getVideoScore(b) - getVideoScore(a));
  const bestVideo = candidates[0];

  if (bestVideo.videoWidth <= 0 || bestVideo.videoHeight <= 0) {
    return err(
      videoDimensionsInvalidError(
        'Video dimensions not ready',
        bestVideo.videoWidth,
        bestVideo.videoHeight,
      ),
    );
  }

  return ok(bestVideo);
}

function getCanvasInPlayer(selector: string): HTMLCanvasElement | null {
  const playerArea = getPlayerArea();
  return playerArea?.querySelector<HTMLCanvasElement>(selector) ?? null;
}

function isDrawableCanvas(canvas: HTMLCanvasElement | null): canvas is HTMLCanvasElement {
  return !!canvas && canvas.isConnected && canvas.width > 0 && canvas.height > 0;
}

/**
 * コメントキャンバス要素を取得
 * コメントレイヤーはDOM更新中に一時的に消えるため、見つからない場合はnullにする
 */
function getCommentCanvas(): HTMLCanvasElement | null {
  const canvas = getCanvasInPlayer('[data-name="comment"] canvas');
  return isDrawableCanvas(canvas) ? canvas : null;
}

/**
 * サポーターキャンバス要素を取得（オプショナル）
 */
function getSupporterCanvas(): HTMLCanvasElement | null {
  const canvas = getCanvasInPlayer('[data-name="supporter-content"] canvas');
  return isDrawableCanvas(canvas) ? canvas : null;
}

/**
 * アップスケールされたキャンバスが存在するかチェック
 * Video Upscaling機能が有効な場合、高画質キャンバスが存在する
 */
function getUpscaledCanvas(): HTMLCanvasElement | null {
  const canvas = document.getElementById(UPSCALED_CANVAS_ID) as HTMLCanvasElement | null;
  if (!isDrawableCanvas(canvas) || canvas.style.display === 'none') {
    return null;
  }

  const playerArea = getPlayerArea();
  if (playerArea && !playerArea.contains(canvas)) {
    return null;
  }

  return canvas;
}

function resolvePiPSources(): Result<PiPSources, VideoError | PageError> {
  const videoResult = getMainVideo();
  if (videoResult.isErr()) {
    return err(videoResult.error);
  }

  const video = videoResult.value;
  return ok({
    video,
    videoSrc: getVideoSource(video),
    commentCanvas: getCommentCanvas(),
    supporterCanvas: getSupporterCanvas(),
    upscaledCanvas: getUpscaledCanvas(),
  });
}

function getCompositeDimensions(sources: PiPSources): Dimensions {
  if (sources.upscaledCanvas) {
    return {
      width: Math.max(1, sources.upscaledCanvas.width),
      height: Math.max(1, sources.upscaledCanvas.height),
    };
  }

  return {
    width: Math.max(1, sources.video.videoWidth),
    height: Math.max(1, sources.video.videoHeight),
  };
}

function isSupporterVisible(canvas: HTMLCanvasElement): boolean {
  const supporterContainer = canvas.closest('[data-name="supporter-content"]');
  if (!supporterContainer) {
    return true;
  }

  const style = getComputedStyle(supporterContainer);
  return style.opacity !== '0' && style.visibility !== 'hidden' && style.display !== 'none';
}

function hideElement(element: HTMLElement): void {
  if (!hiddenElementStyles.has(element)) {
    hiddenElementStyles.set(element, {
      visibility: element.style.visibility,
    });
  }

  element.style.visibility = 'hidden';
}

function restoreElement(element: HTMLElement): void {
  const previousStyle = hiddenElementStyles.get(element);
  if (previousStyle) {
    element.style.visibility = previousStyle.visibility;
    hiddenElementStyles.delete(element);
    return;
  }

  element.style.visibility = '';
}

function syncHiddenSourceElements(): void {
  if (!mainVideo) {
    return;
  }

  const videoSurface = upscaledCanvas ?? mainVideo;
  if (hiddenVideoSurface && hiddenVideoSurface !== videoSurface) {
    restoreElement(hiddenVideoSurface);
  }

  hideElement(videoSurface);
  hiddenVideoSurface = videoSurface;

  if (hiddenCommentCanvas && hiddenCommentCanvas !== commentCanvas) {
    restoreElement(hiddenCommentCanvas);
    hiddenCommentCanvas = null;
  }

  if (commentCanvas) {
    hideElement(commentCanvas);
    hiddenCommentCanvas = commentCanvas;
  }
}

function restoreHiddenSourceElements(): void {
  if (hiddenVideoSurface) {
    restoreElement(hiddenVideoSurface);
    hiddenVideoSurface = null;
  }

  if (hiddenCommentCanvas) {
    restoreElement(hiddenCommentCanvas);
    hiddenCommentCanvas = null;
  }
}

/**
 * PiPボタンを作成
 * ニコニコ動画のコントロールバーのスタイルに合わせたボタンを作成
 */
function createPiPButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = PIP_BUTTON_ID;
  button.setAttribute(PIP_BUTTON_MARKER, 'true');
  button.type = 'button';
  button.title = 'Picture-in-Picture';
  button.setAttribute('aria-label', 'Picture-in-Picture');

  // ニコニコ動画のコントロールバーボタンと同じクラス名を使用
  button.className = 'Pressable cursor_pointer';
  button.style.color = '#FFFFFF';

  button.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="5" width="22" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
      <rect x="14" y="14" width="9" height="7" rx="1" fill="currentColor"/>
    </svg>
  `;

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePiP();
  });

  return button;
}

function findFullscreenButton(playerArea: Element): HTMLButtonElement | null {
  const buttons = Array.from(playerArea.querySelectorAll('button')) as HTMLButtonElement[];
  return (
    buttons.find((button) => button.getAttribute('aria-label') === '全画面表示する') ??
    buttons.find((button) => button.getAttribute('aria-label')?.includes('全画面') ?? false) ??
    null
  );
}

/**
 * PiPボタンをDOMに追加
 * プレイヤーコントロールバーの全画面表示ボタンの前に挿入
 */
function addPiPButton(): boolean {
  if (!isWatchPage()) {
    removePiPButton();
    return false;
  }

  const playerArea = getPlayerArea();
  if (!playerArea) {
    return false;
  }

  const existingButton = playerArea.querySelector<HTMLButtonElement>(`#${PIP_BUTTON_ID}`);
  if (existingButton) {
    pipButton = existingButton;
    cleanupDuplicateButtons(existingButton);
    return true;
  }

  const fullscreenButton = findFullscreenButton(playerArea);
  if (!fullscreenButton) {
    console.warn('[Better Niconico] 全画面表示ボタンが見つかりません');
    return false;
  }

  const controlBarButtonGroup = fullscreenButton.parentElement;
  if (!controlBarButtonGroup) {
    console.warn('[Better Niconico] コントロールバーのボタングループが見つかりません');
    return false;
  }

  cleanupDuplicateButtons();
  pipButton = createPiPButton();
  controlBarButtonGroup.insertBefore(pipButton, fullscreenButton);

  console.log('[Better Niconico] PiPボタンをコントロールバーに追加しました');
  return true;
}

function cleanupDuplicateButtons(keepButton: HTMLButtonElement | null = null): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    `#${PIP_BUTTON_ID}, [${PIP_BUTTON_MARKER}]`,
  );

  buttons.forEach((button) => {
    if (button !== keepButton) {
      button.remove();
    }
  });
}

/**
 * PiPボタンを削除
 */
function removePiPButton(): void {
  cleanupDuplicateButtons();
  if (pipButton) {
    pipButton.remove();
    pipButton = null;
    console.log('[Better Niconico] PiPボタンを削除しました');
  }
}

/**
 * 合成用のcanvasとcontextを作成
 */
function createCompositeCanvas(
  dimensions: Dimensions,
): Result<{ canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }, VideoError> {
  const canvas = document.createElement('canvas');
  canvas.id = PIP_CANVAS_ID;
  canvas.setAttribute(PIP_CANVAS_MARKER, 'true');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext('2d');
  if (!context) {
    return err(videoNotReadyError('Failed to get 2D context from canvas', 0));
  }

  return ok({ canvas, context });
}

function resizeCompositeCanvas(dimensions: Dimensions): void {
  if (!pipCanvas) {
    return;
  }

  if (pipCanvas.width !== dimensions.width) {
    pipCanvas.width = dimensions.width;
  }

  if (pipCanvas.height !== dimensions.height) {
    pipCanvas.height = dimensions.height;
  }
}

/**
 * PiP用のvideo要素を作成
 */
function createPiPVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video');
  video.id = PIP_VIDEO_ID;
  video.setAttribute(PIP_VIDEO_MARKER, 'true');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.controls = true;

  // 非表示にする（PiPウィンドウのみ表示）
  video.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    opacity: 0;
    pointer-events: none;
    width: 1px;
    height: 1px;
  `;

  video.addEventListener('leavepictureinpicture', () => {
    console.log('[Better Niconico] PiPを終了しました');
    stopPiP();
  });

  return video;
}

function drawContained(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): void {
  if (!pipCanvasContext || sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const size = calcSize(sourceWidth, sourceHeight, targetWidth, targetHeight);
  if (size.width <= 0 || size.height <= 0) {
    return;
  }

  try {
    pipCanvasContext.drawImage(
      source,
      0,
      0,
      sourceWidth,
      sourceHeight,
      Math.floor((targetWidth - size.width) / 2),
      Math.floor((targetHeight - size.height) / 2),
      size.width,
      size.height,
    );
  } catch {
    // DOM差し替え直後など、一時的に描画できないソースは次フレームで再試行する。
  }
}

/**
 * フレームを合成してキャンバスに描画
 * アップスケーリングが有効な場合は高画質キャンバスを使用
 */
function renderCompositeFrame(): void {
  if (!mainVideo || !pipCanvas || !pipCanvasContext) {
    return;
  }

  pipCanvasContext.fillStyle = '#000';
  pipCanvasContext.fillRect(0, 0, pipCanvas.width, pipCanvas.height);

  const videoSource = isDrawableCanvas(upscaledCanvas) ? upscaledCanvas : mainVideo;
  const sourceWidth =
    videoSource instanceof HTMLCanvasElement ? videoSource.width : mainVideo.videoWidth;
  const sourceHeight =
    videoSource instanceof HTMLCanvasElement ? videoSource.height : mainVideo.videoHeight;

  drawContained(videoSource, sourceWidth, sourceHeight, pipCanvas.width, pipCanvas.height);

  if (supporterCanvas && isDrawableCanvas(supporterCanvas) && isSupporterVisible(supporterCanvas)) {
    drawContained(
      supporterCanvas,
      supporterCanvas.width,
      supporterCanvas.height,
      pipCanvas.width,
      pipCanvas.height,
    );
  }

  if (commentCanvas && isDrawableCanvas(commentCanvas)) {
    drawContained(
      commentCanvas,
      commentCanvas.width,
      commentCanvas.height,
      pipCanvas.width,
      pipCanvas.height,
    );
  }

  // captureStream(0) の場合、手動でフレームをキャプチャ
  if (pipStream) {
    const videoTrack = pipStream.getVideoTracks()[0] as
      | (MediaStreamTrack & { requestFrame?: () => void })
      | undefined;
    videoTrack?.requestFrame?.();
  }
}

function shouldReconnectSources(): boolean {
  if (!mainVideo || !mainVideo.isConnected || !isValidContentVideo(mainVideo)) {
    return true;
  }

  const sourceResult = resolvePiPSources();
  if (sourceResult.isErr()) {
    return true;
  }

  const sources = sourceResult.value;
  const dimensions = getCompositeDimensions(sources);

  return (
    sources.video !== mainVideo ||
    sources.videoSrc !== currentVideoSrc ||
    sources.commentCanvas !== commentCanvas ||
    sources.supporterCanvas !== supporterCanvas ||
    sources.upscaledCanvas !== upscaledCanvas ||
    !dimensionsEqual(dimensions, currentCompositeDimensions)
  );
}

/**
 * requestVideoFrameCallback を使用した合成ループ
 * 動画の実際のフレーム更新に同期して描画する
 */
function compositeLoopWithVideoFrameCallback(): void {
  if (!isRunningInPIP || !mainVideo || !pipCanvas || !pipCanvasContext) {
    return;
  }

  if (shouldReconnectSources()) {
    scheduleSourceReconnect();
    return;
  }

  renderCompositeFrame();

  videoFrameCallbackId = mainVideo.requestVideoFrameCallback(() => {
    compositeLoopWithVideoFrameCallback();
  });
}

/**
 * requestAnimationFrame を使用した合成ループ（フォールバック）
 */
function compositeLoopWithAnimationFrame(): void {
  if (!isRunningInPIP || !mainVideo || !pipCanvas || !pipCanvasContext) {
    return;
  }

  if (shouldReconnectSources()) {
    scheduleSourceReconnect();
    return;
  }

  renderCompositeFrame();
  animationFrameId = requestAnimationFrame(compositeLoopWithAnimationFrame);
}

/**
 * 合成ループを開始
 */
function startCompositeLoop(): void {
  stopCompositeLoop();

  if (supportsRequestVideoFrameCallback() && mainVideo) {
    console.log('[Better Niconico] requestVideoFrameCallback を使用（フレーム同期モード）');
    compositeLoopWithVideoFrameCallback();
  } else {
    console.log('[Better Niconico] requestAnimationFrame を使用（フォールバックモード）');
    compositeLoopWithAnimationFrame();
  }
}

/**
 * 合成ループを停止
 */
function stopCompositeLoop(): void {
  if (videoFrameCallbackId !== null && mainVideo) {
    mainVideo.cancelVideoFrameCallback(videoFrameCallbackId);
    videoFrameCallbackId = null;
  }

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function clearSourceReconnectTimer(): void {
  if (sourceReconnectTimer !== null) {
    clearTimeout(sourceReconnectTimer);
    sourceReconnectTimer = null;
  }
}

function scheduleSourceReconnect(delay = RECONNECT_DELAY_MS): void {
  if (!isRunningInPIP) {
    return;
  }

  clearSourceReconnectTimer();
  sourceReconnectTimer = window.setTimeout(() => {
    sourceReconnectTimer = null;
    reconnectPiPSources();
  }, delay);
}

function applySourcesToState(sources: PiPSources): void {
  const dimensions = getCompositeDimensions(sources);
  resizeCompositeCanvas(dimensions);

  mainVideo = sources.video;
  currentVideoSrc = sources.videoSrc;
  commentCanvas = sources.commentCanvas;
  supporterCanvas = sources.supporterCanvas;
  upscaledCanvas = sources.upscaledCanvas;
  currentCompositeDimensions = dimensions;
}

function reconnectPiPSources(): void {
  if (!isRunningInPIP || !pipCanvas || !pipCanvasContext) {
    return;
  }

  if (!isWatchPage()) {
    stopPiP();
    removePiPButton();
    return;
  }

  const sourceResult = resolvePiPSources();
  if (sourceResult.isErr()) {
    console.warn('[Better Niconico] PiPソースの再接続を待機します:', sourceResult.error);
    scheduleSourceReconnect(RETRY_DELAY_MS);
    return;
  }

  stopCompositeLoop();
  applySourcesToState(sourceResult.value);
  syncHiddenSourceElements();
  renderCompositeFrame();
  startCompositeLoop();

  console.log('[Better Niconico] PiPソースを現在のプレイヤーに再接続しました');
}

function isSessionCurrent(token: number): boolean {
  return currentEnabled && pipSessionToken === token && isWatchPage();
}

/**
 * PiPを開始
 */
async function startPiP(): Promise<void> {
  if (isRunningInPIP || isStartingPIP) {
    console.log('[Better Niconico] PiPは既に実行中です');
    return;
  }

  if (!document.pictureInPictureEnabled) {
    console.warn('[Better Niconico] このブラウザではPicture-in-Pictureが使用できません');
    return;
  }

  console.log('[Better Niconico] PiPを開始します...');
  isStartingPIP = true;
  const token = ++pipSessionToken;

  const sourceResult = resolvePiPSources();
  if (sourceResult.isErr()) {
    console.error('[Better Niconico] PiPソースが見つかりません:', sourceResult.error);
    isStartingPIP = false;
    return;
  }

  const sources = sourceResult.value;
  const dimensions = getCompositeDimensions(sources);
  const compositeResult = createCompositeCanvas(dimensions);
  if (compositeResult.isErr()) {
    console.error('[Better Niconico] 合成キャンバスの作成に失敗:', compositeResult.error);
    isStartingPIP = false;
    return;
  }

  pipCanvas = compositeResult.value.canvas;
  pipCanvasContext = compositeResult.value.context;
  applySourcesToState(sources);

  if (upscaledCanvas) {
    console.log(
      `[Better Niconico] PiPキャンバスサイズを高画質に調整: ${pipCanvas.width}x${pipCanvas.height}`,
    );
  }

  try {
    isRunningInPIP = true;

    pipStream = pipCanvas.captureStream(0);
    pipVideo = createPiPVideo(pipStream);
    document.body.appendChild(pipVideo);

    renderCompositeFrame();
    startCompositeLoop();

    await pipVideo.play();
    if (!isSessionCurrent(token)) {
      stopPiP();
      return;
    }

    await pipVideo.requestPictureInPicture();
    if (!isSessionCurrent(token)) {
      stopPiP();
      return;
    }

    syncHiddenSourceElements();
    console.log('[Better Niconico] PiPを開始しました');
  } catch (error) {
    console.error('[Better Niconico] PiPの開始に失敗:', error);
    stopPiP();
  } finally {
    isStartingPIP = false;
  }
}

/**
 * PiPを停止
 */
function stopPiP(): void {
  if (
    isStoppingPIP ||
    (!isRunningInPIP && !isStartingPIP && !pipVideo && !pipStream && !pipCanvas)
  ) {
    return;
  }

  isStoppingPIP = true;
  isStartingPIP = false;
  isRunningInPIP = false;
  pipSessionToken += 1;

  console.log('[Better Niconico] PiPを停止します...');

  clearSourceReconnectTimer();
  stopCompositeLoop();
  restoreHiddenSourceElements();

  const videoElement = pipVideo;
  if (videoElement) {
    if (document.pictureInPictureElement === videoElement) {
      void document.exitPictureInPicture().catch((error) => {
        console.warn('[Better Niconico] PiP終了処理に失敗:', error);
      });
    }

    videoElement.pause();
    if (document.contains(videoElement)) {
      videoElement.remove();
    }
    pipVideo = null;
  }

  if (pipStream) {
    pipStream.getTracks().forEach((track) => track.stop());
    pipStream = null;
  }

  pipCanvas = null;
  pipCanvasContext = null;
  mainVideo = null;
  currentVideoSrc = null;
  currentCompositeDimensions = null;
  upscaledCanvas = null;
  commentCanvas = null;
  supporterCanvas = null;

  isStoppingPIP = false;
  console.log('[Better Niconico] PiPを停止しました');
}

/**
 * PiPのトグル
 */
function togglePiP(): void {
  if (isRunningInPIP) {
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture();
    } else {
      stopPiP();
    }
  } else {
    void startPiP();
  }
}

function nodeContainsPipTarget(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const element = node as Element;
  return element.matches(PIP_TARGET_SELECTOR) || !!element.querySelector(PIP_TARGET_SELECTOR);
}

function handleFeatureMutations(mutations: MutationRecord[]): void {
  if (!currentEnabled) {
    return;
  }

  if (!isWatchPage()) {
    stopPiP();
    removePiPButton();
    return;
  }

  let shouldUpdateButton = false;
  let shouldReconnect = false;

  for (const mutation of mutations) {
    if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
      if (mutation.target instanceof HTMLVideoElement) {
        shouldReconnect = true;
      }
      continue;
    }

    if (mutation.type !== 'childList') {
      continue;
    }

    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    if (changedNodes.some((node) => nodeContainsPipTarget(node))) {
      shouldUpdateButton = true;
      shouldReconnect = true;
    }
  }

  if (shouldUpdateButton) {
    addPiPButton();
  }

  if (shouldReconnect) {
    scheduleSourceReconnect();
  }
}

function setupFeatureObserver(): void {
  if (featureObserver || !document.body) {
    return;
  }

  featureObserver = new MutationObserver(handleFeatureMutations);
  featureObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });
}

function stopFeatureObserver(): void {
  if (featureObserver) {
    featureObserver.disconnect();
    featureObserver = null;
  }
}

function handleNavigationChange(): void {
  if (lastPageUrl === window.location.href) {
    return;
  }

  lastPageUrl = window.location.href;
  if (!currentEnabled) {
    return;
  }

  if (!isWatchPage()) {
    stopPiP();
    removePiPButton();
    return;
  }

  addPiPButton();
  scheduleSourceReconnect(RETRY_DELAY_MS);
}

function setupNavigationWatcher(): void {
  if (navigationIntervalId !== null) {
    return;
  }

  lastPageUrl = window.location.href;
  window.addEventListener('popstate', handleNavigationChange);
  navigationIntervalId = window.setInterval(handleNavigationChange, 500);
}

function stopNavigationWatcher(): void {
  window.removeEventListener('popstate', handleNavigationChange);

  if (navigationIntervalId !== null) {
    clearInterval(navigationIntervalId);
    navigationIntervalId = null;
  }
}

/**
 * 機能を有効化
 */
function enableFeature(): void {
  currentEnabled = true;
  setupFeatureObserver();
  setupNavigationWatcher();

  if (!isWatchPage()) {
    removePiPButton();
    return;
  }

  addPiPButton();
}

/**
 * 機能を無効化
 */
function disableFeature(): void {
  currentEnabled = false;
  stopPiP();
  clearSourceReconnectTimer();
  removePiPButton();
  stopFeatureObserver();
  stopNavigationWatcher();
}

/**
 * 設定を適用する（冪等性を保証）
 * @param enabled - true: PiP機能有効, false: PiP機能無効
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    enableFeature();
  } else {
    disableFeature();
  }
}
