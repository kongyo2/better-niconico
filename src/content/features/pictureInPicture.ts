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
 * - Comment canvas: [data-name="comment"] canvas (1364x768)
 * - Supporter canvas: [data-name="supporter-content"] canvas (1280x720, now supported)
 * - Combines video, supporter view, and comments with aspect ratio preservation
 * - Uses requestVideoFrameCallback for perfect frame sync (Chrome 83+)
 * - Falls back to requestAnimationFrame if requestVideoFrameCallback is not available
 * - Uses canvas.captureStream(0) with manual frame capture for optimal sync
 * - Adds PiP button to player control bar (before fullscreen button)
 * - Button uses Niconico's native control bar styling for consistency
 * - Automatic reinitialization when comment layer is destroyed
 *
 * SYNC FIX (December 2025):
 * - Changed from requestAnimationFrame to requestVideoFrameCallback
 * - requestVideoFrameCallback syncs with actual video frame updates, eliminating sync drift
 * - captureStream(0) + requestFrame() gives precise frame control
 * - Removed setTimeout-based fallback for hidden tabs (video playback is usually paused anyway)
 */

import { Result, ok, err } from 'neverthrow';
import type { VideoError, PageError } from '../../types/errors';
import {
  videoElementNotFoundError,
  videoNotReadyError,
  videoDimensionsInvalidError,
  domElementNotFoundError,
} from '../../types/errors';
import {
  initRenderer as initNiconicommentsRenderer,
  cleanupRenderer as cleanupNiconicommentsRenderer,
  drawCommentsAtTime,
  getRendererCanvas,
  isRendererReady,
} from './niconicommentsRenderer';

// マーカー属性
const PIP_BUTTON_MARKER = 'data-bn-pip-button';
const PIP_VIDEO_MARKER = 'data-bn-pip-video';
const PIP_CANVAS_MARKER = 'data-bn-pip-canvas';

// 要素ID
const PIP_BUTTON_ID = 'bn-pip-button';
const PIP_CANVAS_ID = 'bn-pip-canvas';
const PIP_VIDEO_ID = 'bn-pip-video';

// グローバル状態
let isRunningInPIP: boolean = false;
let videoFrameCallbackId: number | null = null;
let animationFrameId: number | null = null; // フォールバック用
let pipButton: HTMLButtonElement | null = null;
let pipCanvas: HTMLCanvasElement | null = null;
let pipCanvasContext: CanvasRenderingContext2D | null = null;
let pipVideo: HTMLVideoElement | null = null;
let pipStream: MediaStream | null = null;
let mainVideo: HTMLVideoElement | null = null;
let upscaledCanvas: HTMLCanvasElement | null = null; // アップスケールキャンバス（存在する場合）
let commentCanvas: HTMLCanvasElement | null = null;
let supporterCanvas: HTMLCanvasElement | null = null;
let niconicommentsCanvas: HTMLCanvasElement | null = null; // 高パフォーマンスモード用

// 高パフォーマンスモード設定
let highPerformanceModeEnabled: boolean = false;

// Video Upscalingのキャンバス要素ID（videoUpscaling.tsと同期）
const UPSCALED_CANVAS_ID = 'bn-upscaled-canvas';

// requestVideoFrameCallback サポートチェック
function supportsRequestVideoFrameCallback(): boolean {
  return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
}

/**
 * アップスケールされたキャンバスが存在するかチェック
 * Video Upscaling機能が有効な場合、高画質キャンバスが存在する
 */
function getUpscaledCanvas(): HTMLCanvasElement | null {
  const canvas = document.getElementById(UPSCALED_CANVAS_ID) as HTMLCanvasElement | null;
  // キャンバスが存在し、表示されている場合のみ有効
  if (canvas && canvas.style.display !== 'none' && canvas.width > 0 && canvas.height > 0) {
    return canvas;
  }
  return null;
}


