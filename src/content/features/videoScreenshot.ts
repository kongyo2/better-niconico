/**
 * Video Screenshot 機能
 * ニコニコ動画の動画フレーム、サポーター表示、コメントを合成してスクリーンショットを保存する
 * watch ページでのみ動作します
 *
 * IMPLEMENTATION NOTES:
 * - Main video element: blob: URL, outside #nv_watch_VideoAdContainer
 * - Comment canvas: [data-name="comment"] canvas (1364x768)
 * - Supporter canvas: [data-name="supporter-content"] canvas (1280x720, optional)
 * - Combines current video frame, supporter view (if visible), and comments
 * - Downloads as PNG file with format: niconico_{videoId}_{timestamp}.png
 * - Uses canvas.toBlob() for image generation
 * - Adds screenshot button to player control bar (before fullscreen button)
 * - Button uses Niconico's native control bar styling for consistency
 */

import { Result, ok, err } from 'neverthrow';
import type { VideoError, PageError } from '../../types/errors';
import {
  videoElementNotFoundError,
  videoDimensionsInvalidError,
  domElementNotFoundError,
} from '../../types/errors';

// マーカー属性
const SCREENSHOT_BUTTON_MARKER = 'data-bn-screenshot-button';

// 要素ID
const SCREENSHOT_BUTTON_ID = 'bn-screenshot-button';

// グローバル状態
let screenshotButton: HTMLButtonElement | null = null;

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
 * 動画IDを取得（URLから抽出）
 */
function getVideoId(): string {
  const match = window.location.pathname.match(/\/watch\/([^/?]+)/);
  return match ? match[1] : 'video';
}

/**
 * タイムスタンプ文字列を生成（HH-MM-SS形式）
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${hours.toString().padStart(2, '0')}-${minutes.toString().padStart(2, '0')}-${secs.toString().padStart(2, '0')}`;
}

/**
 * ファイル名を生成
 */
function generateFilename(video: HTMLVideoElement): string {
  const videoId = getVideoId();
  const timestamp = formatTimestamp(video.currentTime);
  return `niconico_${videoId}_${timestamp}.png`;
}

/**
 * スクリーンショットボタンを作成
 * ニコニコ動画のコントロールバーのスタイルに合わせたボタンを作成
 */
function createScreenshotButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = SCREENSHOT_BUTTON_ID;
  button.setAttribute(SCREENSHOT_BUTTON_MARKER, 'true');
  button.type = 'button';
  button.title = 'スクリーンショット';
  button.setAttribute('aria-label', 'スクリーンショット');

  // ニコニコ動画のコントロールバーボタンと同じクラス名を使用
  button.className = 'Pressable cursor_pointer';
  // ボタンの色を白に設定（他のボタンに合わせる）
  button.style.color = '#FFFFFF';

  // カメラ SVGアイコン
  button.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="7" width="20" height="15" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
      <circle cx="14" cy="14.5" r="4" stroke="currentColor" stroke-width="2" fill="none"/>
      <rect x="8" y="4" width="6" height="3" rx="1.5" fill="currentColor"/>
      <circle cx="20" cy="10" r="1" fill="currentColor"/>
    </svg>
  `;

  // クリックイベント
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    void captureScreenshot();
  });

  return button;
}

/**
 * スクリーンショットボタンをDOMに追加
 * プレイヤーコントロールバーの全画面表示ボタンの前に挿入
 */
function addScreenshotButton(): void {
  // 既に存在する場合はスキップ
  if (screenshotButton && document.contains(screenshotButton)) {
    return;
  }

  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return;
  }

  // 全画面表示ボタンを探す（旧aria-label「全画面表示」もフォールバックで受ける）
  const fullscreenButton = Array.from(playerArea.querySelectorAll('button')).find((btn) => {
    const label = btn.getAttribute('aria-label');
    return label === '全画面表示する' || label === '全画面表示' || label?.includes('全画面');
  });

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

  // スクリーンショットボタンを作成
  screenshotButton = createScreenshotButton();

  // 全画面表示ボタンの前に挿入
  controlBarButtonGroup.insertBefore(screenshotButton, fullscreenButton);

  console.log('[Better Niconico] スクリーンショットボタンをコントロールバーに追加しました');
}

/**
 * スクリーンショットボタンを削除
 */
function removeScreenshotButton(): void {
  if (screenshotButton) {
    screenshotButton.remove();
    screenshotButton = null;
    console.log('[Better Niconico] スクリーンショットボタンを削除しました');
  }
}

/**
 * スクリーンショットをキャプチャしてダウンロード
 */
async function captureScreenshot(): Promise<void> {
  console.log('[Better Niconico] スクリーンショットをキャプチャします...');

  // メインビデオを取得
  const videoResult = getMainVideo();
  if (videoResult.isErr()) {
    console.error('[Better Niconico] メインビデオが見つかりません:', videoResult.error);
    return;
  }
  const mainVideo = videoResult.value;

  // コメントキャンバスを取得
  const canvasResult = getCommentCanvas();
  if (canvasResult.isErr()) {
    console.error('[Better Niconico] コメントキャンバスが見つかりません:', canvasResult.error);
    return;
  }
  const commentCanvas = canvasResult.value;

  // サポーターキャンバスを取得（オプショナル）
  const supporterResult = getSupporterCanvas();
  if (supporterResult.isErr()) {
    console.error('[Better Niconico] サポーターキャンバスの取得に失敗:', supporterResult.error);
    return;
  }
  const supporterCanvas = supporterResult.value;

  // 合成用キャンバスを作成
  const canvas = document.createElement('canvas');
  canvas.width = mainVideo.videoWidth;
  canvas.height = mainVideo.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('[Better Niconico] Canvas 2D context の取得に失敗');
    return;
  }

  // 黒背景を塗りつぶし（レターボックス用）
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // メインビデオをアスペクト比を保持して描画
  if (mainVideo.videoWidth > 0 && mainVideo.videoHeight > 0) {
    const videoSize = calcSize(
      mainVideo.videoWidth,
      mainVideo.videoHeight,
      canvas.width,
      canvas.height,
    );
    ctx.drawImage(
      mainVideo,
      0,
      0,
      mainVideo.videoWidth,
      mainVideo.videoHeight,
      (canvas.width - videoSize.width) / 2,
      (canvas.height - videoSize.height) / 2,
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
        canvas.width,
        canvas.height,
      );
      ctx.drawImage(
        supporterCanvas,
        0,
        0,
        supporterCanvas.width,
        supporterCanvas.height,
        (canvas.width - supporterSize.width) / 2,
        (canvas.height - supporterSize.height) / 2,
        supporterSize.width,
        supporterSize.height,
      );
    }
  }

  // コメントキャンバスをアスペクト比を保持して描画
  const commentSize = calcSize(
    commentCanvas.width,
    commentCanvas.height,
    canvas.width,
    canvas.height,
  );
  ctx.drawImage(
    commentCanvas,
    0,
    0,
    commentCanvas.width,
    commentCanvas.height,
    (canvas.width - commentSize.width) / 2,
    (canvas.height - commentSize.height) / 2,
    commentSize.width,
    commentSize.height,
  );

  // Blobとして画像を生成
  canvas.toBlob((blob) => {
    if (!blob) {
      console.error('[Better Niconico] 画像の生成に失敗');
      return;
    }

    // ダウンロード用のURLを作成
    const url = URL.createObjectURL(blob);

    // 一時的なリンクを作成してクリック
    const a = document.createElement('a');
    a.href = url;
    a.download = generateFilename(mainVideo);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // クリーンアップ
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    console.log(`[Better Niconico] スクリーンショットを保存しました: ${a.download}`);
  }, 'image/png');
}

/**
 * 機能を有効化
 */
function enableFeature(): void {
  if (!isWatchPage()) {
    return;
  }

  // スクリーンショットボタンを追加
  addScreenshotButton();
}

/**
 * 機能を無効化
 */
function disableFeature(): void {
  // スクリーンショットボタンを削除
  removeScreenshotButton();
}

/**
 * 設定を適用する（冪等性を保証）
 * @param enabled - true: スクリーンショット機能有効, false: スクリーンショット機能無効
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    enableFeature();
  } else {
    disableFeature();
  }
}
