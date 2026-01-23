/**
 * シネマティックライティング（アンビエントモード）機能
 * 動画の色をプレイヤー周囲にグロー表示して没入感を高める
 * watch ページでのみ動作します
 *
 * IMPLEMENTATION NOTES:
 * - Main video element: blob: URL, outside #nv_watch_VideoAdContainer
 * - Extracts vibrant colors from video frames using saturation-weighted sampling
 * - Creates multi-layer ambient glow effect around and behind the player
 * - Uses requestVideoFrameCallback for frame-synced updates (Chrome 83+)
 * - Falls back to requestAnimationFrame if not supported
 * - Automatically disables in fullscreen mode
 * - Harmonizes with Niconico's existing dark mode
 * - Compatible with Classic Layout feature
 *
 * 改善点 (2025/12):
 * - 多層グロー効果: 内側/外側の複数レイヤーで深みのある効果
 * - 彩度優先の色抽出: 暗い色より彩度の高い色を優先
 * - 広範囲グロー: プレイヤーエリアの外側にも光が広がる
 * - スムーズなトランジション: CSS変数とGPUアクセラレーション活用
 * - コーナーグロー: 四隅に追加のグロー効果
 * - SPAナビゲーション対応: 戻るボタンやページ遷移時の適切なクリーンアップ
 * - クラシックレイアウトとの互換性: グリッド構造変更時の適切な配置
 */

// マーカー属性
const AMBIENT_CONTAINER_MARKER = 'data-bn-ambient-container';
const AMBIENT_OUTER_MARKER = 'data-bn-ambient-outer';

// 要素ID
const AMBIENT_CONTAINER_ID = 'bn-ambient-container';
const AMBIENT_OUTER_ID = 'bn-ambient-outer';
const AMBIENT_INNER_ID = 'bn-ambient-inner';
const AMBIENT_CORNERS_ID = 'bn-ambient-corners';

// サンプリングキャンバスの解像度（パフォーマンスと品質のバランス）
const SAMPLE_SIZE = 16;

// グロー効果の設定
const INNER_GLOW_BLUR = 60; // 内側グローのぼかし (px)
const INNER_GLOW_SPREAD = 30; // 内側グローの広がり (px)
const OUTER_GLOW_BLUR = 120; // 外側グローのぼかし (px)
const OUTER_GLOW_SPREAD = 80; // 外側グローの広がり (px)
const GLOW_OPACITY_INNER = 0.6; // 内側グローの不透明度
const GLOW_OPACITY_OUTER = 0.35; // 外側グローの不透明度
// コーナーグローのサイズはCSSで定義 (200px)

// グローバル状態
let isEnabled: boolean = false;
let videoFrameCallbackId: number | null = null;
let animationFrameId: number | null = null;
let currentVideo: HTMLVideoElement | null = null;
let currentVideoSrc: string = ''; // 動画ソースを追跡（動画変更検出用）
let samplingCanvas: HTMLCanvasElement | null = null;
let samplingContext: CanvasRenderingContext2D | null = null;
let ambientContainer: HTMLDivElement | null = null;
let ambientOuter: HTMLDivElement | null = null;
let ambientInner: HTMLDivElement | null = null;
let ambientCorners: HTMLDivElement | null = null;
let fullscreenListenerSetup: boolean = false;
let navigationListenerSetup: boolean = false;
let lastPageUrl: string = ''; // ページURL追跡（SPA対応）

// 前回の色（色変化が小さい場合の更新スキップ用）
let lastColors: VibrantColors | null = null;

// 色の変化閾値（この値より小さい変化は無視）
const COLOR_CHANGE_THRESHOLD = 15;

// 彩度重み付けの設定
const SATURATION_WEIGHT = 2.0; // 彩度の重要度
const BRIGHTNESS_MIN = 30; // 最低輝度（これ以下は無視）
const BRIGHTNESS_MAX = 230; // 最大輝度（これ以上は無視）

// 再試行タイマー
let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
const RETRY_DELAY = 500; // 再試行間隔 (ms)
const MAX_RETRIES = 10; // 最大再試行回数
let retryCount = 0;

// エッジの色を表す型
interface VibrantColors {
  top: string;
  bottom: string;
  left: string;
  right: string;
  dominant: string; // 支配的な色（彩度優先）
  corners: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  };
}

// RGB型
interface RGB {
  r: number;
  g: number;
  b: number;
}

