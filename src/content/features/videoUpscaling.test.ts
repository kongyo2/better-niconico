/**
 * Tests for src/content/features/videoUpscaling.ts
 *
 * ニコニコ動画のDOM構造を実際のページから調査した結果に基づくテスト
 *
 * 実際のページ構造:
 * - プレイヤーエリア: .grid-area_[player]
 * - 動画要素: 3つ（メインコンテンツ1つ + 広告コンテナ内2つ）
 * - 広告コンテナ: #nv_watch_VideoAdContainer
 * - メイン動画: blob: URL、position: absolute、videoWidth/videoHeight設定済み
 * - 全画面モード検出: document.fullscreenElement または .w_[100dvw].h_[100dvh]
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// 定数
const UPSCALING_MARKER = 'data-bn-upscaling';
const UPSCALING_ACTIVE = 'active';
const UPSCALING_INACTIVE = 'inactive';
const CANVAS_ID = 'bn-upscaled-canvas';

// モック関数をhoistedで事前に作成
const { mockRender, MockModeA, MockModeAA } = vi.hoisted(() => {
  const mockRender = vi.fn().mockResolvedValue(undefined);

  class MockModeA {
    pass = vi.fn();
    getOutputTexture = vi.fn().mockReturnValue({});
    constructor(public options: unknown) {}
  }

  class MockModeAA {
    pass = vi.fn();
    getOutputTexture = vi.fn().mockReturnValue({});
    constructor(public options: unknown) {}
  }

  return { mockRender, MockModeA, MockModeAA };
});

// anime4k-webgpuのモック
vi.mock('anime4k-webgpu', () => ({
  render: mockRender,
  ModeA: MockModeA,
  ModeAA: MockModeAA,
}));

// window.locationのモック
function setupLocationMock(pathname: string) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
    configurable: true,
  });
}

// WebGPUモックのセットアップ
function setupWebGPUMock(supported: boolean = true) {
  const mockAdapter = supported
    ? {
        requestDevice: vi.fn().mockResolvedValue({
          createTexture: vi.fn().mockReturnValue({}),
          queue: { submit: vi.fn() },
        }),
      }
    : null;

  Object.defineProperty(navigator, 'gpu', {
    value: supported
      ? {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
        }
      : undefined,
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
  } = {},
) {
  const {
    hasMainVideo = true,
    hasAdVideos = true,
    mainVideoSrc = 'blob:https://www.nicovideo.jp/test-video-id',
    mainVideoWidth = 480,
    mainVideoHeight = 360,
    isFullscreen = false,
  } = options;

  const fullscreenClass = isFullscreen ? 'w_[100dvw] h_[100dvh]' : '';

  document.body.innerHTML = `
    <div class="grid-area_[player]">
      <div class="pos_relative ${fullscreenClass}">
        ${hasMainVideo ? '<video id="main-video"></video>' : ''}
        ${
          hasAdVideos
            ? `
          <div id="nv_watch_VideoAdContainer">
            <video id="ad-video-1"></video>
            <video id="ad-video-2"></video>
          </div>
        `
            : ''
        }
      </div>
    </div>
  `;

  if (hasMainVideo) {
    const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
    Object.defineProperty(mainVideo, 'src', { value: mainVideoSrc, configurable: true });
    Object.defineProperty(mainVideo, 'videoWidth', { value: mainVideoWidth, configurable: true });
    Object.defineProperty(mainVideo, 'videoHeight', { value: mainVideoHeight, configurable: true });
    Object.defineProperty(mainVideo, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(mainVideo, 'HAVE_METADATA', { value: 1, configurable: true });
    mainVideo.requestVideoFrameCallback = vi.fn(() => 0);
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

function mockElementRect(element: Element, width: number, height: number) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: vi.fn(() => ({
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    })),
    configurable: true,
  });
}

describe('videoUpscaling', () => {
  let apply: typeof import('./videoUpscaling').apply;
  let render: typeof import('anime4k-webgpu').render;
  let ModeA: typeof import('anime4k-webgpu').ModeA;
  let ModeAA: typeof import('anime4k-webgpu').ModeAA;

  beforeEach(async () => {
    // DOM をリセット
    document.body.innerHTML = '';

    // fullscreenElement をリセット
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    });

    Object.defineProperty(window, 'devicePixelRatio', {
      value: 1,
      configurable: true,
    });

    // WebGPUモックを設定
    setupWebGPUMock(true);

    // モジュールをリセット（状態をクリア）
    vi.resetModules();

    // モジュールを再インポート
    const videoUpscalingModule = await import('./videoUpscaling');
    apply = videoUpscalingModule.apply;

    const anime4kModule = await import('anime4k-webgpu');
    render = anime4kModule.render;
    ModeA = anime4kModule.ModeA;
    ModeAA = anime4kModule.ModeAA;

    // モックの呼び出し履歴をクリア（インポート後に行う）
    vi.mocked(render).mockClear();
  });

  afterEach(async () => {
    if (apply) {
      await apply(false);
    }
    vi.restoreAllMocks();
  });

  describe('ページ判定', () => {
    it('視聴ページ以外では何もしない', async () => {
      setupLocationMock('/video_top');
      createNiconicoPlayerDOM();

      await apply(true);

      expect(render).not.toHaveBeenCalled();
    });

    it('/watch/で始まるページで動作する', async () => {
      setupLocationMock('/watch/sm9');
      createNiconicoPlayerDOM();

      await apply(true);

      expect(render).toHaveBeenCalled();
    });
  });

  describe('動画要素の検出', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('プレイヤーエリアが存在しない場合は何もしない', async () => {
      document.body.innerHTML = '<div>No player area</div>';

      await apply(true);

      expect(render).not.toHaveBeenCalled();
    });

    it('動画要素が存在しない場合は何もしない', async () => {
      createNiconicoPlayerDOM({ hasMainVideo: false, hasAdVideos: false });

      await apply(true);

      expect(render).not.toHaveBeenCalled();
    });

    it('広告コンテナ内の動画のみの場合は何もしない', async () => {
      createNiconicoPlayerDOM({ hasMainVideo: false, hasAdVideos: true });

      await apply(true);

      expect(render).not.toHaveBeenCalled();
    });

    it('srcが空の動画は除外する', async () => {
      createNiconicoPlayerDOM({ mainVideoSrc: '' });

      await apply(true);

      expect(render).not.toHaveBeenCalled();
    });

    it('videoWidthが0の動画は除外する', async () => {
      createNiconicoPlayerDOM({ mainVideoWidth: 0 });

      await apply(true);

      expect(render).not.toHaveBeenCalled();
    });

    it('有効なメインコンテンツ動画を正しく検出する', async () => {
      createNiconicoPlayerDOM({
        mainVideoSrc: 'blob:https://www.nicovideo.jp/valid-video',
        mainVideoWidth: 1920,
        mainVideoHeight: 1080,
      });

      await apply(true);

      expect(render).toHaveBeenCalled();
    });
  });

  describe('Canvas作成', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('Canvas要素が正しく作成される', async () => {
      createNiconicoPlayerDOM();

      await apply(true);

      const canvas = document.getElementById(CANVAS_ID);
      expect(canvas).not.toBeNull();
      expect(canvas?.tagName).toBe('CANVAS');
    });

    it('Canvasの解像度が2倍にアップスケールされる', async () => {
      createNiconicoPlayerDOM({
        mainVideoWidth: 480,
        mainVideoHeight: 360,
      });

      await apply(true);

      const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;
      expect(canvas?.width).toBe(960);
      expect(canvas?.height).toBe(720);
    });

    it('表示サイズとDPRに合わせて低解像度動画を4倍までアップスケールする', async () => {
      createNiconicoPlayerDOM({
        mainVideoWidth: 640,
        mainVideoHeight: 360,
      });
      const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
      mockElementRect(mainVideo, 960, 540);
      Object.defineProperty(window, 'devicePixelRatio', {
        value: 2,
        configurable: true,
      });

      await apply(true);

      const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;
      expect(canvas?.width).toBe(1920);
      expect(canvas?.height).toBe(1080);
    });

    it('高解像度動画は表示サイズ以上に無駄な2倍化をしない', async () => {
      createNiconicoPlayerDOM({
        mainVideoWidth: 1920,
        mainVideoHeight: 1080,
      });
      const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
      mockElementRect(mainVideo, 960, 540);

      await apply(true);

      const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;
      expect(canvas?.width).toBe(960);
      expect(canvas?.height).toBe(540);
    });

    it('動画要素はレイアウトを維持したまま非表示になる', async () => {
      createNiconicoPlayerDOM();

      await apply(true);

      const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
      expect(mainVideo.style.display).toBe('');
      expect(mainVideo.style.visibility).toBe('hidden');
    });

    it('動画要素にアクティブマーカーが設定される', async () => {
      createNiconicoPlayerDOM();

      await apply(true);

      const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
      expect(mainVideo.getAttribute(UPSCALING_MARKER)).toBe(UPSCALING_ACTIVE);
    });
  });

  describe('WebGPU対応チェック', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('WebGPU非対応ブラウザでは何もしない', async () => {
      setupWebGPUMock(false);

      // モジュールを再度リセット・インポートしてWebGPUチェックをやり直す
      vi.resetModules();
      const videoUpscalingModule = await import('./videoUpscaling');
      apply = videoUpscalingModule.apply;
      const anime4kModule = await import('anime4k-webgpu');
      render = anime4kModule.render;

      createNiconicoPlayerDOM();

      await apply(true);

      expect(render).not.toHaveBeenCalled();
    });
  });

  describe('無効化（apply(false)）', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('Canvas要素が削除される', async () => {
      createNiconicoPlayerDOM();

      await apply(true);
      expect(document.getElementById(CANVAS_ID)).not.toBeNull();

      apply(false);
      expect(document.getElementById(CANVAS_ID)).toBeNull();
    });

    it('動画要素が再表示される', async () => {
      createNiconicoPlayerDOM();

      await apply(true);

      const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
      expect(mainVideo.style.visibility).toBe('hidden');

      apply(false);
      expect(mainVideo.style.display).toBe('');
      expect(mainVideo.style.visibility).toBe('');
    });

    it('動画要素のマーカーがinactiveになる', async () => {
      createNiconicoPlayerDOM();

      await apply(true);
      apply(false);

      const mainVideo = document.getElementById('main-video') as HTMLVideoElement;
      expect(mainVideo.getAttribute(UPSCALING_MARKER)).toBe(UPSCALING_INACTIVE);
    });
  });

  describe('全画面モード', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('Fullscreen APIで全画面を検出した場合はアップスケーリングを無効化', async () => {
      createNiconicoPlayerDOM();

      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        configurable: true,
      });

      await apply(true);

      expect(render).not.toHaveBeenCalled();
    });

    it('DOMベースで全画面を検出した場合はアップスケーリングを無効化', async () => {
      createNiconicoPlayerDOM({ isFullscreen: true });

      await apply(true);

      expect(render).not.toHaveBeenCalled();
    });
  });

  describe('冪等性', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('すでにアクティブな場合は再度有効化しない', async () => {
      createNiconicoPlayerDOM();

      await apply(true);
      const firstCallCount = (render as Mock).mock.calls.length;

      await apply(true);
      const secondCallCount = (render as Mock).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('Anime4K-WebGPU統合', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('render関数が正しいパラメータで呼ばれる', async () => {
      createNiconicoPlayerDOM();

      await apply(true);

      expect(render).toHaveBeenCalledTimes(1);
      const renderCall = (render as Mock).mock.calls[0][0];
      expect(renderCall.video).toBeDefined();
      expect(renderCall.canvas).toBeDefined();
      expect(renderCall.pipelineBuilder).toBeInstanceOf(Function);
    });

    it('低解像度動画では高品質のModeAAパイプラインを作成する', async () => {
      createNiconicoPlayerDOM({
        mainVideoWidth: 480,
        mainVideoHeight: 360,
      });

      await apply(true);

      const renderCall = (render as Mock).mock.calls[0][0];
      const mockDevice = {};
      const mockInputTexture = {};

      const pipelines = renderCall.pipelineBuilder(mockDevice, mockInputTexture);

      // パイプラインが1つ返されることを確認
      expect(pipelines).toHaveLength(1);
      // ModeAAのインスタンスが作成されることを確認
      expect(pipelines[0]).toBeInstanceOf(ModeAA);
      expect(pipelines[0]).toHaveProperty('pass');
      expect(pipelines[0]).toHaveProperty('getOutputTexture');
      // オプションが正しく渡されることを確認
      expect(pipelines[0].options).toEqual({
        device: mockDevice,
        inputTexture: mockInputTexture,
        nativeDimensions: { width: 480, height: 360 },
        targetDimensions: { width: 960, height: 720 },
      });
    });

    it('高解像度または大きい出力では従来のModeAパイプラインを使う', async () => {
      createNiconicoPlayerDOM({
        mainVideoWidth: 1920,
        mainVideoHeight: 1080,
      });

      await apply(true);

      const renderCall = (render as Mock).mock.calls[0][0];
      const pipelines = renderCall.pipelineBuilder({}, {});

      expect(pipelines).toHaveLength(1);
      expect(pipelines[0]).toBeInstanceOf(ModeA);
    });
  });
});
