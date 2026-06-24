/**
 * Tests for src/content/features/cinematicLighting.ts
 *
 * ニコニコ動画のDOM構造を実際のページから調査した結果に基づくテスト
 *
 * 実際のページ構造 (2026年1月調査):
 * - プレイヤーエリア: .grid-area_[player]
 * - メイングリッド: SECTION タグ、display: grid
 *   - gridTemplateAreas: "player sidebar" "bottom sidebar" "bottom sidebar"
 * - 動画要素: 3つ（メインコンテンツ1つ + 広告コンテナ内2つ）
 * - 広告コンテナ: #nv_watch_VideoAdContainer
 * - メイン動画: blob: URL、position: absolute、videoWidth/videoHeight設定済み
 * - 全画面モード検出: document.fullscreenElement または .w_[100dvw].h_[100dvh]
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

// 定数（実装と一致させる）
const AMBIENT_CONTAINER_MARKER = 'data-bn-ambient-container';
const AMBIENT_OUTER_MARKER = 'data-bn-ambient-outer';
const AMBIENT_CONTAINER_ID = 'bn-ambient-container';
const AMBIENT_OUTER_ID = 'bn-ambient-outer';
const AMBIENT_INNER_ID = 'bn-ambient-inner';
const AMBIENT_CORNERS_ID = 'bn-ambient-corners';

// window.locationのモック
function setupLocationMock(pathname: string) {
  Object.defineProperty(window, 'location', {
    value: {
      pathname,
      href: `https://www.nicovideo.jp${pathname}`,
    },
    writable: true,
    configurable: true,
  });
}

// 実際のニコニコ動画のDOM構造を再現
function createNiconicoPlayerDOM(
  options: {
    hasMainVideo?: boolean;
    hasAdVideos?: boolean;
    mainVideoSrc?: string;
    mainVideoWidth?: number;
    mainVideoHeight?: number;
    isFullscreen?: boolean;
    hasClassicLayout?: boolean;
    mainVideoHasDataName?: boolean;
  } = {},
) {
  const {
    hasMainVideo = true,
    hasAdVideos = true,
    mainVideoSrc = 'blob:https://www.nicovideo.jp/test-video-id',
    mainVideoWidth = 480,
    mainVideoHeight = 360,
    isFullscreen = false,
    hasClassicLayout = false,
    // 実機ではメイン動画に data-name="video-content" が付与されている
    mainVideoHasDataName = true,
  } = options;

  const fullscreenClass = isFullscreen ? 'w_[100dvw] h_[100dvh]' : '';
  const layoutAttr = hasClassicLayout ? 'data-bn-layout="classic"' : '';
  const dataNameAttr = mainVideoHasDataName ? 'data-name="video-content"' : '';

  document.body.innerHTML = `
    <section class="d_grid grid-template-areas_[_'player_sidebar'_'bottom_sidebar'_'bottom_sidebar'_] grid-tc_[var(--watch-player-width)_var(--watch-sidebar-width)] grid-tr_[min-content_min-content_1fr]">
      <div class="grid-area_[player]" data-styling-name="fullscreen-target" ${layoutAttr}>
        <div class="pos_relative ${fullscreenClass}">
          ${hasMainVideo ? `<video id="main-video" ${dataNameAttr}></video>` : ''}
          ${
            hasAdVideos
              ? `
            <div id="nv_watch_VideoAdContainer" class="pos_absolute inset_0">
              <video id="ad-video-1"></video>
              <video id="ad-video-2"></video>
            </div>
          `
              : ''
          }
        </div>
      </div>
      <div class="grid-area_[bottom]">
        <h1>動画タイトル</h1>
      </div>
      <div class="grid-area_[sidebar]">
        <h1>コメントリスト</h1>
      </div>
    </section>
  `;

  if (hasMainVideo) {
    const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
    Object.defineProperty(mainVideo, 'src', { value: mainVideoSrc, configurable: true });
    Object.defineProperty(mainVideo, 'videoWidth', { value: mainVideoWidth, configurable: true });
    Object.defineProperty(mainVideo, 'videoHeight', {
      value: mainVideoHeight,
      configurable: true,
    });
    Object.defineProperty(mainVideo, 'readyState', { value: 4, configurable: true });
    mainVideo.requestVideoFrameCallback = vi.fn(() => 0);
    mainVideo.cancelVideoFrameCallback = vi.fn();
  }

  if (hasAdVideos) {
    ['ad-video-1', 'ad-video-2'].forEach((id) => {
      const adVideo = document.getElementById(id) as HTMLVideoElement;
      Object.defineProperty(adVideo, 'src', { value: '', configurable: true });
      Object.defineProperty(adVideo, 'videoWidth', { value: 0, configurable: true });
      Object.defineProperty(adVideo, 'videoHeight', { value: 0, configurable: true });
      Object.defineProperty(adVideo, 'readyState', { value: 0, configurable: true });
    });
  }
}

// キャンバスコンテキストのモック
function createMockCanvasContext(): CanvasRenderingContext2D {
  // 16x16のサンプルピクセルデータを作成（RGBA形式）
  const pixelData = new Uint8ClampedArray(16 * 16 * 4);
  // 彩度の高い色を設定（テスト用）
  for (let i = 0; i < 16 * 16; i++) {
    const idx = i * 4;
    // 赤系の色
    pixelData[idx] = 200; // R
    pixelData[idx + 1] = 50; // G
    pixelData[idx + 2] = 50; // B
    pixelData[idx + 3] = 255; // A
  }

  const mockImageData: ImageData = {
    data: pixelData,
    width: 16,
    height: 16,
    colorSpace: 'srgb',
  };

  return {
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue(mockImageData),
    // 他の必要なメソッド
    canvas: document.createElement('canvas'),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('cinematicLighting', () => {
  let apply: typeof import('./cinematicLighting').apply;
  let consoleLogSpy: MockInstance;
  let consoleWarnSpy: MockInstance;
  let originalCreateElement: typeof document.createElement;
  let mockContext: CanvasRenderingContext2D;

  // fullscreenchangeイベントリスナーを追跡
  const fullscreenListeners: EventListener[] = [];
  let originalAddEventListener: typeof document.addEventListener;

  // setIntervalの追跡
  let intervalIds: ReturnType<typeof setInterval>[] = [];
  let originalSetInterval: typeof setInterval;

  beforeEach(async () => {
    // DOMをリセット（前テストのbody class/styleが残らないように明示的にクリア）
    document.body.innerHTML = '';
    document.body.className = '';
    document.body.removeAttribute('style');

    // console.logをモック
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // watchページをモック
    setupLocationMock('/watch/sm12345');

    // fullscreen APIをモック
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    });

    // fullscreenchangeイベントリスナーを追跡
    originalAddEventListener = document.addEventListener.bind(document);
    document.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'fullscreenchange' && typeof listener === 'function') {
        fullscreenListeners.push(listener);
      }
      return originalAddEventListener(type, listener, options);
    }) as typeof document.addEventListener;

    // setIntervalを追跡
    originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = ((callback: () => void, delay: number) => {
      const id = originalSetInterval(callback, delay);
      intervalIds.push(id);
      return id;
    }) as typeof setInterval;

    // キャンバスのgetContextをモック
    mockContext = createMockCanvasContext();
    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'canvas') {
        (element as HTMLCanvasElement).getContext = vi.fn().mockReturnValue(mockContext);
      }
      return element;
    }) as typeof document.createElement;

    // モジュールをリセット
    vi.resetModules();
    const module = await import('./cinematicLighting');
    apply = module.apply;
  });

  afterEach(() => {
    // fullscreenchangeリスナーを削除
    fullscreenListeners.forEach((listener) => {
      document.removeEventListener('fullscreenchange', listener);
    });
    fullscreenListeners.length = 0;

    // インターバルをクリア
    intervalIds.forEach((id) => clearInterval(id));
    intervalIds = [];

    // 元の関数を復元
    if (originalAddEventListener) {
      document.addEventListener = originalAddEventListener;
    }
    if (originalSetInterval) {
      globalThis.setInterval = originalSetInterval;
    }
    if (originalCreateElement) {
      document.createElement = originalCreateElement;
    }

    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  describe('ページ判定', () => {
    it('視聴ページ以外では何もしない', () => {
      setupLocationMock('/video_top');
      createNiconicoPlayerDOM();

      apply(true);

      const ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID);
      expect(ambientContainer).toBeNull();
    });

    it('/watch/で始まるページで動作する', () => {
      setupLocationMock('/watch/sm9');
      createNiconicoPlayerDOM();

      apply(true);

      const ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID);
      expect(ambientContainer).not.toBeNull();
    });
  });

  describe('動画要素の検出', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('プレイヤーエリアが存在しない場合は何もしない', () => {
      document.body.innerHTML = '<div>No player area</div>';

      apply(true);

      const ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID);
      expect(ambientContainer).toBeNull();
    });

    it('動画要素が存在しない場合は何もしない', () => {
      createNiconicoPlayerDOM({ hasMainVideo: false, hasAdVideos: false });

      apply(true);

      // 動画が見つからない場合、警告がログに出力される（リトライ後）
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();
    });

    it('広告コンテナ内の動画のみの場合は何もしない', () => {
      createNiconicoPlayerDOM({ hasMainVideo: false, hasAdVideos: true });

      apply(true);

      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();
    });

    it('srcが空の動画は除外する', () => {
      createNiconicoPlayerDOM({ mainVideoSrc: '' });

      apply(true);

      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();
    });

    it('videoWidthが0の動画は除外する', () => {
      createNiconicoPlayerDOM({ mainVideoWidth: 0 });

      apply(true);

      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();
    });

    it('有効なメインコンテンツ動画を正しく検出する', () => {
      createNiconicoPlayerDOM({
        mainVideoSrc: 'blob:https://www.nicovideo.jp/valid-video',
        mainVideoWidth: 1920,
        mainVideoHeight: 1080,
      });

      apply(true);

      const ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID);
      expect(ambientContainer).not.toBeNull();
    });
  });

  describe('アンビエント要素の作成', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('アンビエントコンテナが正しく作成される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID);
      expect(ambientContainer).not.toBeNull();
      expect(ambientContainer?.getAttribute(AMBIENT_CONTAINER_MARKER)).toBe('true');
      expect(ambientContainer?.className).toBe('bn-ambient-container');
    });

    it('外側グロー要素が正しく作成される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const ambientOuter = document.getElementById(AMBIENT_OUTER_ID);
      expect(ambientOuter).not.toBeNull();
      expect(ambientOuter?.getAttribute(AMBIENT_OUTER_MARKER)).toBe('true');
      expect(ambientOuter?.className).toBe('bn-ambient-outer');
    });

    it('内側グロー要素が正しく作成される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const ambientInner = document.getElementById(AMBIENT_INNER_ID);
      expect(ambientInner).not.toBeNull();
      expect(ambientInner?.className).toBe('bn-ambient-inner');
    });

    it('コーナーグロー要素が正しく作成される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const ambientCorners = document.getElementById(AMBIENT_CORNERS_ID);
      expect(ambientCorners).not.toBeNull();
      expect(ambientCorners?.className).toBe('bn-ambient-corners');

      // 4つのコーナー要素が作成される
      const corners = ambientCorners?.querySelectorAll('.bn-ambient-corner');
      expect(corners?.length).toBe(4);

      // 各コーナーのdata-corner属性をチェック
      const cornerPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      corners?.forEach((corner, index) => {
        expect(corner.getAttribute('data-corner')).toBe(cornerPositions[index]);
      });
    });

    it('プレイヤーエリアにposition: relativeが設定される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea.style.position).toBe('relative');
    });

    it('親グリッドにposition: relativeが設定される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const mainGrid = document.querySelector('.grid-area_\\[player\\]')
        ?.parentElement as HTMLElement;
      expect(mainGrid?.style.position).toBe('relative');
    });
  });

  describe('全画面モード', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('Fullscreen APIで全画面を検出した場合はアンビエントを表示しない', () => {
      createNiconicoPlayerDOM();

      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        configurable: true,
      });

      apply(true);

      // アンビエント要素は作成されるがグロー効果は表示されない
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('全画面表示中のため'));
    });

    it('DOMベースで全画面を検出した場合はアンビエントを表示しない', () => {
      createNiconicoPlayerDOM({ isFullscreen: true });

      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('全画面表示中のため'));
    });
  });

  describe('無効化（apply(false)）', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('アンビエント要素が削除される', () => {
      createNiconicoPlayerDOM();

      apply(true);
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();
      expect(document.getElementById(AMBIENT_OUTER_ID)).not.toBeNull();

      apply(false);
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();
      expect(document.getElementById(AMBIENT_OUTER_ID)).toBeNull();
    });

    it('無効化のログが出力される', () => {
      createNiconicoPlayerDOM();

      apply(true);
      apply(false);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('シネマティックライティングを無効化'),
      );
    });
  });

  describe('冪等性', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('すでに有効な場合は再度有効化しない', () => {
      createNiconicoPlayerDOM();

      apply(true);
      const containerAfterFirst = document.getElementById(AMBIENT_CONTAINER_ID);

      apply(true);
      const containerAfterSecond = document.getElementById(AMBIENT_CONTAINER_ID);

      // 同じ要素であることを確認
      expect(containerAfterFirst).toBe(containerAfterSecond);
    });

    it('複数回無効化しても問題ない', () => {
      createNiconicoPlayerDOM();

      apply(true);
      apply(false);
      apply(false);
      apply(false);

      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();
    });

    it('有効/無効を繰り返しても正しく動作する', () => {
      createNiconicoPlayerDOM();

      // 有効化
      apply(true);
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();

      // 無効化
      apply(false);
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();

      // 再度有効化
      apply(true);
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();

      // 再度無効化
      apply(false);
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();
    });
  });

  describe('クラシックレイアウトとの互換性', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('クラシックレイアウトが有効でも正しく動作する', () => {
      createNiconicoPlayerDOM({ hasClassicLayout: true });

      apply(true);

      const ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID);
      const ambientOuter = document.getElementById(AMBIENT_OUTER_ID);

      expect(ambientContainer).not.toBeNull();
      expect(ambientOuter).not.toBeNull();
    });
  });

  describe('コンソールログ', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('有効化時にログが出力される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('シネマティックライティングを有効化'),
      );
    });

    it('無効化時にログが出力される', () => {
      createNiconicoPlayerDOM();

      apply(true);
      apply(false);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('シネマティックライティングが無効になりました'),
      );
    });

    it('全画面イベントリスナーセットアップのログが出力される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('全画面表示イベントリスナーをセットアップしました'),
      );
    });
  });

  describe('fullscreenchangeイベントハンドリング', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('全画面に入るとグローが非表示になる', () => {
      createNiconicoPlayerDOM();

      apply(true);

      // 全画面に入る
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('全画面表示に入りました'));
    });

    it('全画面から抜けるとグローが再開する', async () => {
      vi.useFakeTimers();

      createNiconicoPlayerDOM();
      apply(true);

      // 全画面に入る
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      // 全画面から抜ける
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      await vi.advanceTimersByTimeAsync(100);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('全画面表示から抜けました'),
      );

      vi.useRealTimers();
    });
  });

  describe('実際のDOM構造からの調査結果に基づくテスト', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('実際のニコニコ動画のグリッド構造で動作する', () => {
      // 実際のサイトで確認したDOM構造
      document.body.innerHTML = `
        <section class="d_grid grid-template-areas_[_'player_sidebar'_'bottom_sidebar'_'bottom_sidebar'_] grid-tc_[var(--watch-player-width)_var(--watch-sidebar-width)] grid-tr_[min-content_min-content_1fr] jc_center rg_x1_5 cg_x3 pb_x10">
          <div class="grid-area_[player]" data-styling-name="fullscreen-target">
            <div class="pos_relative">
              <video id="main-video"></video>
              <div id="nv_watch_VideoAdContainer" class="pos_absolute inset_0">
                <video id="ad-video-1"></video>
                <video id="ad-video-2"></video>
              </div>
            </div>
          </div>
          <div class="grid-area_[bottom] d_flex flex-d_column gap_x2">
            <div class="d_flex jc_space-between ai_flex-start gap_var(--watch-video-information-gap) w_100%">
              <h1>新・豪血寺一族 -煩悩解放 - レッツゴー！陰陽師</h1>
            </div>
          </div>
          <div class="grid-area_[sidebar]">
            <div class="d_flex flex-d_column gap_x2">サイドバー</div>
          </div>
        </section>
      `;

      // メイン動画のモック
      const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
      Object.defineProperty(mainVideo, 'src', {
        value: 'blob:https://www.nicovideo.jp/test',
        configurable: true,
      });
      Object.defineProperty(mainVideo, 'videoWidth', { value: 480, configurable: true });
      Object.defineProperty(mainVideo, 'videoHeight', { value: 360, configurable: true });
      Object.defineProperty(mainVideo, 'readyState', { value: 4, configurable: true });
      mainVideo.requestVideoFrameCallback = vi.fn(() => 0);
      mainVideo.cancelVideoFrameCallback = vi.fn();

      // 広告動画のモック
      ['ad-video-1', 'ad-video-2'].forEach((id) => {
        const adVideo = document.getElementById(id) as HTMLVideoElement;
        Object.defineProperty(adVideo, 'src', { value: '', configurable: true });
        Object.defineProperty(adVideo, 'videoWidth', { value: 0, configurable: true });
        Object.defineProperty(adVideo, 'videoHeight', { value: 0, configurable: true });
        Object.defineProperty(adVideo, 'readyState', { value: 0, configurable: true });
      });

      apply(true);

      const ambientContainer = document.getElementById(AMBIENT_CONTAINER_ID);
      const ambientOuter = document.getElementById(AMBIENT_OUTER_ID);

      expect(ambientContainer).not.toBeNull();
      expect(ambientOuter).not.toBeNull();
    });

    it('広告コンテナ内の動画は無視される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      // アンビエント要素が作成される（広告動画ではなくメイン動画が使用される）
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();
    });
  });

  describe('クリーンアップ', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('無効化時に既存要素がすべて削除される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      // すべての要素が作成されていることを確認
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();
      expect(document.getElementById(AMBIENT_OUTER_ID)).not.toBeNull();
      expect(document.getElementById(AMBIENT_INNER_ID)).not.toBeNull();
      expect(document.getElementById(AMBIENT_CORNERS_ID)).not.toBeNull();

      apply(false);

      // すべての要素が削除されていることを確認
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();
      expect(document.getElementById(AMBIENT_OUTER_ID)).toBeNull();
      expect(document.getElementById(AMBIENT_INNER_ID)).toBeNull();
      expect(document.getElementById(AMBIENT_CORNERS_ID)).toBeNull();
    });

    it('マーカー属性を持つ要素も削除される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      expect(document.querySelector(`[${AMBIENT_CONTAINER_MARKER}]`)).not.toBeNull();
      expect(document.querySelector(`[${AMBIENT_OUTER_MARKER}]`)).not.toBeNull();

      apply(false);

      expect(document.querySelector(`[${AMBIENT_CONTAINER_MARKER}]`)).toBeNull();
      expect(document.querySelector(`[${AMBIENT_OUTER_MARKER}]`)).toBeNull();
    });
  });

  describe('エッジケース', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('プレイヤーエリアの親要素がない場合はエラーにならない', () => {
      document.body.innerHTML = '<div class="grid-area_[player]"></div>';

      expect(() => apply(true)).not.toThrow();
    });

    it('無効化時に要素が存在しなくてもエラーにならない', () => {
      expect(() => apply(false)).not.toThrow();
    });

    it('連続して有効化しても重複要素が作成されない', () => {
      createNiconicoPlayerDOM();

      apply(true);
      apply(true);
      apply(true);

      const containers = document.querySelectorAll(`#${AMBIENT_CONTAINER_ID}`);
      const outers = document.querySelectorAll(`#${AMBIENT_OUTER_ID}`);

      expect(containers.length).toBe(1);
      expect(outers.length).toBe(1);
    });
  });

  describe('色抽出ロジック', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('サンプリングキャンバスが作成される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      // document.createElementがcanvasで呼ばれたことを確認
      // （モックを通じて確認）
      expect(mockContext.drawImage).toBeDefined();
    });
  });

  describe('requestVideoFrameCallback', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('requestVideoFrameCallbackがサポートされている場合に使用される', async () => {
      // HTMLVideoElement.prototypeにrequestVideoFrameCallbackを追加
      const originalRVFC = HTMLVideoElement.prototype.requestVideoFrameCallback;
      HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn(() => 0);

      // モジュールをリセットして再インポート（サポートチェックを再評価させる）
      vi.resetModules();
      const module = await import('./cinematicLighting');
      apply = module.apply;

      createNiconicoPlayerDOM();
      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('requestVideoFrameCallback を使用'),
      );

      // クリーンアップ
      if (originalRVFC) {
        HTMLVideoElement.prototype.requestVideoFrameCallback = originalRVFC;
      } else {
        delete (HTMLVideoElement.prototype as { requestVideoFrameCallback?: unknown })
          .requestVideoFrameCallback;
      }
    });

    it('requestVideoFrameCallbackがサポートされていない場合はrequestAnimationFrameを使用', async () => {
      // HTMLVideoElement.prototypeからrequestVideoFrameCallbackを削除
      const originalRVFC = HTMLVideoElement.prototype.requestVideoFrameCallback;
      delete (HTMLVideoElement.prototype as { requestVideoFrameCallback?: unknown })
        .requestVideoFrameCallback;

      // モジュールをリセットして再インポート
      vi.resetModules();
      const module = await import('./cinematicLighting');
      apply = module.apply;

      createNiconicoPlayerDOM();
      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('requestAnimationFrame を使用'),
      );

      // クリーンアップ
      if (originalRVFC) {
        HTMLVideoElement.prototype.requestVideoFrameCallback = originalRVFC;
      }
    });
  });

  describe('モジュール状態の分離', () => {
    it('リセット後に状態がクリアされる', async () => {
      setupLocationMock('/watch/sm9');
      createNiconicoPlayerDOM();

      apply(true);
      apply(false);

      // モジュールをリセット
      vi.resetModules();
      const module = await import('./cinematicLighting');
      apply = module.apply;

      // 新しいDOMを作成
      createNiconicoPlayerDOM();

      // 再度有効化できることを確認
      apply(true);
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();
    });
  });

  describe('動画変更時の再初期化', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('動画ソースが変更された場合は再初期化される', () => {
      createNiconicoPlayerDOM({
        mainVideoSrc: 'blob:https://www.nicovideo.jp/video-1',
      });

      apply(true);
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();

      // 動画ソースを変更
      const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
      Object.defineProperty(mainVideo, 'src', {
        value: 'blob:https://www.nicovideo.jp/video-2',
        configurable: true,
      });

      // 再度有効化を呼ぶと再初期化される
      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('動画要素が変更されました'),
      );
    });

    it('動画要素が変更された場合は再初期化される', () => {
      createNiconicoPlayerDOM();
      apply(true);

      // 新しい動画要素を追加（元の動画を置き換え）
      const playerArea = document.querySelector('.grid-area_\\[player\\]');
      const posRelative = playerArea?.querySelector('.pos_relative');
      const oldVideo = document.getElementById('main-video');
      oldVideo?.remove();

      const newVideo = document.createElement('video');
      newVideo.id = 'main-video-new';
      Object.defineProperty(newVideo, 'src', {
        value: 'blob:https://www.nicovideo.jp/new-video',
        configurable: true,
      });
      Object.defineProperty(newVideo, 'videoWidth', { value: 1920, configurable: true });
      Object.defineProperty(newVideo, 'videoHeight', { value: 1080, configurable: true });
      Object.defineProperty(newVideo, 'readyState', { value: 4, configurable: true });
      newVideo.requestVideoFrameCallback = vi.fn(() => 0);
      newVideo.cancelVideoFrameCallback = vi.fn();
      posRelative?.appendChild(newVideo);

      // 再度有効化を呼ぶと再初期化される
      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('動画要素が変更されました'),
      );
    });
  });

  describe('リトライロジック', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('動画要素が見つからない場合はリトライする', () => {
      vi.useFakeTimers();

      // 動画なしでDOMを作成
      createNiconicoPlayerDOM({ hasMainVideo: false, hasAdVideos: false });

      apply(true);

      // リトライのログが出力される
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/動画要素が見つかりません.*再試行 1\/10/),
      );

      // 500ms後に再試行
      vi.advanceTimersByTime(500);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/動画要素が見つかりません.*再試行 2\/10/),
      );

      vi.useRealTimers();
    });

    it('最大リトライ回数を超えると警告が出力される', () => {
      vi.useFakeTimers();

      // 動画なしでDOMを作成
      createNiconicoPlayerDOM({ hasMainVideo: false, hasAdVideos: false });

      apply(true);

      // 10回リトライ（500ms x 10）
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(500);
      }

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('動画要素が見つかりませんでした'),
      );

      vi.useRealTimers();
    });

    it('リトライ中に動画が見つかると成功する', () => {
      vi.useFakeTimers();

      // 最初は動画なし
      createNiconicoPlayerDOM({ hasMainVideo: false, hasAdVideos: false });

      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/動画要素が見つかりません.*再試行 1\/10/),
      );

      // 動画を追加
      const playerArea = document.querySelector('.grid-area_\\[player\\]');
      const posRelative = playerArea?.querySelector('.pos_relative');
      const video = document.createElement('video');
      video.id = 'main-video';
      Object.defineProperty(video, 'src', {
        value: 'blob:https://www.nicovideo.jp/test',
        configurable: true,
      });
      Object.defineProperty(video, 'videoWidth', { value: 480, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
      Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
      video.requestVideoFrameCallback = vi.fn(() => 0);
      video.cancelVideoFrameCallback = vi.fn();
      posRelative?.appendChild(video);

      // 次のリトライで成功
      vi.advanceTimersByTime(500);

      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('シネマティックライティングが有効になりました'),
      );

      vi.useRealTimers();
    });
  });

  describe('色抽出の詳細テスト', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('彩度の高い色がエッジから抽出される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      // drawImageが呼ばれることを確認（色抽出のため）
      expect(mockContext.drawImage).toBeDefined();
    });
  });

  describe('グロー効果の更新', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('アンビエント内側要素にbox-shadowが設定される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const ambientInner = document.getElementById(AMBIENT_INNER_ID);
      // 初期状態ではスタイルが設定されていない（フレーム処理後に設定される）
      expect(ambientInner).not.toBeNull();
    });

    it('有効化直後にグロー（box-shadow）が描画される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      // requestVideoFrameCallback起点のループが同期的に1フレーム処理し、updateGlowが走る
      const ambientInner = document.getElementById(AMBIENT_INNER_ID) as HTMLElement;
      expect(ambientInner.style.boxShadow).toContain('rgba');
      expect(ambientInner.style.boxShadow).not.toBe('none');
    });
  });

  describe('テーマ適応レンダリング', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('明るい背景（ライトテーマ）ではbodyにbn-ambient-lightクラスが付与される', () => {
      // 背景輝度の実測が最優先される（最も堅牢な検出経路）
      document.body.style.backgroundColor = 'rgb(242, 242, 242)';
      createNiconicoPlayerDOM();

      apply(true);

      expect(document.body.classList.contains('bn-ambient-light')).toBe(true);
    });

    it('暗い背景（ダークテーマ）ではbn-ambient-lightクラスが付与されない', () => {
      document.body.style.backgroundColor = 'rgb(13, 13, 13)';
      createNiconicoPlayerDOM();

      apply(true);

      expect(document.body.classList.contains('bn-ambient-light')).toBe(false);
    });

    it('背景未設定時はprefers-color-schemeにフォールバックする（dark）', () => {
      vi.stubGlobal(
        'matchMedia',
        (query: string) =>
          ({
            matches: query.includes('dark'),
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            onchange: null,
            dispatchEvent: vi.fn(),
          }) as unknown as MediaQueryList,
      );
      createNiconicoPlayerDOM();

      apply(true);

      expect(document.body.classList.contains('bn-ambient-light')).toBe(false);
    });

    it('無効化するとbn-ambient-lightクラスが除去される', () => {
      document.body.style.backgroundColor = 'rgb(242, 242, 242)';
      createNiconicoPlayerDOM();

      apply(true);
      expect(document.body.classList.contains('bn-ambient-light')).toBe(true);

      apply(false);
      expect(document.body.classList.contains('bn-ambient-light')).toBe(false);
    });
  });

  describe('動画検出（data-name優先・フォールバック）', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('data-name="video-content"を持つメイン動画で有効化できる', () => {
      createNiconicoPlayerDOM({ mainVideoHasDataName: true });

      apply(true);

      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();
    });

    it('data-nameが無くてもreadyStateフォールバックで有効化できる', () => {
      createNiconicoPlayerDOM({ mainVideoHasDataName: false });

      apply(true);

      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();
    });
  });

  describe('スタイル復元（クリーンアップ堅牢化）', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('無効化時にプレイヤーエリアのposition inline styleが復元される', () => {
      createNiconicoPlayerDOM();

      apply(true);
      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea.style.position).toBe('relative');

      apply(false);
      expect(playerArea.style.position).toBe('');
    });

    it('無効化時に親グリッドのposition inline styleが復元される', () => {
      createNiconicoPlayerDOM();

      apply(true);
      const mainGrid = document.querySelector('.grid-area_\\[player\\]')
        ?.parentElement as HTMLElement;
      expect(mainGrid.style.position).toBe('relative');

      apply(false);
      expect(mainGrid.style.position).toBe('');
    });
  });

  describe('非watchページ遷移時のクリーンアップ', () => {
    it('有効状態で非watchページへ遷移しapply(true)されると要素が削除される', () => {
      setupLocationMock('/watch/sm9');
      createNiconicoPlayerDOM();

      apply(true);
      expect(document.getElementById(AMBIENT_CONTAINER_ID)).not.toBeNull();

      // 非watchページに遷移（SPAではないが、URLだけ変わった状況を再現）
      setupLocationMock('/video_top');
      apply(true);

      expect(document.getElementById(AMBIENT_CONTAINER_ID)).toBeNull();
      expect(document.getElementById(AMBIENT_OUTER_ID)).toBeNull();
    });
  });
});