// HSL型
interface HSL {
  h: number;
  s: number;
  l: number;
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
 * RGBからHSLに変換
 */
function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * 彩度に基づいて色のスコアを計算
 */
function calculateColorScore(rgb: RGB): number {
  const hsl = rgbToHsl(rgb);

  // 輝度が極端な場合はスコアを下げる
  if (hsl.l < BRIGHTNESS_MIN / 2.55 || hsl.l > BRIGHTNESS_MAX / 2.55) {
    return 0;
  }

  // 彩度を重み付け
  return hsl.s * SATURATION_WEIGHT + hsl.l * 0.5;
}

/**
 * 動画フレームから彩度優先で色を抽出
 */
function extractVibrantColors(video: HTMLVideoElement): VibrantColors | null {
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

    // 各エッジと領域の色を収集
    const topColors: Array<{ rgb: RGB; score: number }> = [];
    const bottomColors: Array<{ rgb: RGB; score: number }> = [];
    const leftColors: Array<{ rgb: RGB; score: number }> = [];
    const rightColors: Array<{ rgb: RGB; score: number }> = [];
    const allColors: Array<{ rgb: RGB; score: number }> = [];

    // コーナー領域のサイズ
    const cornerSize = Math.floor(SAMPLE_SIZE / 4);

    const cornerTopLeft: Array<{ rgb: RGB; score: number }> = [];
    const cornerTopRight: Array<{ rgb: RGB; score: number }> = [];
    const cornerBottomLeft: Array<{ rgb: RGB; score: number }> = [];
    const cornerBottomRight: Array<{ rgb: RGB; score: number }> = [];

    for (let y = 0; y < SAMPLE_SIZE; y++) {
      for (let x = 0; x < SAMPLE_SIZE; x++) {
        const idx = (y * SAMPLE_SIZE + x) * 4;
        const rgb: RGB = { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
        const score = calculateColorScore(rgb);

        if (score > 0) {
          allColors.push({ rgb, score });

          // エッジの色を収集（2ピクセル幅）
          if (y < 2) topColors.push({ rgb, score });
          if (y >= SAMPLE_SIZE - 2) bottomColors.push({ rgb, score });
          if (x < 2) leftColors.push({ rgb, score });
          if (x >= SAMPLE_SIZE - 2) rightColors.push({ rgb, score });

          // コーナーの色を収集
          if (x < cornerSize && y < cornerSize) cornerTopLeft.push({ rgb, score });
          if (x >= SAMPLE_SIZE - cornerSize && y < cornerSize) cornerTopRight.push({ rgb, score });
          if (x < cornerSize && y >= SAMPLE_SIZE - cornerSize)
            cornerBottomLeft.push({ rgb, score });
          if (x >= SAMPLE_SIZE - cornerSize && y >= SAMPLE_SIZE - cornerSize)
            cornerBottomRight.push({ rgb, score });
        }
      }
    }

    // 各エッジの色を計算
    const top = selectVibrantColor(topColors);
    const bottom = selectVibrantColor(bottomColors);
    const left = selectVibrantColor(leftColors);
    const right = selectVibrantColor(rightColors);
    const dominant = findDominantColor(allColors);

    return {
      top: rgbToString(top),
      bottom: rgbToString(bottom),
      left: rgbToString(left),
      right: rgbToString(right),
      dominant: rgbToString(dominant),
      corners: {
        topLeft: rgbToString(selectVibrantColor(cornerTopLeft)),
        topRight: rgbToString(selectVibrantColor(cornerTopRight)),
        bottomLeft: rgbToString(selectVibrantColor(cornerBottomLeft)),
        bottomRight: rgbToString(selectVibrantColor(cornerBottomRight)),
      },
    };
  } catch {
    // CORS等でエラーが発生した場合
    return null;
  }
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
function hasSignificantColorChange(newColors: VibrantColors): boolean {
  if (!lastColors) {
    return true;
  }

  // 支配的な色の変化をチェック
  const newDom = parseRgbString(newColors.dominant);
  const oldDom = parseRgbString(lastColors.dominant);

  const diff =
    Math.abs(newDom.r - oldDom.r) + Math.abs(newDom.g - oldDom.g) + Math.abs(newDom.b - oldDom.b);

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
 * 彩度優先で色を選択（スコアで重み付け平均）
 */
function selectVibrantColor(colors: Array<{ rgb: RGB; score: number }>): RGB {
  if (colors.length === 0) {
    return { r: 0, g: 0, b: 0 };
  }

  // スコアで重み付け平均を計算
  let totalWeight = 0;
  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;

  for (const { rgb, score } of colors) {
    const weight = score * score; // スコアを二乗して高スコアを強調
    totalWeight += weight;
    weightedR += rgb.r * weight;
    weightedG += rgb.g * weight;
    weightedB += rgb.b * weight;
  }

  if (totalWeight === 0) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: Math.round(weightedR / totalWeight),
    g: Math.round(weightedG / totalWeight),
    b: Math.round(weightedB / totalWeight),
  };
}

/**
 * 支配的な色を見つける（最も彩度の高い色）
 */
function findDominantColor(colors: Array<{ rgb: RGB; score: number }>): RGB {
  if (colors.length === 0) {
    return { r: 0, g: 0, b: 0 };
  }

  // 上位30%のスコアの色のみ使用
  const sorted = [...colors].toSorted((a, b) => b.score - a.score);
  const topCount = Math.max(1, Math.floor(sorted.length * 0.3));
  const topColors = sorted.slice(0, topCount);

  return selectVibrantColor(topColors);
}

/**
 * クラシックレイアウトが有効かどうかを判定
 */
function isClassicLayoutEnabled(): boolean {
  const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
  if (!playerArea) {
    return false;
  }
  return playerArea.getAttribute('data-bn-layout') === 'classic';
}

/**
 * 既存のアンビエント要素をすべて削除
 * DOM上に残っている要素を確実にクリーンアップ
 */
function cleanupExistingElements(): void {
  // IDベースで既存要素を探して削除
  const existingOuter = document.getElementById(AMBIENT_OUTER_ID);
  if (existingOuter) {
    existingOuter.remove();
  }

  const existingContainer = document.getElementById(AMBIENT_CONTAINER_ID);
  if (existingContainer) {
    existingContainer.remove();
  }

  // マーカー属性ベースでも検索（念のため）
  document.querySelectorAll(`[${AMBIENT_OUTER_MARKER}]`).forEach((el) => el.remove());
  document.querySelectorAll(`[${AMBIENT_CONTAINER_MARKER}]`).forEach((el) => el.remove());

  // 参照をリセット
  ambientOuter = null;
  ambientContainer = null;
  ambientInner = null;
  ambientCorners = null;
}

/**
 * アンビエントグロー要素を作成
 * クラシックレイアウトとの互換性を考慮
 */
function createAmbientElements(): void {
  const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
  if (!playerArea) {
    return;
  }

  // プレイヤーエリアの親（メイングリッド）を取得
  const mainGrid = playerArea.parentElement as HTMLElement;
  if (!mainGrid) {
    return;
  }

  // クラシックレイアウトの状態を確認
  const classicLayout = isClassicLayoutEnabled();

  // 既存要素が適切な場所にあるかチェック
  const existingOuter = document.getElementById(AMBIENT_OUTER_ID) as HTMLDivElement;
  const existingContainer = document.getElementById(AMBIENT_CONTAINER_ID) as HTMLDivElement;

  // 既存要素が正しい親に配置されているか確認
  if (existingOuter && existingOuter.parentElement !== mainGrid) {
    existingOuter.remove();
    ambientOuter = null;
  }
  if (existingContainer && existingContainer.parentElement !== playerArea) {
    existingContainer.remove();
    ambientContainer = null;
    ambientInner = null;
    ambientCorners = null;
  }

  // 外側グロー用コンテナ（メイングリッドに配置）
  ambientOuter = document.getElementById(AMBIENT_OUTER_ID) as HTMLDivElement;
  if (!ambientOuter) {
    ambientOuter = document.createElement('div');
    ambientOuter.id = AMBIENT_OUTER_ID;
    ambientOuter.setAttribute(AMBIENT_OUTER_MARKER, 'true');
    ambientOuter.className = 'bn-ambient-outer';

    // メイングリッドにposition: relativeを設定
    mainGrid.style.position = 'relative';
    mainGrid.insertBefore(ambientOuter, mainGrid.firstChild);
  }

  // クラシックレイアウト時は外側グローのグリッドエリアを調整
  if (classicLayout) {
    // クラシックレイアウトではグリッドが変更されているので、
    // 外側グローをプレイヤーエリアの直下に配置（相対位置で）
    ambientOuter.style.gridArea = '';
    ambientOuter.style.position = 'absolute';
  } else {
    ambientOuter.style.gridArea = '';
    ambientOuter.style.position = 'absolute';
  }

  // 内側グロー用コンテナ（プレイヤーエリアに配置）
  ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID) as HTMLDivElement;
  if (!ambientContainer) {
    ambientContainer = document.createElement('div');
    ambientContainer.id = AMBIENT_CONTAINER_ID;
    ambientContainer.setAttribute(AMBIENT_CONTAINER_MARKER, 'true');
    ambientContainer.className = 'bn-ambient-container';

    // プレイヤーエリアに配置
    playerArea.style.position = 'relative';
    playerArea.insertBefore(ambientContainer, playerArea.firstChild);
  }

  // 内側グロー要素
  ambientInner = document.getElementById(AMBIENT_INNER_ID) as HTMLDivElement;
  if (!ambientInner && ambientContainer) {
    ambientInner = document.createElement('div');
    ambientInner.id = AMBIENT_INNER_ID;
    ambientInner.className = 'bn-ambient-inner';
    ambientContainer.appendChild(ambientInner);
  }

  // コーナーグロー要素
  ambientCorners = document.getElementById(AMBIENT_CORNERS_ID) as HTMLDivElement;
  if (!ambientCorners && ambientContainer) {
    ambientCorners = document.createElement('div');
    ambientCorners.id = AMBIENT_CORNERS_ID;
    ambientCorners.className = 'bn-ambient-corners';

    // 4つのコーナーグローを作成
    const cornerPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const pos of cornerPositions) {
      const corner = document.createElement('div');
      corner.className = `bn-ambient-corner bn-ambient-corner-${pos}`;
      corner.setAttribute('data-corner', pos);
      ambientCorners.appendChild(corner);
    }
    ambientContainer.appendChild(ambientCorners);
  }
}