/**
 * 動画視聴ページかどうかを判定
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * アスペクト比を保持しながらリサイズした寸法を計算
 * @param srcWidth - ソースの幅
 * @param srcHeight - ソースの高さ
 * @param dstWidth - 目標の幅
 * @param dstHeight - 目標の高さ
 * @returns リサイズ後の幅と高さ
 */
function calcSize(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): { width: number; height: number } {
  const wr = dstWidth / srcWidth;
  const hr = dstHeight / srcHeight;
  const rate = Math.min(wr, hr);
  return {
    width: Math.floor(srcWidth * rate),
    height: Math.floor(srcHeight * rate),
  };
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
  return video.src !== '' && video.videoWidth > 0 && video.videoHeight > 0 && !isAdVideo(video);
}

/**
 * メインコンテンツの動画要素を取得
 * Result型を返す
 */
function getMainVideo(): Result<HTMLVideoElement, VideoError | PageError> {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return err(domElementNotFoundError('Player area not found', '.grid-area_[player]'));
  }

  const videos = Array.from(playerArea.querySelectorAll('video')) as HTMLVideoElement[];

  // 有効なコンテンツ動画を探す
  let bestVideo: HTMLVideoElement | null = null;
  let bestReadyState = -1;

  for (const video of videos) {
    if (isValidContentVideo(video)) {
      if (video.readyState > bestReadyState) {
        bestVideo = video;
        bestReadyState = video.readyState;
      }
    }
  }

  if (!bestVideo) {
    return err(videoElementNotFoundError('Valid content video not found'));
  }

  // 動画の準備状態をチェック
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

/**
 * コメントキャンバス要素を取得
 * Result型を返す
 */
function getCommentCanvas(): Result<HTMLCanvasElement, PageError> {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return err(domElementNotFoundError('Player area not found', '.grid-area_[player]'));
  }

  // [data-name="comment"] 配下のcanvas要素を探す
  const commentContainer = playerArea.querySelector('[data-name="comment"]');
  if (!commentContainer) {
    return err(domElementNotFoundError('Comment container not found', '[data-name="comment"]'));
  }

  const canvas = commentContainer.querySelector('canvas') as HTMLCanvasElement;
  if (!canvas) {
    return err(domElementNotFoundError('Comment canvas not found', '[data-name="comment"] canvas'));
  }

  return ok(canvas);
}

/**
 * サポーターキャンバス要素を取得（オプショナル）
 * サポーター表示が存在しない場合はnullを返す
 * Result型を返す
 */
