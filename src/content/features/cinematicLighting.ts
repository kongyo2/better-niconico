/**
 * シネマティックライティング（アンビエントモード）機能
 * 動画の色をプレイヤー周囲にグロー表示して没入感を高める
 * watch ページでのみ動作します
 *
 * IMPLEMENTATION NOTES (実機調査 2026/06 に基づく):
 * - メイン動画: blob: URL、`[data-name="video-content"]` で一意に特定可能
 *   （プレイヤーエリア内に1個のみ。広告動画は #nv_watch_VideoAdContainer 内）
 * - blob: 動画は same-origin のため canvas へ描画して getImageData 可能（CORS汚染なし）を実機確認
 * - プレイヤーエリア(.grid-area_[player])・メイングリッド(SECTION) はともに position:static、
 *   直接の絶対配置子要素は無く overflow:visible のため、position:relative の付与は
 *   ニコニコ側レイアウトに影響しない（実機確認済み）
 * - ニコニコは prefers-color-scheme に追従（ライト: body bg≈rgb(242,242,242) / ダーク: rgb(13,13,13)）
 *
 * 改善点 (2026/06 堅牢化):
 * - テーマ適応レンダリング: 背景輝度を測定し、ダーク=screen / ライト=normal blend を自動切替。
 *   mix-blend-mode:screen はライト背景でグローがほぼ不可視になる問題を解消（デフォルトテーマで機能するように）。
 *   prefers-color-scheme 変更リスナー + 定期再測定でライブ追従。
 * - 動画検出の堅牢化: [data-name="video-content"] を最優先し、無ければ readyState でフォールバック。
 * - 色抽出のスロットリング: 毎フレーム(最大60fps)ではなく約12fpsに制限し、CPU/GPU負荷を削減。
 * - フルスクリーン時は更新ループ自体を停止し、解除時に再開（無駄なフレーム処理を排除）。
 * - クリーンアップ堅牢化: 付与した inline style(position) と body class を確実に復元。
 *   isEnabled 状態で非watchページへ遷移した場合も即クリーンアップ。
 *
 * 既存仕様の維持:
 * - 多層グロー効果（内側/外側/コーナー）、彩度優先の色抽出
 * - SPAナビゲーション対応、クラシックレイアウトとの互換性
 */

// マーカー属性
const AMBIENT_CONTAINER_MARKER = 'data-bn-ambient-container';
const AMBIENT_OUTER_MARKER = 'data-bn-ambient-outer';

// 要素ID
const AMBIENT_CONTAINER_ID = 'bn-ambient-container';
const AMBIENT_OUTER_ID = 'bn-ambient-outer';
const AMBIENT_INNER_ID = 'bn-ambient-inner';
const AMBIENT_CORNERS_ID = 'bn-ambient-corners';

// ライトテーマ時に body へ付与するクラス（CSS側で blend mode を切り替える）
const AMBIENT_LIGHT_BODY_CLASS = 'bn-ambient-light';

// サンプリングキャンバスの解像度（パフォーマンスと品質のバランス）
const SAMPLE_SIZE = 16;

// グロー効果の形状（ぼかし/広がり, px）
const INNER_GLOW_BLUR = 60; // 内側グローのぼかし
const INNER_GLOW_SPREAD = 30; // 内側グローの広がり
const OUTER_GLOW_BLUR = 120; // 外側グローのぼかし
const OUTER_GLOW_SPREAD = 80; // 外側グローの広がり

// テーマ種別
type AmbientTheme = 'light' | 'dark';

// テーマ別のグロー不透明度（実機でライト/ダーク両方を視認確認した値）
// - dark : mix-blend-mode:screen 前提。明るく加算される
// - light: mix-blend-mode:normal 前提。色をそのまま重ねるため inner をやや抑え outer を強める
interface GlowOpacity {
  inner: number; // 内側グローの box-shadow 不透明度
  outer: number; // 外側グローの box-shadow 不透明度
  innerBg: number; // 内側中心グラデーションの不透明度
  outerBg: number; // 外側背景グラデーションの不透明度
  corner: number; // コーナーグローの不透明度
}
const GLOW_OPACITY: Record<AmbientTheme, GlowOpacity> = {
  dark: { inner: 0.6, outer: 0.35, innerBg: 0.2, outerBg: 0.12, corner: 0.4 },
  light: { inner: 0.5, outer: 0.4, innerBg: 0.18, outerBg: 0.1, corner: 0.4 },
};

