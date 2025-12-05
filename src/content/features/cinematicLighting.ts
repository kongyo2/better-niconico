/**
 * シネマティックライティング（アンビエントモード）機能
 * 動画の色をプレイヤー周囲にグロー表示して没入感を高める
 * watch ページでのみ動作します
 *
 * IMPLEMENTATION NOTES:
 * - Main video element: blob: URL, outside #nv_watch_VideoAdContainer
 * - Extracts edge colors from video frames using a small sampling canvas
 * - Creates ambient glow effect behind the player area
 * - Uses requestVideoFrameCallback for frame-synced updates (Chrome 83+)
 * - Falls back to requestAnimationFrame if not supported
 * - Automatically disables in fullscreen mode
 * - Harmonizes with Niconico's existing dark mode
 */

// マーカー属性
const AMBIENT_CONTAINER_MARKER = 'data-bn-ambient-container';
const AMBIENT_GLOW_MARKER = 'data-bn-ambient-glow';

// 要素ID
const AMBIENT_CONTAINER_ID = 'bn-ambient-container';
const AMBIENT_GLOW_ID = 'bn-ambient-glow';

// サンプリングキャンバスの解像度（パフォーマンス重視で小さめ）
const SAMPLE_SIZE = 8;

// グロー効果の設定
const GLOW_BLUR = 80; // ぼかしの強さ (px)
const GLOW_SPREAD = 40; // 広がりの範囲 (px)
const GLOW_OPACITY = 0.5; // 不透明度（ニコニコのダークモードと調和）

// グローバル状態
let isEnabled: boolean = false;
let videoFrameCallbackId: number | null = null;
let animationFrameId: number | null = null;
let currentVideo: HTMLVideoElement | null = null;
let samplingCanvas: HTMLCanvasElement | null = null;
let samplingContext: CanvasRenderingContext2D | null = null;
let ambientContainer: HTMLDivElement | null = null;
let ambientGlow: HTMLDivElement | null = null;
let fullscreenListenerSetup: boolean = false;

// 前回の色（色変化が小さい場合の更新スキップ用）
let lastColors: EdgeColors | null = null;

// 色の変化閾値（この値より小さい変化は無視）
const COLOR_CHANGE_THRESHOLD = 10;

// エッジの色を表す型
interface EdgeColors {
  top: string;
  bottom: string;
  left: string;
  right: string;
  average: string;
}

// RGB型
interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * requestVideoFrameCallback サポートチェック
 */
function supportsRequestVideoFrameCallback(): boolean {
  return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
}

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
  if (document.fullscreenElement) {
    return true;
  }
  // フォールバック: DOMベースの検出
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
 */
function getVideoElement(): HTMLVideoElement | null {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return null;
  }

  const videos = Array.from(playerArea.querySelectorAll('video')) as HTMLVideoElement[];

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

  return bestVideo;
}

/**
 * サンプリング用のキャンバスを作成
 */
function createSamplingCanvas(): void {
  if (samplingCanvas && samplingContext) {
    return;
  }

  samplingCanvas = document.createElement('canvas');
  samplingCanvas.width = SAMPLE_SIZE;
  samplingCanvas.height = SAMPLE_SIZE;
  samplingContext = samplingCanvas.getContext('2d', { willReadFrequently: true });
}

/**
 * 動画フレームからエッジの色を抽出
 */
function extractEdgeColors(video: HTMLVideoElement): EdgeColors | null {
  if (!samplingCanvas || !samplingContext) {
    return null;
  }

  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  try {
    // 動画を小さなキャンバスに描画
    samplingContext.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    // ピクセルデータを取得
    const imageData = samplingContext.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const data = imageData.data;

    // 各エッジの色を計算
    const topColors: RGB[] = [];
    const bottomColors: RGB[] = [];
    const leftColors: RGB[] = [];
    const rightColors: RGB[] = [];

    for (let x = 0; x < SAMPLE_SIZE; x++) {
      // 上辺
      const topIdx = x * 4;
      topColors.push({ r: data[topIdx], g: data[topIdx + 1], b: data[topIdx + 2] });

      // 下辺
      const bottomIdx = ((SAMPLE_SIZE - 1) * SAMPLE_SIZE + x) * 4;
      bottomColors.push({
        r: data[bottomIdx],
        g: data[bottomIdx + 1],
        b: data[bottomIdx + 2],
      });
    }

    for (let y = 0; y < SAMPLE_SIZE; y++) {
      // 左辺
      const leftIdx = y * SAMPLE_SIZE * 4;
      leftColors.push({ r: data[leftIdx], g: data[leftIdx + 1], b: data[leftIdx + 2] });

      // 右辺
      const rightIdx = (y * SAMPLE_SIZE + (SAMPLE_SIZE - 1)) * 4;
      rightColors.push({
        r: data[rightIdx],
        g: data[rightIdx + 1],
        b: data[rightIdx + 2],
      });
    }

    // 各辺の平均色を計算
    const top = averageColor(topColors);
    const bottom = averageColor(bottomColors);
    const left = averageColor(leftColors);
    const right = averageColor(rightColors);

    // 全体の平均色
    const allColors = [...topColors, ...bottomColors, ...leftColors, ...rightColors];
    const average = averageColor(allColors);

    return {
      top: rgbToString(top),
      bottom: rgbToString(bottom),
      left: rgbToString(left),
      right: rgbToString(right),
      average: rgbToString(average),
    };
  } catch {
    // CORS等でエラーが発生した場合
    return null;
  }
}