function getSupporterCanvas(): Result<HTMLCanvasElement | null, PageError> {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return err(domElementNotFoundError('Player area not found', '.grid-area_[player]'));
  }

  // [data-name="supporter-content"] 配下のcanvas要素を探す
  const supporterContainer = playerArea.querySelector('[data-name="supporter-content"]');
  if (!supporterContainer) {
    // サポーター表示は任意なのでnullを返す
    return ok(null);
  }

  const canvas = supporterContainer.querySelector('canvas') as HTMLCanvasElement;
  if (!canvas) {
    // サポーター表示コンテナは存在するがキャンバスがない場合もnullを返す
    return ok(null);
  }

  return ok(canvas);
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
  // ボタンの色を白に設定（他のボタンに合わせる）
  button.style.color = '#FFFFFF';

  // PiP SVGアイコン（サイズを調整）
  button.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="22" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
      <rect x="14" y="14" width="9" height="7" rx="1" fill="currentColor"/>
    </svg>
  `;

  // クリックイベント
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePiP();
  });

  return button;
}

/**
 * PiPボタンをDOMに追加
 * プレイヤーコントロールバーの全画面表示ボタンの前に挿入
 */
function addPiPButton(): void {
  // 既に存在する場合はスキップ
  if (pipButton && document.contains(pipButton)) {
    return;
  }

  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return;
  }

  // 全画面表示ボタンを探す
  const fullscreenButton = Array.from(playerArea.querySelectorAll('button')).find(
    (btn) => btn.getAttribute('aria-label') === '全画面表示する',
  );

  if (!fullscreenButton) {
    console.warn('[Better Niconico] 全画面表示ボタンが見つかりません');
    return;
  }

  // 全画面表示ボタンの親要素（コントロールバーのボタングループ）を取得
  const controlBarButtonGroup = fullscreenButton.parentElement;
  if (!controlBarButtonGroup) {
    console.warn('[Better Niconico] コントロールバーのボタングループが見つかりません');
    return;
  }

  // PiPボタンを作成
  pipButton = createPiPButton();

  // 全画面表示ボタンの前に挿入
  controlBarButtonGroup.insertBefore(pipButton, fullscreenButton);

  console.log('[Better Niconico] PiPボタンをコントロールバーに追加しました');
}

/**
 * PiPボタンを削除
 */
function removePiPButton(): void {
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
  video: HTMLVideoElement,
): Result<{ canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }, VideoError> {
  const canvas = document.createElement('canvas');
  canvas.id = PIP_CANVAS_ID;
  canvas.setAttribute(PIP_CANVAS_MARKER, 'true');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    return err(videoNotReadyError('Failed to get 2D context from canvas', 0));
  }

  return ok({ canvas, context });
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

  // PiPから抜けた時のクリーンアップ
  video.addEventListener('leavepictureinpicture', () => {
    console.log('[Better Niconico] PiPを終了しました');
    stopPiP();
  });

  return video;
}

/**
 * フレームを合成してキャンバスに描画
 * アップスケーリングが有効な場合は高画質キャンバスを使用
 * 高パフォーマンスモードではniconicommentsを使用してコメントを描画
 */
function renderCompositeFrame(): void {
  if (!mainVideo || !pipCanvas || !pipCanvasContext) {
    return;
  }

  // 高パフォーマンスモードの場合、niconicommentsでコメントを更新
  if (highPerformanceModeEnabled && isRendererReady()) {
    drawCommentsAtTime(mainVideo.currentTime);
    niconicommentsCanvas = getRendererCanvas();
  }

  // コメントキャンバスを決定（高パフォーマンスモード vs 通常モード）
  const activeCommentCanvas = highPerformanceModeEnabled ? niconicommentsCanvas : commentCanvas;

  // 通常モードではcommentCanvasが必須
  if (!highPerformanceModeEnabled && !commentCanvas) {
    return;
  }

  // 黒背景を塗りつぶし（レターボックス用）
  pipCanvasContext.fillStyle = '#000';
  pipCanvasContext.fillRect(0, 0, pipCanvas.width, pipCanvas.height);

  // アップスケールキャンバスが存在する場合はそれを使用（高画質）
  // 存在しない場合は元の動画を使用
  const videoSource: CanvasImageSource | null = upscaledCanvas || mainVideo;
  const sourceWidth = upscaledCanvas ? upscaledCanvas.width : mainVideo.videoWidth;
  const sourceHeight = upscaledCanvas ? upscaledCanvas.height : mainVideo.videoHeight;

  // メイン映像をアスペクト比を保持して描画
  if (sourceWidth > 0 && sourceHeight > 0 && videoSource) {
    const videoSize = calcSize(sourceWidth, sourceHeight, pipCanvas.width, pipCanvas.height);
    pipCanvasContext.drawImage(
      videoSource,
      0,
      0,
      sourceWidth,
      sourceHeight,
      (pipCanvas.width - videoSize.width) / 2,
      (pipCanvas.height - videoSize.height) / 2,
      videoSize.width,
      videoSize.height,
    );
  }

  // サポーター表示をアスペクト比を保持して描画
  if (supporterCanvas) {
    const playerArea = document.querySelector('.grid-area_\\[player\\]');
    const supporterContainer = playerArea?.querySelector('[data-name="supporter-content"]');

    // opacity が 0 でない場合のみ描画（非表示時はスキップ）
    if (supporterContainer && getComputedStyle(supporterContainer).opacity !== '0') {
      const supporterSize = calcSize(
        supporterCanvas.width,
        supporterCanvas.height,
        pipCanvas.width,
        pipCanvas.height,
      );
      pipCanvasContext.drawImage(
        supporterCanvas,
        0,
        0,
        supporterCanvas.width,
        supporterCanvas.height,
        (pipCanvas.width - supporterSize.width) / 2,
        (pipCanvas.height - supporterSize.height) / 2,
        supporterSize.width,
        supporterSize.height,
      );
    }
  }

  // コメントキャンバスをアスペクト比を保持して描画
  if (activeCommentCanvas && activeCommentCanvas.width > 0 && activeCommentCanvas.height > 0) {
    const commentSize = calcSize(
      activeCommentCanvas.width,
      activeCommentCanvas.height,
      pipCanvas.width,
      pipCanvas.height,
    );
    pipCanvasContext.drawImage(
      activeCommentCanvas,
      0,
      0,
      activeCommentCanvas.width,
      activeCommentCanvas.height,
      (pipCanvas.width - commentSize.width) / 2,
      (pipCanvas.height - commentSize.height) / 2,
      commentSize.width,
      commentSize.height,
    );
  }

  // captureStream(0) の場合、手動でフレームをキャプチャ
  if (pipStream) {
    const videoTrack = pipStream.getVideoTracks()[0];
    if (videoTrack && 'requestFrame' in videoTrack) {
      (videoTrack as MediaStreamVideoTrack & { requestFrame: () => void }).requestFrame();
    }
  }
}

/**
 * requestVideoFrameCallback を使用した合成ループ
 * 動画の実際のフレーム更新に同期して描画する
 */
function compositeLoopWithVideoFrameCallback(): void {
  if (!isRunningInPIP || !mainVideo || !pipCanvas || !pipCanvasContext) {
    return;
  }

  // 高パフォーマンスモードでない場合のみ、コメントキャンバスの存在を確認
  if (!highPerformanceModeEnabled && !commentCanvas) {
    return;
  }

  // コメントレイヤーの破棄検知（通常モードのみ）
  if (!highPerformanceModeEnabled && commentCanvas) {
    if (!commentCanvas.parentElement || commentCanvas.width === 0 || commentCanvas.height === 0) {
      console.log('[Better Niconico] コメントレイヤーの破棄を検知しました。PiPを再初期化します');
      void reinitializePiP();
      return;
    }
  }

  // フレームを描画
  renderCompositeFrame();

  // 次のフレームを予約（動画フレームに同期）
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

  // 高パフォーマンスモードでない場合のみ、コメントキャンバスの存在を確認
  if (!highPerformanceModeEnabled && !commentCanvas) {
    return;
  }

  // コメントレイヤーの破棄検知（通常モードのみ）
  if (!highPerformanceModeEnabled && commentCanvas) {
    if (!commentCanvas.parentElement || commentCanvas.width === 0 || commentCanvas.height === 0) {
      console.log('[Better Niconico] コメントレイヤーの破棄を検知しました。PiPを再初期化します');
      void reinitializePiP();
      return;
    }
  }

  // フレームを描画
  renderCompositeFrame();

  // 次のフレームを予約
  animationFrameId = requestAnimationFrame(compositeLoopWithAnimationFrame);
}

/**
 * 合成ループを開始
 */
function startCompositeLoop(): void {
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
  // requestVideoFrameCallback をキャンセル
  if (videoFrameCallbackId !== null && mainVideo) {
    mainVideo.cancelVideoFrameCallback(videoFrameCallbackId);
    videoFrameCallbackId = null;
  }

  // requestAnimationFrame をキャンセル
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/**
 * PiPを開始
 */
async function startPiP(): Promise<void> {
  if (isRunningInPIP) {
    console.log('[Better Niconico] PiPは既に実行中です');
    return;
  }

  console.log('[Better Niconico] PiPを開始します...');

  // 高パフォーマンスモードの場合、niconicommentsレンダラーを初期化
  if (highPerformanceModeEnabled) {
    console.log('[Better Niconico] 高パフォーマンスモード: niconicommentsを初期化中...');
    initNiconicommentsRenderer();
    niconicommentsCanvas = getRendererCanvas();
  }

  // メインビデオを取得
  const videoResult = getMainVideo();
  if (videoResult.isErr()) {
    console.error('[Better Niconico] メインビデオが見つかりません:', videoResult.error);
    return;
  }
  mainVideo = videoResult.value;

  // アップスケールキャンバスを検出（Video Upscaling機能との連携）
  upscaledCanvas = getUpscaledCanvas();
  if (upscaledCanvas) {
    console.log('[Better Niconico] アップスケールキャンバスを検出しました（高画質モード）');
  }

  // コメントキャンバスを取得（通常モードでは必須、高パフォーマンスモードではオプショナル）
  const canvasResult = getCommentCanvas();
  if (canvasResult.isErr()) {
    if (!highPerformanceModeEnabled) {
      console.error('[Better Niconico] コメントキャンバスが見つかりません:', canvasResult.error);
      return;
    }
    // 高パフォーマンスモードではniconicommentsを使うのでエラーにしない
    console.log('[Better Niconico] 高パフォーマンスモード: ネイティブコメントキャンバスなしで動作');
  } else {
    commentCanvas = canvasResult.value;
  }

  // サポーターキャンバスを取得（オプショナル）
  const supporterResult = getSupporterCanvas();
  if (supporterResult.isErr()) {
    console.error('[Better Niconico] サポーターキャンバスの取得に失敗:', supporterResult.error);
    return;
  }
  supporterCanvas = supporterResult.value;
  if (supporterCanvas) {
    console.log('[Better Niconico] サポーター表示を検出しました');
  }

  // 合成用キャンバスを作成
  // アップスケールキャンバスが存在する場合はそのサイズを使用（高解像度）
  const compositeResult = createCompositeCanvas(mainVideo);
  if (compositeResult.isErr()) {
    console.error('[Better Niconico] 合成キャンバスの作成に失敗:', compositeResult.error);
    return;
  }
  pipCanvas = compositeResult.value.canvas;
  pipCanvasContext = compositeResult.value.context;

  // アップスケールキャンバスが存在する場合、PiPキャンバスのサイズを調整
  if (upscaledCanvas) {
    pipCanvas.width = upscaledCanvas.width;
    pipCanvas.height = upscaledCanvas.height;
    console.log(
      `[Better Niconico] PiPキャンバスサイズを高画質に調整: ${pipCanvas.width}x${pipCanvas.height}`,
    );
  }

  // フラグを設定
  isRunningInPIP = true;

  // 合成ループを開始
  startCompositeLoop();

  // MediaStreamを作成（0fps = 手動フレーム制御で完璧な同期を実現）
  pipStream = pipCanvas.captureStream(0);

  // PiP用video要素を作成
  pipVideo = createPiPVideo(pipStream);
  document.body.appendChild(pipVideo);

  try {
    // ビデオを再生
    await pipVideo.play();

    // アップスケーリング有効時はアップスケールキャンバスを非表示にする
    // アップスケーリング無効時は元のビデオを非表示にする
    if (upscaledCanvas) {
      upscaledCanvas.style.visibility = 'hidden';
    } else {
      mainVideo.style.visibility = 'hidden';
    }

    // 通常モードの場合のみネイティブコメントキャンバスを非表示
    if (commentCanvas && !highPerformanceModeEnabled) {
      commentCanvas.style.visibility = 'hidden';
    }

    // PiPを要求
    await pipVideo.requestPictureInPicture();

    const modeLabel = highPerformanceModeEnabled ? '高パフォーマンスモード' : '通常モード';
    console.log(`[Better Niconico] PiPを開始しました (${modeLabel})`);
  } catch (error) {
    console.error('[Better Niconico] PiPの開始に失敗:', error);
    stopPiP();
  }
}

/**
 * PiPを停止
 */
function stopPiP(): void {
  if (!isRunningInPIP) {
    return;
  }

  console.log('[Better Niconico] PiPを停止します...');

  // 合成ループを停止
  stopCompositeLoop();

  // 高パフォーマンスモードの場合、niconicommentsレンダラーをクリーンアップ
  if (highPerformanceModeEnabled) {
    cleanupNiconicommentsRenderer();
    niconicommentsCanvas = null;
  }

  // PiP video要素を削除
  if (pipVideo) {
    pipVideo.pause();
    if (document.contains(pipVideo)) {
      pipVideo.remove();
    }
    pipVideo = null;
  }

  // MediaStreamを停止
  if (pipStream) {
    pipStream.getTracks().forEach((track) => track.stop());
    pipStream = null;
  }

  // 合成キャンバスを削除
  pipCanvas = null;
  pipCanvasContext = null;

  // アップスケールキャンバスを再表示（アップスケーリングが有効だった場合）
  if (upscaledCanvas) {
    upscaledCanvas.style.visibility = '';
    // 元動画はアップスケーリングによってdisplay:noneになっているので、そのまま維持
  } else if (mainVideo) {
    // アップスケーリングが無効な場合は元動画を再表示
    mainVideo.style.visibility = '';
  }

  // コメントを再表示（通常モードで非表示にしていた場合）
  if (commentCanvas && !highPerformanceModeEnabled) {
    commentCanvas.style.visibility = '';
  }

  // 参照をクリア
  mainVideo = null;
  upscaledCanvas = null;
  commentCanvas = null;
  supporterCanvas = null;

  // フラグをクリア
  isRunningInPIP = false;

  console.log('[Better Niconico] PiPを停止しました');
}

/**
 * PiPを再初期化
 * コメントレイヤーが破棄された場合などに使用
 */
async function reinitializePiP(): Promise<void> {
  console.log('[Better Niconico] PiPを再初期化します...');

  // 現在のPiPを停止（ただしPiPウィンドウは維持したい）
  const wasPiPActive = isRunningInPIP;

  // 合成ループを停止（mainVideoへの参照が残っている間に呼ぶ）
  stopCompositeLoop();

  // 参照をクリア（PiPビデオは維持）
  mainVideo = null;
  upscaledCanvas = null;
  commentCanvas = null;
  supporterCanvas = null;

  // フラグをクリア
  isRunningInPIP = false;

  // 少し待ってから再初期化
  await new Promise((resolve) => setTimeout(resolve, 100));

  // PiPが有効だった場合は再開始
  if (wasPiPActive) {
    void startPiP();
  }
}

/**
 * PiPのトグル
 */
function togglePiP(): void {
  if (isRunningInPIP) {
    // PiPから抜ける
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture();
    } else {
      stopPiP();
    }
  } else {
    // PiPを開始
    void startPiP();
  }
}

/**
 * 機能を有効化
 */
function enableFeature(): void {
  if (!isWatchPage()) {
    return;
  }

  // PiPボタンを追加
  addPiPButton();
}

/**
 * 機能を無効化
 */
function disableFeature(): void {
  // PiPが実行中なら停止
  if (isRunningInPIP) {
    stopPiP();
  }

  // PiPボタンを削除
  removePiPButton();
}

/**
 * 設定を適用する（冪等性を保証）
 * @param enabled - true: PiP機能有効, false: PiP機能無効
 * @param highPerformanceMode - true: niconicommentsを使用した高パフォーマンスモード
 */
export function apply(enabled: boolean, highPerformanceMode: boolean = false): void {
  // 高パフォーマンスモード設定を更新
  highPerformanceModeEnabled = highPerformanceMode;

  if (enabled) {
    enableFeature();
  } else {
    disableFeature();
  }
}