// 色抽出のスロットリング間隔（約12fps）。アンビエント光は高フレームレート不要。
const EXTRACT_INTERVAL_MS = 1000 / 12;

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
let fullscreenHandler: (() => void) | null = null;
let navigationListenerSetup: boolean = false;
let navigationIntervalId: ReturnType<typeof setInterval> | null = null;
let popstateHandler: (() => void) | null = null;
let lastPageUrl: string = ''; // ページURL追跡（SPA対応）
let lastExtractTime: number = 0; // 最後に色抽出した時刻（スロットリング用）

// 現在のテーマと、テーマ変更監視用の状態
let currentTheme: AmbientTheme = 'dark';
let colorSchemeMql: MediaQueryList | null = null;
let colorSchemeHandler: (() => void) | null = null;

// position を付与したホスト要素（クリーンアップ時に復元するため参照を保持）
let styledPlayerArea: HTMLElement | null = null;
let styledMainGrid: HTMLElement | null = null;

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
 * 高精度タイムスタンプ（スロットリング用）
 */
function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
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
 * CSS の色文字列を RGBA に変換（rgb()/rgba() のみ対応）
 */
function parseCssColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const match = input.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return null;
  }
  const parts = match[1].split(',').map((s) => Number.parseFloat(s.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) {
    return null;
  }
  return {
    r: parts[0],
    g: parts[1],
    b: parts[2],
    a: parts.length >= 4 && !Number.isNaN(parts[3]) ? parts[3] : 1,
  };
}

/**
 * 背景の実測輝度からダークテーマかどうかを判定する。
 * body → html の順に不透明な背景色を探し、相対輝度で判定する。
 * 測定できない場合は null を返す（呼び出し側で prefers-color-scheme にフォールバック）。
 */
function measureBackdropIsDark(): boolean | null {
  const targets: Array<HTMLElement | null> = [document.body, document.documentElement];
  for (const el of targets) {
    if (!el) {
      continue;
    }
    const rgb = parseCssColor(getComputedStyle(el).backgroundColor);
    // ほぼ透明な背景は判定材料にならないのでスキップ
    if (rgb && rgb.a >= 0.5) {
      const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
      return luminance < 128;
    }
  }
  return null;
}

/**
 * 現在のテーマ（light/dark）を判定する。
 * 1) 背景色の実測（あらゆるテーマ機構に対応する最も堅牢な方法）
 * 2) prefers-color-scheme（ニコニコはこれに追従）
 * 判定不能時は 'light' を既定とする（normal blend はライト/ダーク双方で視認可能なため安全側）。
 */