/**
 * RGB配列の平均色を計算
 */
function averageColor(colors: RGB[]): RGB {
  if (colors.length === 0) {
    return { r: 0, g: 0, b: 0 };
  }

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  for (const color of colors) {
    totalR += color.r;
    totalG += color.g;
    totalB += color.b;
  }

  return {
    r: Math.round(totalR / colors.length),
    g: Math.round(totalG / colors.length),
    b: Math.round(totalB / colors.length),
  };
}

/**
 * RGBを文字列に変換
 */
function rgbToString(rgb: RGB): string {
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

/**
 * 色の変化が閾値を超えているかチェック
 */
function hasSignificantColorChange(newColors: EdgeColors): boolean {
  if (!lastColors) {
    return true;
  }

  // 平均色の変化をチェック
  const newAvg = parseRgbString(newColors.average);
  const oldAvg = parseRgbString(lastColors.average);

  const diff = Math.abs(newAvg.r - oldAvg.r) + Math.abs(newAvg.g - oldAvg.g) + Math.abs(newAvg.b - oldAvg.b);

  return diff > COLOR_CHANGE_THRESHOLD;
}

/**
 * RGB文字列をパース
 */
function parseRgbString(rgbStr: string): RGB {
  const parts = rgbStr.split(',').map((s) => parseInt(s.trim(), 10));
  return {
    r: parts[0] || 0,
    g: parts[1] || 0,
    b: parts[2] || 0,
  };
}

/**
 * アンビエントグロー要素を作成
 */
function createAmbientElements(): void {
  const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
  if (!playerArea) {
    return;
  }

  // 既存の要素があれば再利用
  ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID) as HTMLDivElement;
  if (!ambientContainer) {
    ambientContainer = document.createElement('div');
    ambientContainer.id = AMBIENT_CONTAINER_ID;
    ambientContainer.setAttribute(AMBIENT_CONTAINER_MARKER, 'true');
    ambientContainer.className = 'bn-ambient-container';

    // プレイヤーエリアの背面に挿入
    playerArea.style.position = 'relative';
    playerArea.insertBefore(ambientContainer, playerArea.firstChild);
  }

  ambientGlow = document.getElementById(AMBIENT_GLOW_ID) as HTMLDivElement;
  if (!ambientGlow) {
    ambientGlow = document.createElement('div');
    ambientGlow.id = AMBIENT_GLOW_ID;
    ambientGlow.setAttribute(AMBIENT_GLOW_MARKER, 'true');
    ambientGlow.className = 'bn-ambient-glow';
    ambientContainer.appendChild(ambientGlow);
  }
}

/**
 * グロー効果を更新
 */
function updateGlow(colors: EdgeColors): void {
  if (!ambientGlow) {
    return;
  }

  // box-shadowで4方向のグローを表現
  // 各方向に異なる色を適用し、より自然なアンビエント効果を作る
  const shadows = [
    // 上方向のグロー
    `0 -${GLOW_SPREAD}px ${GLOW_BLUR}px rgba(${colors.top}, ${GLOW_OPACITY})`,
    // 下方向のグロー
    `0 ${GLOW_SPREAD}px ${GLOW_BLUR}px rgba(${colors.bottom}, ${GLOW_OPACITY})`,
    // 左方向のグロー
    `-${GLOW_SPREAD}px 0 ${GLOW_BLUR}px rgba(${colors.left}, ${GLOW_OPACITY})`,
    // 右方向のグロー
    `${GLOW_SPREAD}px 0 ${GLOW_BLUR}px rgba(${colors.right}, ${GLOW_OPACITY})`,
  ];

  ambientGlow.style.boxShadow = shadows.join(', ');

  // 中心部分に平均色のグラデーションを適用（より豊かな効果）
  ambientGlow.style.background = `radial-gradient(ellipse at center, rgba(${colors.average}, 0.15) 0%, transparent 70%)`;
}

/**
 * フレームを処理
 */
function processFrame(): void {
  if (!isEnabled || !currentVideo) {
    return;
  }

  // 全画面モード時はスキップ
  if (isFullscreenMode()) {
    hideGlow();
    return;
  }

  // 動画が有効かチェック
  if (!isValidContentVideo(currentVideo)) {
    return;
  }

  // 色を抽出
  const colors = extractEdgeColors(currentVideo);
  if (!colors) {
    return;
  }

  // 色の変化が小さければ更新をスキップ
  if (!hasSignificantColorChange(colors)) {
    return;
  }

  // グローを更新
  updateGlow(colors);
  lastColors = colors;
}

