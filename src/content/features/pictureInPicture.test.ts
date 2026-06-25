/**
 * Tests for src/content/features/pictureInPicture.ts
 *
 * ニコニコ動画の実DOMで重要な要素:
 * - プレイヤーエリア: .grid-area_[player]
 * - メイン動画: data-name="video-content"
 * - 広告動画: #nv_watch_VideoAdContainer 内
 * - コメントキャンバス: [data-name="comment"] canvas
 * - 全画面ボタン: aria-label="全画面表示する"
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const PIP_BUTTON_ID = 'bn-pip-button';
const PIP_VIDEO_ID = 'bn-pip-video';
const UPSCALED_CANVAS_ID = 'bn-upscaled-canvas';

type PlayerDom = {
  mainVideo: HTMLVideoElement | null;
  commentCanvas: HTMLCanvasElement | null;
  supporterCanvas: HTMLCanvasElement | null;
};

type VideoOptions = {
  src?: string;
  width?: number;
  height?: number;
  readyState?: number;
  paused?: boolean;
  rectWidth?: number;
  rectHeight?: number;
};

let apply: typeof import('./pictureInPicture').apply;
let pictureInPictureElement: Element | null = null;
let requestPictureInPictureMock: ReturnType<typeof vi.fn>;
let exitPictureInPictureMock: ReturnType<typeof vi.fn>;
let playMock: ReturnType<typeof vi.fn>;
let pauseMock: ReturnType<typeof vi.fn>;
let captureStreamMock: ReturnType<typeof vi.fn>;
let requestFrameMock: ReturnType<typeof vi.fn>;
let stopTrackMock: ReturnType<typeof vi.fn>;
let drawImageMock: ReturnType<typeof vi.fn>;
let fillRectMock: ReturnType<typeof vi.fn>;
let capturedCanvas: HTMLCanvasElement | null = null;

function setupLocationMock(pathname: string): void {
  Object.defineProperty(window, 'location', {
    value: {
      pathname,
      href: `https://www.nicovideo.jp${pathname}`,
    },
    writable: true,
    configurable: true,
  });
}

function createRect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function configureVideo(video: HTMLVideoElement, options: VideoOptions = {}): void {
  const {
    src = 'blob:https://www.nicovideo.jp/current-video',
    width = 640,
    height = 360,
    readyState = 4,
    paused = false,
    rectWidth = 873,
    rectHeight = 491,
  } = options;

  Object.defineProperty(video, 'src', { value: src, configurable: true });
  Object.defineProperty(video, 'currentSrc', { value: src, configurable: true });
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true });
  Object.defineProperty(video, 'readyState', { value: readyState, configurable: true });
  Object.defineProperty(video, 'paused', { value: paused, configurable: true });
  Object.defineProperty(video, 'getBoundingClientRect', {
    value: vi.fn(() => createRect(rectWidth, rectHeight)),
    configurable: true,
  });
}

function createNiconicoPlayerDOM(
  options: {
    hasMainVideo?: boolean;
    hasCommentCanvas?: boolean;
    hasSupporterCanvas?: boolean;
    mainVideoOptions?: VideoOptions;
  } = {},
): PlayerDom {
  const {
    hasMainVideo = true,
    hasCommentCanvas = true,
    hasSupporterCanvas = false,
    mainVideoOptions,
  } = options;

  document.body.innerHTML = `
    <div class="grid-area_[player]">
      <div class="pos_relative">
        ${hasMainVideo ? '<video id="main-video" data-name="video-content"></video>' : ''}
        <div id="nv_watch_VideoAdContainer">
          <video id="ad-video-1"></video>
          <video id="ad-video-2"></video>
        </div>
        ${
          hasCommentCanvas
            ? '<div data-name="comment"><canvas id="comment-canvas" width="1366" height="768"></canvas></div>'
            : ''
        }
        ${
          hasSupporterCanvas
            ? '<div data-name="supporter-content" style="opacity: 1"><canvas id="supporter-canvas" width="1280" height="720"></canvas></div>'
            : ''
        }
        <div class="pos_relative d_flex ai_center gap_base mt_x0_5 h_x5">
          <button aria-label="一時停止する" class="Pressable cursor_pointer" type="button"></button>
          <button aria-label="ミュートする" class="Pressable cursor_pointer" type="button"></button>
          <button aria-label="全画面表示する" class="Pressable cursor_pointer" type="button"></button>
          <button aria-label="設定" class="Pressable cursor_pointer" type="button"></button>
        </div>
      </div>
    </div>
  `;

  const mainVideo = document.getElementById('main-video') as HTMLVideoElement | null;
  if (mainVideo) {
    configureVideo(mainVideo, mainVideoOptions);
  }

  ['ad-video-1', 'ad-video-2'].forEach((id) => {
    const adVideo = document.getElementById(id) as HTMLVideoElement | null;
    if (adVideo) {
      configureVideo(adVideo, {
        src: '',
        width: 0,
        height: 0,
        readyState: 0,
        paused: true,
        rectWidth: 0,
        rectHeight: 0,
      });
    }
  });

  return {
    mainVideo,
    commentCanvas: document.getElementById('comment-canvas') as HTMLCanvasElement | null,
    supporterCanvas: document.getElementById('supporter-canvas') as HTMLCanvasElement | null,
  };
}

function createPlayerContentWithVideo(videoId: string, src: string): HTMLVideoElement {
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    throw new Error('player area missing');
  }

  playerArea.innerHTML = `
    <div class="pos_relative">
      <video id="${videoId}" data-name="video-content"></video>
      <div id="nv_watch_VideoAdContainer"><video></video></div>
      <div data-name="comment"><canvas id="${videoId}-comment" width="1366" height="768"></canvas></div>
      <div class="pos_relative d_flex ai_center gap_base mt_x0_5 h_x5">
        <button aria-label="一時停止する" class="Pressable cursor_pointer" type="button"></button>
        <button aria-label="全画面表示する" class="Pressable cursor_pointer" type="button"></button>
      </div>
    </div>
  `;

  const video = document.getElementById(videoId) as HTMLVideoElement;
  configureVideo(video, { src });
  return video;
}

async function flushPromises(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function setupBrowserMocks(): void {
  pictureInPictureElement = null;
  capturedCanvas = null;

  requestFrameMock = vi.fn();
  stopTrackMock = vi.fn();
  const mockTrack = {
    requestFrame: requestFrameMock,
    stop: stopTrackMock,
  } as unknown as MediaStreamTrack & { requestFrame: () => void };
  const mockStream = new MediaStream();
  Object.defineProperty(mockStream, 'getVideoTracks', {
    value: vi.fn(() => [mockTrack]),
    configurable: true,
  });
  Object.defineProperty(mockStream, 'getTracks', {
    value: vi.fn(() => [mockTrack]),
    configurable: true,
  });

  captureStreamMock = vi.fn(function (this: HTMLCanvasElement) {
    capturedCanvas = this;
    return mockStream;
  });

  drawImageMock = vi.fn();
  fillRectMock = vi.fn();
  const mockContext = {
    fillStyle: '',
    fillRect: fillRectMock,
    drawImage: drawImageMock,
  } as unknown as CanvasRenderingContext2D;

  requestPictureInPictureMock = vi.fn(function (this: HTMLVideoElement) {
    pictureInPictureElement = this;
    return Promise.resolve({} as PictureInPictureWindow);
  });
  exitPictureInPictureMock = vi.fn(() => {
    const element = pictureInPictureElement;
    pictureInPictureElement = null;
    element?.dispatchEvent(new Event('leavepictureinpicture'));
    return Promise.resolve();
  });
  playMock = vi.fn(() => Promise.resolve());
  pauseMock = vi.fn();

  Object.defineProperty(document, 'pictureInPictureEnabled', {
    value: true,
    configurable: true,
  });
  Object.defineProperty(document, 'pictureInPictureElement', {
    get: () => pictureInPictureElement,
    configurable: true,
  });
  Object.defineProperty(document, 'exitPictureInPicture', {
    value: exitPictureInPictureMock,
    configurable: true,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'requestPictureInPicture', {
    value: requestPictureInPictureMock,
    configurable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    value: playMock,
    configurable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    value: pauseMock,
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
    value: captureStreamMock,
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: vi.fn((contextId: string) => (contextId === '2d' ? mockContext : null)),
    configurable: true,
  });

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

describe('pictureInPicture', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    document.body.innerHTML = '';
    setupBrowserMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const module = await import('./pictureInPicture');
    apply = module.apply;
  });

  afterEach(() => {
    apply?.(false);
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    pictureInPictureElement = null;
  });

  describe('ボタン追加', () => {
    it('watchページでは全画面ボタンの前にPiPボタンを追加する', () => {
      setupLocationMock('/watch/sm9');
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(PIP_BUTTON_ID);
      const fullscreenButton = document.querySelector('[aria-label="全画面表示する"]');

      expect(button).not.toBeNull();
      expect(button?.nextElementSibling).toBe(fullscreenButton);
      expect(button?.getAttribute('aria-label')).toBe('Picture-in-Picture');
    });

    it('watchページ以外ではPiPボタンを追加しない', () => {
      setupLocationMock('/video_top');
      createNiconicoPlayerDOM();

      apply(true);

      expect(document.getElementById(PIP_BUTTON_ID)).toBeNull();
    });
  });

  describe('動画選択', () => {
    it('readyStateが高い古い動画より現在のvideo-content動画を優先する', async () => {
      setupLocationMock('/watch/sm9');
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div>
            <video id="old-video"></video>
            <video id="current-video" data-name="video-content"></video>
            <div data-name="comment"><canvas width="1366" height="768"></canvas></div>
            <div class="pos_relative d_flex ai_center gap_base mt_x0_5 h_x5">
              <button aria-label="全画面表示する" class="Pressable cursor_pointer" type="button"></button>
            </div>
          </div>
        </div>
      `;

      const oldVideo = document.getElementById('old-video') as HTMLVideoElement;
      const currentVideo = document.getElementById('current-video') as HTMLVideoElement;
      configureVideo(oldVideo, {
        src: 'blob:https://www.nicovideo.jp/previous-video',
        readyState: 4,
        paused: true,
        rectWidth: 0,
        rectHeight: 0,
      });
      configureVideo(currentVideo, {
        src: 'blob:https://www.nicovideo.jp/current-video',
        readyState: 2,
        paused: false,
        rectWidth: 873,
        rectHeight: 491,
      });

      apply(true);
      document.getElementById(PIP_BUTTON_ID)?.click();
      await flushPromises();

      expect(requestPictureInPictureMock).toHaveBeenCalledTimes(1);
      expect(currentVideo.style.visibility).toBe('hidden');
      expect(oldVideo.style.visibility).toBe('');
    });
  });

  describe('PiP開始と復元', () => {
    it('アップスケールCanvasがある場合はそれをPiPソースとして隠し、元動画は隠さない', async () => {
      setupLocationMock('/watch/sm9');
      const { mainVideo, commentCanvas } = createNiconicoPlayerDOM();
      const upscaledCanvas = document.createElement('canvas');
      upscaledCanvas.id = UPSCALED_CANVAS_ID;
      upscaledCanvas.width = 1280;
      upscaledCanvas.height = 720;
      mainVideo?.parentElement?.insertBefore(upscaledCanvas, mainVideo.nextSibling);

      apply(true);
      document.getElementById(PIP_BUTTON_ID)?.click();
      await flushPromises();

      expect(capturedCanvas?.width).toBe(1280);
      expect(capturedCanvas?.height).toBe(720);
      expect(upscaledCanvas.style.visibility).toBe('hidden');
      expect(mainVideo?.style.visibility).toBe('');
      expect(commentCanvas?.style.visibility).toBe('hidden');

      await document.exitPictureInPicture();

      expect(upscaledCanvas.style.visibility).toBe('');
      expect(commentCanvas?.style.visibility).toBe('');
      expect(stopTrackMock).toHaveBeenCalled();
    });

    it('コメントCanvasが一時的に無くても動画のみでPiPを開始できる', async () => {
      setupLocationMock('/watch/sm9');
      const { mainVideo } = createNiconicoPlayerDOM({ hasCommentCanvas: false });

      apply(true);
      document.getElementById(PIP_BUTTON_ID)?.click();
      await flushPromises();

      expect(requestPictureInPictureMock).toHaveBeenCalledTimes(1);
      expect(mainVideo?.style.visibility).toBe('hidden');
    });
  });

  describe('PiP中のDOM差し替え', () => {
    it('プレイヤーが差し替わったらPiPソースを新しい動画へ再接続する', async () => {
      setupLocationMock('/watch/sm9');
      const { mainVideo: oldVideo } = createNiconicoPlayerDOM({
        mainVideoOptions: { src: 'blob:https://www.nicovideo.jp/old-video' },
      });

      apply(true);
      document.getElementById(PIP_BUTTON_ID)?.click();
      await flushPromises();
      expect(oldVideo?.style.visibility).toBe('hidden');

      const newVideo = createPlayerContentWithVideo(
        'new-video',
        'blob:https://www.nicovideo.jp/new-video',
      );

      await flushPromises();
      await vi.advanceTimersByTimeAsync(100);
      await flushPromises();

      expect(oldVideo?.style.visibility).toBe('');
      expect(newVideo.style.visibility).toBe('hidden');
      expect(document.getElementById(PIP_BUTTON_ID)).not.toBeNull();
      expect(drawImageMock).toHaveBeenCalledWith(newVideo, 0, 0, 640, 360, 0, 0, 640, 360);
    });
  });

  describe('再生/一時停止の同期', () => {
    async function startPiPForSync(): Promise<{
      mainVideo: HTMLVideoElement;
      pipVideo: HTMLVideoElement;
    }> {
      setupLocationMock('/watch/sm9');
      const { mainVideo } = createNiconicoPlayerDOM();
      apply(true);
      document.getElementById(PIP_BUTTON_ID)?.click();
      await flushPromises();
      const pipVideo = document.getElementById(PIP_VIDEO_ID) as HTMLVideoElement;
      expect(mainVideo).not.toBeNull();
      expect(pipVideo).not.toBeNull();
      return { mainVideo: mainVideo as HTMLVideoElement, pipVideo };
    }

    it('PiPウィンドウで一時停止すると元動画も一時停止する', async () => {
      const { mainVideo, pipVideo } = await startPiPForSync();
      // 元動画は再生中（paused:false）。PiP側のpauseで元動画のpauseが呼ばれる。
      const mainPause = vi.fn();
      Object.defineProperty(mainVideo, 'pause', { value: mainPause, configurable: true });

      pipVideo.dispatchEvent(new Event('pause'));

      expect(mainPause).toHaveBeenCalledTimes(1);
    });

    it('PiPウィンドウで再生すると元動画も再生する', async () => {
      const { mainVideo, pipVideo } = await startPiPForSync();
      // 元動画を一時停止状態にしてからPiP側のplayで元動画のplayが呼ばれることを確認
      Object.defineProperty(mainVideo, 'paused', { value: true, configurable: true });
      const mainPlay = vi.fn(() => Promise.resolve());
      Object.defineProperty(mainVideo, 'play', { value: mainPlay, configurable: true });

      pipVideo.dispatchEvent(new Event('play'));

      expect(mainPlay).toHaveBeenCalledTimes(1);
    });

    it('元動画を一時停止するとPiPウィンドウも一時停止する', async () => {
      const { mainVideo, pipVideo } = await startPiPForSync();
      Object.defineProperty(pipVideo, 'paused', { value: false, configurable: true });
      const pipPause = vi.fn();
      Object.defineProperty(pipVideo, 'pause', { value: pipPause, configurable: true });

      mainVideo.dispatchEvent(new Event('pause'));

      expect(pipPause).toHaveBeenCalledTimes(1);
    });

    it('差し替えで切り離された旧動画のpauseはPiPに伝播しない', async () => {
      const { mainVideo, pipVideo } = await startPiPForSync();
      Object.defineProperty(pipVideo, 'paused', { value: false, configurable: true });
      const pipPause = vi.fn();
      Object.defineProperty(pipVideo, 'pause', { value: pipPause, configurable: true });
      // 旧動画がDOMから切り離された状態を模擬
      mainVideo.remove();

      mainVideo.dispatchEvent(new Event('pause'));

      expect(pipPause).not.toHaveBeenCalled();
    });

    it('PiP終了時に元動画を一時停止しない（ページ側で再生を継続できる）', async () => {
      const { mainVideo } = await startPiPForSync();
      const mainPause = vi.fn();
      Object.defineProperty(mainVideo, 'pause', { value: mainPause, configurable: true });

      await document.exitPictureInPicture();
      await flushPromises();

      expect(mainPause).not.toHaveBeenCalled();
    });
  });

  describe('アスペクト比に応じた合成', () => {
    it('4:3動画ではコメント比率(16:9)に合わせて動画をピラーボックス合成する', async () => {
      setupLocationMock('/watch/sm9');
      const { mainVideo, commentCanvas } = createNiconicoPlayerDOM({
        mainVideoOptions: { width: 480, height: 360 },
      });

      apply(true);
      document.getElementById(PIP_BUTTON_ID)?.click();
      await flushPromises();

      // 合成キャンバスはコメント比率(1366/768≒16:9)・高さ360基準で 640x360
      expect(capturedCanvas?.width).toBe(640);
      expect(capturedCanvas?.height).toBe(360);
      // 動画は左右ピラーボックスで中央(x=80)に等倍描画される
      expect(drawImageMock).toHaveBeenCalledWith(mainVideo, 0, 0, 480, 360, 80, 0, 480, 360);
      // コメントは合成キャンバス全体に行き渡る
      expect(commentCanvas).not.toBeNull();
    });

    it('16:9動画ではコメント比率と一致するため動画解像度のまま合成する', async () => {
      setupLocationMock('/watch/sm9');
      const { mainVideo } = createNiconicoPlayerDOM({
        mainVideoOptions: { width: 1280, height: 720 },
      });

      apply(true);
      document.getElementById(PIP_BUTTON_ID)?.click();
      await flushPromises();

      // 1280/720 と 1366/768 はASPECT_EPSILON内なのでピラーボックスせず原寸
      expect(capturedCanvas?.width).toBe(1280);
      expect(capturedCanvas?.height).toBe(720);
      expect(drawImageMock).toHaveBeenCalledWith(mainVideo, 0, 0, 1280, 720, 0, 0, 1280, 720);
    });
  });
});
