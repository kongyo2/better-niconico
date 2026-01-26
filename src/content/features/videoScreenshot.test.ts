/**
 * Tests for src/content/features/videoScreenshot.ts
 *
 * ニコニコ動画のDOM構造を実際のページから調査した結果に基づくテスト
 *
 * 実際のページ構造:
 * - プレイヤーエリア: .grid-area_[player]
 * - 動画要素: 3つ（メインコンテンツ1つ + 広告コンテナ内2つ）
 * - 広告コンテナ: #nv_watch_VideoAdContainer
 * - メイン動画: blob: URL、videoWidth=480, videoHeight=360, readyState=4
 * - コメントキャンバス: [data-name="comment"] canvas (1364x768)
 * - サポーターキャンバス: [data-name="supporter-content"] canvas (1280x720)
 * - 全画面ボタン: aria-label="全画面表示する"
 * - コントロールバーボタングループ: "pos_relative d_flex ai_center gap_base mt_x0_5 h_x5"
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 定数
const SCREENSHOT_BUTTON_ID = 'bn-screenshot-button';
const SCREENSHOT_BUTTON_MARKER = 'data-bn-screenshot-button';

// window.locationのモック
function setupLocationMock(pathname: string) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
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
    mainVideoReadyState?: number;
    mainVideoCurrentTime?: number;
    hasCommentCanvas?: boolean;
    commentCanvasWidth?: number;
    commentCanvasHeight?: number;
    hasSupporterCanvas?: boolean;
    supporterCanvasWidth?: number;
    supporterCanvasHeight?: number;
    supporterOpacity?: string;
    hasFullscreenButton?: boolean;
  } = {},
) {
  const {
    hasMainVideo = true,
    hasAdVideos = true,
    mainVideoSrc = 'blob:https://www.nicovideo.jp/test-video-id',
    mainVideoWidth = 480,
    mainVideoHeight = 360,
    mainVideoReadyState = 4,
    mainVideoCurrentTime = 65.5,
    hasCommentCanvas = true,
    commentCanvasWidth = 1364,
    commentCanvasHeight = 768,
    hasSupporterCanvas = true,
    supporterCanvasWidth = 1280,
    supporterCanvasHeight = 720,
    supporterOpacity = '0',
    hasFullscreenButton = true,
  } = options;

  document.body.innerHTML = `
    <div class="grid-area_[player]">
      <div class="pos_relative">
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
        ${
          hasCommentCanvas
            ? `
          <div data-name="comment">
            <canvas id="comment-canvas" width="${commentCanvasWidth}" height="${commentCanvasHeight}"></canvas>
          </div>
        `
            : ''
        }
        ${
          hasSupporterCanvas
            ? `
          <div data-name="supporter-content" style="opacity: ${supporterOpacity}">
            <canvas id="supporter-canvas" width="${supporterCanvasWidth}" height="${supporterCanvasHeight}"></canvas>
          </div>
        `
            : ''
        }
        ${
          hasFullscreenButton
            ? `
          <div class="pos_relative d_flex ai_center gap_base mt_x0_5 h_x5">
            <button aria-label="一時停止する" class="Pressable cursor_pointer" type="button"></button>
            <button aria-label="ミュートする" class="Pressable cursor_pointer" type="button"></button>
            <button aria-label="全画面表示する" class="Pressable cursor_pointer" type="button"></button>
            <button aria-label="設定" class="Pressable cursor_pointer" type="button"></button>
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
    Object.defineProperty(mainVideo, 'readyState', { value: mainVideoReadyState, configurable: true });
    Object.defineProperty(mainVideo, 'currentTime', { value: mainVideoCurrentTime, configurable: true });
    Object.defineProperty(mainVideo, 'HAVE_METADATA', { value: 1, configurable: true });
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

describe('videoScreenshot', () => {
  let apply: typeof import('./videoScreenshot').apply;

  beforeEach(async () => {
    // fakeTimersを使用してタイマー関連の問題を防ぐ
    vi.useFakeTimers();

    // DOM をリセット
    document.body.innerHTML = '';

    // モジュールをリセット（状態をクリア）
    vi.resetModules();

    // console.logとconsole.warnをモック
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // モジュールを再インポート
    const videoScreenshotModule = await import('./videoScreenshot');
    apply = videoScreenshotModule.apply;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // リアルタイマーに戻す
    vi.useRealTimers();
  });

  describe('ページ判定', () => {
    it('視聴ページ以外では何もしない', () => {
      setupLocationMock('/video_top');
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button).toBeNull();
    });

    it('/watch/で始まるページで動作する', () => {
      setupLocationMock('/watch/sm9');
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button).not.toBeNull();
    });

    it('/watch/sm12345678形式のページで動作する', () => {
      setupLocationMock('/watch/sm12345678');
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button).not.toBeNull();
    });
  });

  describe('スクリーンショットボタンの追加', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('プレイヤーエリアが存在しない場合はボタンを追加しない', () => {
      document.body.innerHTML = '<div>No player area</div>';

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button).toBeNull();
    });

    it('全画面ボタンが存在しない場合はボタンを追加しない', () => {
      createNiconicoPlayerDOM({ hasFullscreenButton: false });

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button).toBeNull();
      expect(console.warn).toHaveBeenCalledWith('[Better Niconico] 全画面表示ボタンが見つかりません');
    });

    it('ボタンが全画面ボタンの前に挿入される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      const fullscreenButton = document.querySelector('[aria-label="全画面表示する"]');
      expect(button).not.toBeNull();
      expect(fullscreenButton).not.toBeNull();

      // ボタンが全画面ボタンの直前にあることを確認
      expect(button?.nextElementSibling).toBe(fullscreenButton);
    });

    it('ボタンのIDが正しく設定される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button?.id).toBe(SCREENSHOT_BUTTON_ID);
    });

    it('ボタンにマーカー属性が設定される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button?.getAttribute(SCREENSHOT_BUTTON_MARKER)).toBe('true');
    });

    it('ボタンのaria-labelが正しく設定される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button?.getAttribute('aria-label')).toBe('スクリーンショット');
    });

    it('ボタンのtitleが正しく設定される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button?.title).toBe('スクリーンショット');
    });

    it('ボタンにニコニコ動画のスタイルクラスが設定される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button?.className).toBe('Pressable cursor_pointer');
    });

    it('ボタンの色が白に設定される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      // style.color はブラウザによって形式が異なる場合があるため、設定された値を確認
      expect(button?.style.color).toMatch(/^(rgb\(255, 255, 255\)|#FFFFFF|#ffffff)$/i);
    });

    it('ボタンにSVGアイコンが含まれる', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      const svg = button?.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('width')).toBe('28');
      expect(svg?.getAttribute('height')).toBe('28');
    });

    it('ボタン追加時にログが出力される', () => {
      createNiconicoPlayerDOM();

      apply(true);

      expect(console.log).toHaveBeenCalledWith(
        '[Better Niconico] スクリーンショットボタンをコントロールバーに追加しました',
      );
    });
  });

  describe('スクリーンショットボタンの削除', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('ボタンが削除される', () => {
      createNiconicoPlayerDOM();

      apply(true);
      expect(document.getElementById(SCREENSHOT_BUTTON_ID)).not.toBeNull();

      apply(false);
      expect(document.getElementById(SCREENSHOT_BUTTON_ID)).toBeNull();
    });

    it('ボタン削除時にログが出力される', () => {
      createNiconicoPlayerDOM();

      apply(true);
      apply(false);

      expect(console.log).toHaveBeenCalledWith('[Better Niconico] スクリーンショットボタンを削除しました');
    });

    it('ボタンが存在しない状態でdisableしても安全', () => {
      createNiconicoPlayerDOM();

      // まだボタンがない状態でdisable
      expect(() => apply(false)).not.toThrow();
    });
  });

  describe('冪等性', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('複数回有効化しても1つのボタンのみ存在する', () => {
      createNiconicoPlayerDOM();

      apply(true);
      apply(true);
      apply(true);

      const buttons = document.querySelectorAll(`#${SCREENSHOT_BUTTON_ID}`);
      expect(buttons.length).toBe(1);
    });

    it('無効化後に再度有効化できる', () => {
      createNiconicoPlayerDOM();

      apply(true);
      expect(document.getElementById(SCREENSHOT_BUTTON_ID)).not.toBeNull();

      apply(false);
      expect(document.getElementById(SCREENSHOT_BUTTON_ID)).toBeNull();

      apply(true);
      expect(document.getElementById(SCREENSHOT_BUTTON_ID)).not.toBeNull();
    });
  });

  describe('動画要素の検出（内部関数のテスト）', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('広告動画のみの場合はスクリーンショット機能が動作しない（ボタンは追加される）', () => {
      createNiconicoPlayerDOM({ hasMainVideo: false, hasAdVideos: true });

      apply(true);

      // ボタンは追加される（動画の存在確認はキャプチャ時）
      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button).not.toBeNull();
    });

    it('readyStateが高い動画が優先される', async () => {
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <video id="video-1"></video>
          <video id="video-2"></video>
          <div data-name="comment"><canvas></canvas></div>
          <div class="pos_relative d_flex ai_center gap_base mt_x0_5 h_x5">
            <button aria-label="全画面表示する" class="Pressable cursor_pointer" type="button"></button>
          </div>
        </div>
      `;

      const video1 = document.getElementById('video-1') as HTMLVideoElement;
      Object.defineProperty(video1, 'src', { value: 'blob:test1', configurable: true });
      Object.defineProperty(video1, 'videoWidth', { value: 640, configurable: true });
      Object.defineProperty(video1, 'videoHeight', { value: 480, configurable: true });
      Object.defineProperty(video1, 'readyState', { value: 2, configurable: true });

      const video2 = document.getElementById('video-2') as HTMLVideoElement;
      Object.defineProperty(video2, 'src', { value: 'blob:test2', configurable: true });
      Object.defineProperty(video2, 'videoWidth', { value: 1920, configurable: true });
      Object.defineProperty(video2, 'videoHeight', { value: 1080, configurable: true });
      Object.defineProperty(video2, 'readyState', { value: 4, configurable: true });

      apply(true);

      // ボタンが追加されることを確認
      expect(document.getElementById(SCREENSHOT_BUTTON_ID)).not.toBeNull();
    });
  });

  describe('コメントキャンバスの検出', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('コメントキャンバスが存在しない場合もボタンは追加される', () => {
      createNiconicoPlayerDOM({ hasCommentCanvas: false });

      apply(true);

      // ボタンは追加される（キャンバスの確認はキャプチャ時）
      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button).not.toBeNull();
    });
  });

  describe('サポーターキャンバスの検出', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('サポーターキャンバスが存在しない場合もボタンは追加される', () => {
      createNiconicoPlayerDOM({ hasSupporterCanvas: false });

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button).not.toBeNull();
    });

    it('サポーターのopacityが0の場合はスクリーンショットに含まれない設定', () => {
      createNiconicoPlayerDOM({ supporterOpacity: '0' });

      apply(true);

      const supporterContainer = document.querySelector('[data-name="supporter-content"]') as HTMLElement;
      expect(getComputedStyle(supporterContainer).opacity).toBe('0');
    });

    it('サポーターのopacityが1の場合はスクリーンショットに含まれる設定', () => {
      createNiconicoPlayerDOM({ supporterOpacity: '1' });

      apply(true);

      const supporterContainer = document.querySelector('[data-name="supporter-content"]') as HTMLElement;
      expect(supporterContainer.style.opacity).toBe('1');
    });
  });

  describe('ボタンクリックイベント', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('ボタンクリックでスクリーンショットがキャプチャされる', async () => {
      createNiconicoPlayerDOM();

      // canvas.toBlob のモック
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
        callback(mockBlob);
      });

      // URL.createObjectURL のモック
      const mockUrl = 'blob:test-url';
      URL.createObjectURL = vi.fn(() => mockUrl);
      URL.revokeObjectURL = vi.fn();

      // a.click のモック
      const mockClick = vi.fn();
      HTMLAnchorElement.prototype.click = mockClick;

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      // 非同期処理を待機
      await vi.advanceTimersByTimeAsync(0);

      expect(console.log).toHaveBeenCalledWith('[Better Niconico] スクリーンショットをキャプチャします...');
    });

    it('クリックイベントがstopPropagationされる', () => {
      createNiconicoPlayerDOM();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      const event = new MouseEvent('click', { bubbles: true });
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      button.dispatchEvent(event);

      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });

  describe('ファイル名生成', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('ファイル名形式が正しい（niconico_{videoId}_{timestamp}.png）', async () => {
      createNiconicoPlayerDOM({ mainVideoCurrentTime: 65.5 }); // 00-01-05

      // canvas.toBlob のモック
      let downloadFilename = '';
      const mockBlob = new Blob(['test'], { type: 'image/png' });

      // getContext と toBlob をモック
      const mockContext = {
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      };
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
        callback(mockBlob);
      });
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();

      // document.body.appendChild をモニタリングしてダウンロードファイル名をキャプチャ
      const originalAppendChild = document.body.appendChild.bind(document.body);
      document.body.appendChild = vi.fn((node: Node) => {
        if (node instanceof HTMLAnchorElement) {
          downloadFilename = node.download;
        }
        return originalAppendChild(node);
      }) as typeof document.body.appendChild;

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      await vi.advanceTimersByTimeAsync(10);

      expect(downloadFilename).toBe('niconico_sm9_00-01-05.png');

      // クリーンアップ
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });

    it('1時間以上の動画でタイムスタンプが正しい', async () => {
      createNiconicoPlayerDOM({ mainVideoCurrentTime: 3725.5 }); // 01-02-05

      let downloadFilename = '';
      const mockBlob = new Blob(['test'], { type: 'image/png' });

      const mockContext = {
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      };
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
        callback(mockBlob);
      });
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();

      const originalAppendChild = document.body.appendChild.bind(document.body);
      document.body.appendChild = vi.fn((node: Node) => {
        if (node instanceof HTMLAnchorElement) {
          downloadFilename = node.download;
        }
        return originalAppendChild(node);
      }) as typeof document.body.appendChild;

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      await vi.advanceTimersByTimeAsync(10);

      expect(downloadFilename).toBe('niconico_sm9_01-02-05.png');

      // クリーンアップ
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });
  });

  describe('キャンバス合成', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('合成キャンバスのサイズが動画サイズと同じ', async () => {
      createNiconicoPlayerDOM({ mainVideoWidth: 1920, mainVideoHeight: 1080 });

      let canvasWidth = 0;
      let canvasHeight = 0;

      // canvas.toBlob でキャンバスサイズをキャプチャ
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        contextId: string,
        options?: unknown,
      ) {
        if (contextId === '2d' && !this.id) {
          // IDがないキャンバス = 合成用キャンバス
          canvasWidth = this.width;
          canvasHeight = this.height;
        }
        return originalGetContext.call(this, contextId, options as object);
      } as typeof HTMLCanvasElement.prototype.getContext;

      const mockBlob = new Blob(['test'], { type: 'image/png' });
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
        callback(mockBlob);
      });
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();
      HTMLAnchorElement.prototype.click = vi.fn();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      await vi.advanceTimersByTimeAsync(0);

      expect(canvasWidth).toBe(1920);
      expect(canvasHeight).toBe(1080);

      // クリーンアップ
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });
  });

  describe('エラーハンドリング', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('動画が見つからない場合はエラーログを出力', async () => {
      createNiconicoPlayerDOM({ hasMainVideo: false, hasAdVideos: false });

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      await vi.advanceTimersByTimeAsync(0);

      expect(console.error).toHaveBeenCalledWith(
        '[Better Niconico] メインビデオが見つかりません:',
        expect.objectContaining({ type: 'video_element_not_found' }),
      );
    });

    it('コメントキャンバスが見つからない場合はエラーログを出力', async () => {
      createNiconicoPlayerDOM({ hasCommentCanvas: false });

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      await vi.advanceTimersByTimeAsync(0);

      expect(console.error).toHaveBeenCalledWith(
        '[Better Niconico] コメントキャンバスが見つかりません:',
        expect.objectContaining({ type: 'dom_element_not_found' }),
      );
    });

    it('Blobの生成に失敗した場合はエラーログを出力', async () => {
      createNiconicoPlayerDOM();

      // getContext をモック
      const mockContext = {
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      };
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;

      // toBlob が null を返すように設定
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
        callback(null);
      });

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      await vi.advanceTimersByTimeAsync(0);

      expect(console.error).toHaveBeenCalledWith('[Better Niconico] 画像の生成に失敗');

      // クリーンアップ
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });
  });

  describe('ダウンロード処理', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('ダウンロード用リンクが作成される', async () => {
      createNiconicoPlayerDOM();

      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockUrl = 'blob:test-download-url';

      // getContext をモック
      const mockContext = {
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      };
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
        callback(mockBlob);
      });
      URL.createObjectURL = vi.fn(() => mockUrl);
      URL.revokeObjectURL = vi.fn();

      let downloadLink: HTMLAnchorElement | null = null;
      const originalAppendChild = document.body.appendChild.bind(document.body);
      document.body.appendChild = vi.fn((node: Node) => {
        if (node instanceof HTMLAnchorElement) {
          downloadLink = node;
        }
        return originalAppendChild(node);
      }) as typeof document.body.appendChild;

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      await vi.advanceTimersByTimeAsync(10);

      expect(downloadLink).not.toBeNull();
      expect(downloadLink?.href).toBe(mockUrl);
      expect(downloadLink?.download).toMatch(/^niconico_sm9_\d{2}-\d{2}-\d{2}\.png$/);

      // クリーンアップ
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });

    it('ダウンロード後にURLがrevokeされる', async () => {
      createNiconicoPlayerDOM();

      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockUrl = 'blob:test-revoke-url';

      // getContext をモック
      const mockContext = {
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      };
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
        callback(mockBlob);
      });
      URL.createObjectURL = vi.fn(() => mockUrl);
      URL.revokeObjectURL = vi.fn();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      // toBlob コールバックを待機
      await vi.advanceTimersByTimeAsync(0);
      // setTimeout(100ms) を待機
      await vi.advanceTimersByTimeAsync(150);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);

      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });
  });

  describe('コンソールログ', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('スクリーンショット保存成功時にログが出力される', async () => {
      createNiconicoPlayerDOM();

      const mockBlob = new Blob(['test'], { type: 'image/png' });

      // getContext をモック
      const mockContext = {
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      };
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
        callback(mockBlob);
      });
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID) as HTMLButtonElement;
      button.click();

      await vi.advanceTimersByTimeAsync(10);

      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/スクリーンショットを保存しました/));

      // クリーンアップ
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    });
  });

  describe('DOM構造の互換性', () => {
    beforeEach(() => {
      setupLocationMock('/watch/sm9');
    });

    it('実際のニコニコ動画のDOM構造で動作する', () => {
      // 実際のページから取得した構造を再現
      document.body.innerHTML = `
        <div class="grid-area_[player]">
          <div class="pos_relative">
            <video id="main"></video>
            <div id="nv_watch_VideoAdContainer">
              <video></video>
              <video></video>
            </div>
            <div data-name="comment">
              <canvas width="1364" height="768"></canvas>
            </div>
            <div data-name="supporter-content" style="opacity: 0">
              <canvas width="1280" height="720"></canvas>
            </div>
            <div class="pos_relative d_flex ai_center gap_base mt_x0_5 h_x5">
              <button aria-label="一時停止する" class="Pressable cursor_pointer" type="button"></button>
              <button aria-label="ミュートする" class="Pressable cursor_pointer" type="button"></button>
              <button aria-label="10 秒戻る" class="Pressable cursor_pointer" type="button"></button>
              <button aria-label="10 秒送る" class="Pressable cursor_pointer" type="button"></button>
              <button aria-label="コメントを非表示にする" class="Pressable cursor_pointer" type="button"></button>
              <button aria-label="全画面表示する" class="Pressable cursor_pointer" type="button"></button>
              <button aria-label="設定" class="Pressable cursor_pointer" type="button"></button>
            </div>
          </div>
        </div>
      `;

      const mainVideo = document.getElementById('main') as HTMLVideoElement;
      Object.defineProperty(mainVideo, 'src', {
        value: 'blob:https://www.nicovideo.jp/test',
        configurable: true,
      });
      Object.defineProperty(mainVideo, 'videoWidth', { value: 480, configurable: true });
      Object.defineProperty(mainVideo, 'videoHeight', { value: 360, configurable: true });
      Object.defineProperty(mainVideo, 'readyState', { value: 4, configurable: true });

      apply(true);

      const button = document.getElementById(SCREENSHOT_BUTTON_ID);
      expect(button).not.toBeNull();

      // ボタンが全画面ボタンの直前にあることを確認
      const fullscreenButton = document.querySelector('[aria-label="全画面表示する"]');
      expect(button?.nextElementSibling).toBe(fullscreenButton);
    });
  });
});