/**
 * グロー効果を更新
 */
function updateGlow(colors: VibrantColors): void {
  // 内側グロー（プレイヤー周囲）
  if (ambientInner) {
    const innerShadows = [
      // 上方向
      `0 -${INNER_GLOW_SPREAD}px ${INNER_GLOW_BLUR}px rgba(${colors.top}, ${GLOW_OPACITY_INNER})`,
      // 下方向
      `0 ${INNER_GLOW_SPREAD}px ${INNER_GLOW_BLUR}px rgba(${colors.bottom}, ${GLOW_OPACITY_INNER})`,
      // 左方向
      `-${INNER_GLOW_SPREAD}px 0 ${INNER_GLOW_BLUR}px rgba(${colors.left}, ${GLOW_OPACITY_INNER})`,
      // 右方向
      `${INNER_GLOW_SPREAD}px 0 ${INNER_GLOW_BLUR}px rgba(${colors.right}, ${GLOW_OPACITY_INNER})`,
    ];

    ambientInner.style.boxShadow = innerShadows.join(', ');

    // 中心部分に支配的な色のグラデーション
    ambientInner.style.background = `radial-gradient(ellipse at center, rgba(${colors.dominant}, 0.2) 0%, transparent 70%)`;
  }

  // 外側グロー（広範囲）
  if (ambientOuter) {
    const outerShadows = [
      // 上方向（より広い）
      `0 -${OUTER_GLOW_SPREAD}px ${OUTER_GLOW_BLUR}px rgba(${colors.top}, ${GLOW_OPACITY_OUTER})`,
      // 下方向（より広い）
      `0 ${OUTER_GLOW_SPREAD}px ${OUTER_GLOW_BLUR}px rgba(${colors.bottom}, ${GLOW_OPACITY_OUTER})`,
      // 左方向（より広い）
      `-${OUTER_GLOW_SPREAD}px 0 ${OUTER_GLOW_BLUR}px rgba(${colors.left}, ${GLOW_OPACITY_OUTER})`,
      // 右方向（より広い）
      `${OUTER_GLOW_SPREAD}px 0 ${OUTER_GLOW_BLUR}px rgba(${colors.right}, ${GLOW_OPACITY_OUTER})`,
    ];

    ambientOuter.style.boxShadow = outerShadows.join(', ');

    // 背景に淡いグラデーション
    ambientOuter.style.background = `radial-gradient(ellipse 80% 60% at 50% 30%, rgba(${colors.dominant}, 0.12) 0%, transparent 60%)`;
  }

  // コーナーグロー
  if (ambientCorners) {
    const corners = ambientCorners.querySelectorAll('.bn-ambient-corner');
    corners.forEach((corner) => {
      const pos = corner.getAttribute('data-corner');
      const el = corner as HTMLElement;

      let cornerColor = colors.dominant;
      switch (pos) {
        case 'top-left':
          cornerColor = colors.corners.topLeft;
          break;
        case 'top-right':
          cornerColor = colors.corners.topRight;
          break;
        case 'bottom-left':
          cornerColor = colors.corners.bottomLeft;
          break;
        case 'bottom-right':
          cornerColor = colors.corners.bottomRight;
          break;
      }

      el.style.background = `radial-gradient(circle at center, rgba(${cornerColor}, 0.4) 0%, transparent 70%)`;
    });
  }
}