/**
 * requestVideoFrameCallback を使用した更新ループ
 */
function updateLoopWithVideoFrameCallback(): void {
  if (!isEnabled || !currentVideo) {
    return;
  }

  processFrame();

  // 次のフレームを予約
  videoFrameCallbackId = currentVideo.requestVideoFrameCallback(() => {
    updateLoopWithVideoFrameCallback();
  });
}

/**
 * requestAnimationFrame を使用した更新ループ（フォールバック）
 */
function updateLoopWithAnimationFrame(): void {
  if (!isEnabled || !currentVideo) {
    return;
  }

  processFrame();

  // 次のフレームを予約
  animationFrameId = requestAnimationFrame(updateLoopWithAnimationFrame);
}

/**
 * 更新ループを開始
 */
function startUpdateLoop(): void {
  if (supportsRequestVideoFrameCallback() && currentVideo) {
    console.log('[Better Niconico] シネマティックライティング: requestVideoFrameCallback を使用');
    updateLoopWithVideoFrameCallback();
  } else {
    console.log('[Better Niconico] シネマティックライティング: requestAnimationFrame を使用（フォールバック）');
    updateLoopWithAnimationFrame();
  }
}

/**
 * 更新ループを停止
 */
function stopUpdateLoop(): void {
  if (videoFrameCallbackId !== null && currentVideo) {
    currentVideo.cancelVideoFrameCallback(videoFrameCallbackId);
    videoFrameCallbackId = null;
  }

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/**
 * グローを非表示
 */
function hideGlow(): void {
  if (ambientGlow) {
    ambientGlow.style.boxShadow = 'none';
    ambientGlow.style.background = 'transparent';
  }
}

/**
 * アンビエント要素を削除
 */
function removeAmbientElements(): void {
  if (ambientContainer) {
    ambientContainer.remove();
    ambientContainer = null;
    ambientGlow = null;
  }
}

/**
 * 全画面表示イベントのリスナーをセットアップ
 */
function setupFullscreenListener(): void {
  if (!isWatchPage() || fullscreenListenerSetup) {
    return;
  }

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      // 全画面表示に入った - グローを非表示
      console.log('[Better Niconico] 全画面表示に入りました。シネマティックライティングを一時停止します。');
      hideGlow();
    } else {
      // 全画面表示から抜けた - グローを再開
      console.log('[Better Niconico] 全画面表示から抜けました。シネマティックライティングを再開します。');
      if (isEnabled && currentVideo) {
        // 即座に1フレーム処理して表示を復元
        setTimeout(() => {
          processFrame();
        }, 100);
      }
    }
  });

  fullscreenListenerSetup = true;
  console.log('[Better Niconico] 全画面表示イベントリスナーをセットアップしました（シネマティックライティング用）');
}

/**
 * 機能を有効化
 */
function enableFeature(): void {
  if (!isWatchPage()) {
    return;
  }

  if (isEnabled) {
    return;
  }

  // 動画要素を取得
  const video = getVideoElement();
  if (!video) {
    // 動画が見つからない場合は後で再試行される
    return;
  }

  // 全画面モードの場合は有効化しない
  if (isFullscreenMode()) {
    console.log('[Better Niconico] 全画面表示中のため、シネマティックライティングを待機します');
    isEnabled = true; // フラグは立てておく（全画面解除時に有効化するため）
    currentVideo = video;
    setupFullscreenListener();
    return;
  }

  console.log('[Better Niconico] シネマティックライティングを有効化します');

  currentVideo = video;
  isEnabled = true;

  // サンプリングキャンバスを作成
  createSamplingCanvas();

  // アンビエント要素を作成
  createAmbientElements();

  // 全画面イベントリスナーをセットアップ
  setupFullscreenListener();

  // 更新ループを開始
  startUpdateLoop();

  console.log('[Better Niconico] シネマティックライティングが有効になりました');
}

/**
 * 機能を無効化
 */
function disableFeature(): void {
  if (!isEnabled) {
    return;
  }

  console.log('[Better Niconico] シネマティックライティングを無効化します');

  // 更新ループを停止
  stopUpdateLoop();

  // アンビエント要素を削除
  removeAmbientElements();

  // 状態をリセット
  currentVideo = null;
  samplingCanvas = null;
  samplingContext = null;
  lastColors = null;
  isEnabled = false;

  console.log('[Better Niconico] シネマティックライティングが無効になりました');
}

/**
 * 設定を適用する（冪等性を保証）
 * @param enabled - true: シネマティックライティング有効, false: 無効
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    enableFeature();
  } else {
    disableFeature();
  }
}