function detectTheme(): AmbientTheme {
  const measured = measureBackdropIsDark();
  if (measured !== null) {
    return measured ? 'dark' : 'light';
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * テーマを適用する（body クラスの切り替え）。
 * CSS 側で body.bn-ambient-light のときに blend mode を normal に切り替える。
 */
function applyTheme(theme: AmbientTheme): void {
  currentTheme = theme;
  if (document.body) {
    document.body.classList.toggle(AMBIENT_LIGHT_BODY_CLASS, theme === 'light');
  }
}

/**
 * テーマが変化していれば再適用し、既存のグローを即座に再描画する。
 */
function refreshThemeIfChanged(): void {
  const theme = detectTheme();
  if (theme === currentTheme) {
    return;
  }
  applyTheme(theme);
  // 不透明度が変わるため、変化閾値で skip させず即再描画
  if (lastColors) {
    updateGlow(lastColors);
  }
}

/**
 * prefers-color-scheme の変更を監視するリスナーをセットアップ
 */
function setupThemeListener(): void {
  if (colorSchemeMql || typeof window.matchMedia !== 'function') {
    return;
  }
  colorSchemeMql = window.matchMedia('(prefers-color-scheme: dark)');
  colorSchemeHandler = () => {
    refreshThemeIfChanged();
  };
  if (typeof colorSchemeMql.addEventListener === 'function') {
    colorSchemeMql.addEventListener('change', colorSchemeHandler);
  }
}

function teardownThemeListener(): void {
  if (
    colorSchemeMql &&
    colorSchemeHandler &&
    typeof colorSchemeMql.removeEventListener === 'function'
  ) {
    colorSchemeMql.removeEventListener('change', colorSchemeHandler);
  }
  colorSchemeMql = null;
  colorSchemeHandler = null;
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
 * メインコンテンツの動画要素を取得する。
 * 実機調査の結果、メイン動画は [data-name="video-content"] で一意に特定できるため最優先する。
 * 属性が無い/未ロードの場合は、有効なコンテンツ動画のうち readyState が最大のものにフォールバック。
 */
function getVideoElement(): HTMLVideoElement | null {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return null;
  }

  const videos = Array.from(playerArea.querySelectorAll('video')) as HTMLVideoElement[];

  // 最優先: data-name="video-content"（安定・一意）
  const tagged = videos.find(
    (video) => video.getAttribute('data-name') === 'video-content' && isValidContentVideo(video),
  );
  if (tagged) {
    return tagged;
  }

  // フォールバック: 有効なコンテンツ動画のうち readyState 最大
  let bestVideo: HTMLVideoElement | null = null;
  let bestReadyState = -1;
  for (const video of videos) {
    if (isValidContentVideo(video) && video.readyState > bestReadyState) {
      bestVideo = video;
      bestReadyState = video.readyState;
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
  const sorted: Array<{ rgb: RGB; score: number }> = [];
  for (const color of colors) {
    const insertIndex = sorted.findIndex((current) => current.score < color.score);
    if (insertIndex === -1) {
      sorted.push(color);
    } else {
      sorted.splice(insertIndex, 0, color);
    }
  }
  const topCount = Math.max(1, Math.floor(sorted.length * 0.3));
  const topColors = sorted.slice(0, topCount);

  return selectVibrantColor(topColors);
}

/**
 * アンビエント要素（DOM）をすべて削除する。
 * style や body class の復元は restoreHostStyles() が担当する。
 */
function removeAmbientDom(): void {
  // IDベースで既存要素を探して削除
  document.getElementById(AMBIENT_OUTER_ID)?.remove();
  document.getElementById(AMBIENT_CONTAINER_ID)?.remove();

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
 * 付与したホスト側のスタイル(position)と body クラスを復元する。
 * ニコニコ側の DOM を機能無効化後に汚さないために必須。
 */
function restoreHostStyles(): void {
  if (styledMainGrid) {
    styledMainGrid.style.position = '';
    styledMainGrid = null;
  }
  if (styledPlayerArea) {
    styledPlayerArea.style.position = '';
    styledPlayerArea = null;
  }
  if (document.body) {
    document.body.classList.remove(AMBIENT_LIGHT_BODY_CLASS);
  }
}

/**
 * 既存のアンビエント要素とホストスタイルをすべてクリーンアップ
 */
function cleanupExistingElements(): void {
  removeAmbientDom();
  restoreHostStyles();
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

  // クラシック/通常いずれのレイアウトでも playerArea は mainGrid の子のまま、
  // かつグロー要素は絶対配置（グリッドセル非占有）のため配置は共通。レイアウト分岐は不要。

  // 既存要素が正しい親に配置されているか確認
  const existingOuter = document.getElementById(AMBIENT_OUTER_ID) as HTMLDivElement | null;
  const existingContainer = document.getElementById(AMBIENT_CONTAINER_ID) as HTMLDivElement | null;

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
  ambientOuter = document.getElementById(AMBIENT_OUTER_ID) as HTMLDivElement | null;
  if (!ambientOuter) {
    ambientOuter = document.createElement('div');
    ambientOuter.id = AMBIENT_OUTER_ID;
    ambientOuter.setAttribute(AMBIENT_OUTER_MARKER, 'true');
    ambientOuter.className = 'bn-ambient-outer';

    // メイングリッドに position: relative を設定（実機で static、影響なしを確認済み）
    mainGrid.style.position = 'relative';
    styledMainGrid = mainGrid;
    mainGrid.insertBefore(ambientOuter, mainGrid.firstChild);
  } else {
    // 既存でも position を保証
    mainGrid.style.position = 'relative';
    styledMainGrid = mainGrid;
  }
  // 外側グローは絶対配置（クラシック/通常いずれも同じ扱い）
  ambientOuter.style.gridArea = '';
  ambientOuter.style.position = 'absolute';

  // 内側グロー用コンテナ（プレイヤーエリアに配置）
  ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID) as HTMLDivElement | null;
  if (!ambientContainer) {
    ambientContainer = document.createElement('div');
    ambientContainer.id = AMBIENT_CONTAINER_ID;
    ambientContainer.setAttribute(AMBIENT_CONTAINER_MARKER, 'true');
    ambientContainer.className = 'bn-ambient-container';

    // プレイヤーエリアに配置
    playerArea.style.position = 'relative';
    styledPlayerArea = playerArea;
    playerArea.insertBefore(ambientContainer, playerArea.firstChild);
  } else {
    playerArea.style.position = 'relative';
    styledPlayerArea = playerArea;
  }

  // 内側グロー要素
  ambientInner = document.getElementById(AMBIENT_INNER_ID) as HTMLDivElement | null;
  if (!ambientInner && ambientContainer) {
    ambientInner = document.createElement('div');
    ambientInner.id = AMBIENT_INNER_ID;
    ambientInner.className = 'bn-ambient-inner';
    ambientContainer.appendChild(ambientInner);
  }

  // コーナーグロー要素
  ambientCorners = document.getElementById(AMBIENT_CORNERS_ID) as HTMLDivElement | null;
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
 * グロー効果を更新（現在のテーマの不透明度を使用）
 */
function updateGlow(colors: VibrantColors): void {
  const op = GLOW_OPACITY[currentTheme];

  // 内側グロー（プレイヤー周囲）
  if (ambientInner) {
    const innerShadows = [
      `0 -${INNER_GLOW_SPREAD}px ${INNER_GLOW_BLUR}px rgba(${colors.top}, ${op.inner})`,
      `0 ${INNER_GLOW_SPREAD}px ${INNER_GLOW_BLUR}px rgba(${colors.bottom}, ${op.inner})`,
      `-${INNER_GLOW_SPREAD}px 0 ${INNER_GLOW_BLUR}px rgba(${colors.left}, ${op.inner})`,
      `${INNER_GLOW_SPREAD}px 0 ${INNER_GLOW_BLUR}px rgba(${colors.right}, ${op.inner})`,
    ];

    ambientInner.style.boxShadow = innerShadows.join(', ');
    ambientInner.style.background = `radial-gradient(ellipse at center, rgba(${colors.dominant}, ${op.innerBg}) 0%, transparent 70%)`;
  }

  // 外側グロー（広範囲）
  if (ambientOuter) {
    const outerShadows = [
      `0 -${OUTER_GLOW_SPREAD}px ${OUTER_GLOW_BLUR}px rgba(${colors.top}, ${op.outer})`,
      `0 ${OUTER_GLOW_SPREAD}px ${OUTER_GLOW_BLUR}px rgba(${colors.bottom}, ${op.outer})`,
      `-${OUTER_GLOW_SPREAD}px 0 ${OUTER_GLOW_BLUR}px rgba(${colors.left}, ${op.outer})`,
      `${OUTER_GLOW_SPREAD}px 0 ${OUTER_GLOW_BLUR}px rgba(${colors.right}, ${op.outer})`,
    ];

    ambientOuter.style.boxShadow = outerShadows.join(', ');
    ambientOuter.style.background = `radial-gradient(ellipse 80% 60% at 50% 30%, rgba(${colors.dominant}, ${op.outerBg}) 0%, transparent 60%)`;
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

      el.style.background = `radial-gradient(circle at center, rgba(${cornerColor}, ${op.corner}) 0%, transparent 70%)`;
    });
  }
}

/**
 * フレームを処理
 * @param force - true の場合スロットリングと変化閾値を無視して即座に描画する
 */
function processFrame(force = false): void {
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

  // スロットリング（約12fps）。force 時はバイパス。
  const t = now();
  if (!force && t - lastExtractTime < EXTRACT_INTERVAL_MS) {
    return;
  }
  lastExtractTime = t;

  // 色を抽出
  const colors = extractVibrantColors(currentVideo);
  if (!colors) {
    return;
  }

  // 色の変化が小さければ更新をスキップ（force 時は常に更新）
  if (!force && !hasSignificantColorChange(colors)) {
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
 * 更新ループを開始（二重起動を防止）
 */
function startUpdateLoop(): void {
  // 既存ループがあれば停止してから開始（二重ループ防止）
  stopUpdateLoop();

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
  // 次回の描画を確実に行うため色キャッシュをリセット
  lastColors = null;
}

/**
 * 全画面表示イベントのリスナーをセットアップ
 */
function setupFullscreenListener(): void {
  if (!isWatchPage() || fullscreenListenerSetup) {
    return;
  }

  fullscreenHandler = () => {
    if (document.fullscreenElement) {
      // 全画面表示に入った - 更新ループを停止しグローを非表示
      console.log(
        '[Better Niconico] 全画面表示に入りました。シネマティックライティングを一時停止します。',
      );
      stopUpdateLoop();
      hideGlow();
    } else {
      // 全画面表示から抜けた - グローを再開
      console.log(
        '[Better Niconico] 全画面表示から抜けました。シネマティックライティングを再開します。',
      );
      if (isEnabled && currentVideo) {
        // DOM更新を待ってから即座に1フレーム処理し、更新ループを再開
        setTimeout(() => {
          if (!isEnabled || !currentVideo || isFullscreenMode()) {
            return;
          }
          // 要素が失われていれば再作成
          createAmbientElements();
          refreshThemeIfChanged();
          processFrame(true);
          startUpdateLoop();
        }, 100);
      }
    }
  };
  document.addEventListener('fullscreenchange', fullscreenHandler);

  fullscreenListenerSetup = true;
  console.log(
    '[Better Niconico] 全画面表示イベントリスナーをセットアップしました（シネマティックライティング用）',
  );
}

/**
 * 全画面表示イベントのリスナーを解除する。
 * disableFeature() で呼び出し、機能無効化後に document へリスナーが残らないようにする。
 * （forceCleanup() では呼ばない: SPA 再初期化時はリスナーを保持したいため）
 */
function teardownFullscreenListener(): void {
  if (fullscreenHandler) {
    document.removeEventListener('fullscreenchange', fullscreenHandler);
    fullscreenHandler = null;
  }
  fullscreenListenerSetup = false;
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
  popstateHandler = () => {
    console.log('[Better Niconico] ナビゲーション検出（popstate）');
    handlePageNavigation();
  };
  window.addEventListener('popstate', popstateHandler);

  // URLの変更を定期的にチェック（History API使用時の対応）
  // ニコニコはHistory APIでページ遷移する。あわせてテーマ変化も低頻度で再測定する。
  navigationIntervalId = setInterval(() => {
    const currentUrl = window.location.href;
    if (lastPageUrl && lastPageUrl !== currentUrl) {
      console.log('[Better Niconico] URL変更検出:', lastPageUrl, '->', currentUrl);
      handlePageNavigation();
    }
    lastPageUrl = currentUrl;

    // テーマ（システム/サイト設定）が変わっていれば追従
    if (isEnabled && isWatchPage()) {
      refreshThemeIfChanged();
    }
  }, 500);

  navigationListenerSetup = true;
  lastPageUrl = window.location.href;
  console.log('[Better Niconico] ナビゲーションリスナーをセットアップしました');
}

function teardownNavigationListener(): void {
  if (!navigationListenerSetup) {
    return;
  }

  if (popstateHandler) {
    window.removeEventListener('popstate', popstateHandler);
    popstateHandler = null;
  }

  if (navigationIntervalId !== null) {
    clearInterval(navigationIntervalId);
    navigationIntervalId = null;
  }

  navigationListenerSetup = false;
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
 * 再試行タイマーをクリア
 */
function clearRetryTimer(): void {
  if (retryTimeoutId !== null) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
}

/**
 * 強制クリーンアップ
 * ページ遷移時など、確実に全てをクリーンアップする必要がある場合に使用
 * （isEnabled は保持する）
 */
function forceCleanup(): void {
  // 再試行タイマーをクリア
  clearRetryTimer();
  retryCount = 0;

  // 更新ループを停止
  stopUpdateLoop();

  // DOM要素を削除 + ホストスタイル/bodyクラスを復元
  cleanupExistingElements();

  // 状態をリセット（isEnabledは保持）
  currentVideo = null;
  currentVideoSrc = '';
  samplingCanvas = null;
  samplingContext = null;
  lastColors = null;
  lastExtractTime = 0;
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
  clearRetryTimer();

  const fullscreen = isFullscreenMode();
  if (fullscreen) {
    console.log('[Better Niconico] 全画面表示中のため、シネマティックライティングを待機します');
  } else {
    console.log('[Better Niconico] シネマティックライティングを有効化します');
  }

  currentVideo = video;
  currentVideoSrc = video.src;
  lastExtractTime = 0;

  // サンプリングキャンバスを作成
  createSamplingCanvas();

  // アンビエント要素を作成（全画面でも作成しておき、解除時に即描画できるようにする）
  createAmbientElements();

  // テーマを適用
  applyTheme(detectTheme());

  // 各種リスナーをセットアップ
  setupFullscreenListener();
  setupNavigationListener();
  setupThemeListener();

  // 全画面中はループを開始せず待機（解除時に再開される）
  if (fullscreen) {
    hideGlow();
    return;
  }

  // 更新ループを開始
  startUpdateLoop();

  console.log('[Better Niconico] シネマティックライティングが有効になりました');
}

/**
 * 機能を有効化
 */
function enableFeature(): void {
  if (!isWatchPage()) {
    // 視聴ページ外: 有効状態のまま遷移してきた場合は確実にクリーンアップ
    if (isEnabled) {
      forceCleanup();
    }
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
    // 無効化されていても残っている要素・スタイルがあればクリーンアップ
    cleanupExistingElements();
    return;
  }

  console.log('[Better Niconico] シネマティックライティングを無効化します');

  // 強制クリーンアップを実行
  forceCleanup();

  // リスナーを停止（setInterval / matchMedia / fullscreenchange のリークを防ぐ）
  teardownNavigationListener();
  teardownThemeListener();
  teardownFullscreenListener();

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