/**
 * フレームを処理
 */
function processFrame(): void {
  if (!isEnabled) {
    return;
  }

  // 全画面モード時はスキップ
  if (isFullscreenMode()) {
    hideGlow();
    return;
  }

  // currentVideoがない、または動画が有効でない場合
  if (!currentVideo || !isValidContentVideo(currentVideo)) {
    // 新しい動画要素を探す
    const newVideo = getVideoElement();
    if (newVideo && newVideo !== currentVideo) {
      console.log('[Better Niconico] 新しい動画要素を検出しました。再初期化します。');
      currentVideo = newVideo;
      currentVideoSrc = newVideo.src;
      // 要素が正しく配置されているか確認
      createAmbientElements();
    } else if (!newVideo) {
      // 動画がない場合はグローを非表示
      hideGlow();
      return;
    }
  }

  // 動画ソースが変更された場合
  if (currentVideo && currentVideo.src !== currentVideoSrc) {
    console.log(
      '[Better Niconico] 動画ソースが変更されました:',
      currentVideoSrc,
      '->',
      currentVideo.src,
    );
    currentVideoSrc = currentVideo.src;
    lastColors = null; // 色をリセット
  }

  if (!currentVideo) {
    return;
  }

  // 色を抽出
  const colors = extractVibrantColors(currentVideo);
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
    console.log(
      '[Better Niconico] シネマティックライティング: requestAnimationFrame を使用（フォールバック）',
    );
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
  if (ambientInner) {
    ambientInner.style.boxShadow = 'none';
    ambientInner.style.background = 'transparent';
  }
  if (ambientOuter) {
    ambientOuter.style.boxShadow = 'none';
    ambientOuter.style.background = 'transparent';
  }
  if (ambientCorners) {
    const corners = ambientCorners.querySelectorAll('.bn-ambient-corner');
    corners.forEach((corner) => {
      (corner as HTMLElement).style.background = 'transparent';
    });
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
      console.log(
        '[Better Niconico] 全画面表示に入りました。シネマティックライティングを一時停止します。',
      );
      hideGlow();
    } else {
      // 全画面表示から抜けた - グローを再開
      console.log(
        '[Better Niconico] 全画面表示から抜けました。シネマティックライティングを再開します。',
      );
      if (isEnabled && currentVideo) {
        // 即座に1フレーム処理して表示を復元
        setTimeout(() => {
          processFrame();
        }, 100);
      }
    }
  });

  fullscreenListenerSetup = true;
  console.log(
    '[Better Niconico] 全画面表示イベントリスナーをセットアップしました（シネマティックライティング用）',
  );
}

/**
 * SPAナビゲーション用のリスナーをセットアップ
 * 戻るボタンやページ遷移時に適切にクリーンアップ
 */
function setupNavigationListener(): void {
  if (navigationListenerSetup) {
    return;
  }

  // popstate イベント（戻る/進むボタン）
  window.addEventListener('popstate', () => {
    console.log('[Better Niconico] ナビゲーション検出（popstate）');
    handlePageNavigation();
  });

  // URLの変更を定期的にチェック（History API使用時の対応）
  // ニコニコはHistory APIでページ遷移する
  setInterval(() => {
    const currentUrl = window.location.href;
    if (lastPageUrl && lastPageUrl !== currentUrl) {
      console.log('[Better Niconico] URL変更検出:', lastPageUrl, '->', currentUrl);
      handlePageNavigation();
    }
    lastPageUrl = currentUrl;
  }, 500);

  navigationListenerSetup = true;
  lastPageUrl = window.location.href;
  console.log('[Better Niconico] ナビゲーションリスナーをセットアップしました');
}

/**
 * ページナビゲーション時の処理
 */
function handlePageNavigation(): void {
  const wasWatchPage = lastPageUrl.includes('/watch/');
  const isNowWatchPage = isWatchPage();

  // watchページから離れた場合はクリーンアップ
  if (wasWatchPage && !isNowWatchPage) {
    console.log(
      '[Better Niconico] watchページから離れました。シネマティックライティングを停止します。',
    );
    forceCleanup();
    return;
  }

  // 異なるwatchページに移動した場合は再初期化
  if (wasWatchPage && isNowWatchPage && lastPageUrl !== window.location.href) {
    console.log(
      '[Better Niconico] 別の動画ページに移動しました。シネマティックライティングを再初期化します。',
    );
    // 一度クリーンアップしてから再初期化を試みる
    forceCleanup();
    if (isEnabled) {
      // 少し待ってから再初期化（DOMの更新を待つ）
      setTimeout(() => {
        retryCount = 0;
        tryEnableFeature();
      }, 300);
    }
    return;
  }

  // watchページに来た場合（設定が有効なら初期化）
  if (!wasWatchPage && isNowWatchPage && isEnabled) {
    console.log(
      '[Better Niconico] watchページに入りました。シネマティックライティングを初期化します。',
    );
    retryCount = 0;
    tryEnableFeature();
  }
}

/**
 * 強制クリーンアップ
 * ページ遷移時など、確実に全てをクリーンアップする必要がある場合に使用
 */
function forceCleanup(): void {
  // 再試行タイマーをクリア
  if (retryTimeoutId !== null) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
  retryCount = 0;

  // 更新ループを停止
  stopUpdateLoop();

  // DOM要素を削除
  cleanupExistingElements();

  // 状態をリセット（isEnabledは保持）
  currentVideo = null;
  currentVideoSrc = '';
  samplingCanvas = null;
  samplingContext = null;
  lastColors = null;
}

/**
 * 動画要素の変更を検出
 */
function hasVideoChanged(): boolean {
  const video = getVideoElement();
  if (!video) {
    return currentVideo !== null; // 動画がなくなった
  }

  // srcが変わった場合
  if (video.src !== currentVideoSrc) {
    return true;
  }

  // 参照が変わった場合
  if (video !== currentVideo) {
    return true;
  }

  return false;
}

/**
 * 再試行付きで機能を有効化
 */
function tryEnableFeature(): void {
  if (!isWatchPage()) {
    return;
  }

  // 動画要素を取得
  const video = getVideoElement();
  if (!video) {
    // 動画が見つからない場合は再試行
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(
        `[Better Niconico] 動画要素が見つかりません。再試行 ${retryCount}/${MAX_RETRIES}...`,
      );
      retryTimeoutId = setTimeout(() => {
        tryEnableFeature();
      }, RETRY_DELAY);
    } else {
      console.warn(
        '[Better Niconico] 動画要素が見つかりませんでした。シネマティックライティングを開始できません。',
      );
      retryCount = 0;
    }
    return;
  }

  // 成功
  retryCount = 0;
  if (retryTimeoutId !== null) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }

  // 全画面モードの場合は有効化しない（フラグは立てる）
  if (isFullscreenMode()) {
    console.log('[Better Niconico] 全画面表示中のため、シネマティックライティングを待機します');
    currentVideo = video;
    currentVideoSrc = video.src;
    setupFullscreenListener();
    setupNavigationListener();
    return;
  }

  console.log('[Better Niconico] シネマティックライティングを有効化します');

  currentVideo = video;
  currentVideoSrc = video.src;

  // サンプリングキャンバスを作成
  createSamplingCanvas();

  // アンビエント要素を作成
  createAmbientElements();

  // 全画面イベントリスナーをセットアップ
  setupFullscreenListener();

  // ナビゲーションリスナーをセットアップ
  setupNavigationListener();

  // 更新ループを開始
  startUpdateLoop();

  console.log('[Better Niconico] シネマティックライティングが有効になりました');
}

/**
 * 機能を有効化
 */
function enableFeature(): void {
  if (!isWatchPage()) {
    return;
  }

  // 既に有効な場合
  if (isEnabled) {
    // 動画が変更された場合は再初期化
    if (hasVideoChanged()) {
      console.log(
        '[Better Niconico] 動画要素が変更されました。シネマティックライティングを再初期化します。',
      );
      forceCleanup();
      isEnabled = true;
      retryCount = 0;
      tryEnableFeature();
    }
    return;
  }

  isEnabled = true;
  retryCount = 0;
  tryEnableFeature();
}

/**
 * 機能を無効化
 */
function disableFeature(): void {
  if (!isEnabled) {
    // 無効化されていても残っている要素があればクリーンアップ
    cleanupExistingElements();
    return;
  }

  console.log('[Better Niconico] シネマティックライティングを無効化します');

  // 強制クリーンアップを実行
  forceCleanup();

  // isEnabledをリセット
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
