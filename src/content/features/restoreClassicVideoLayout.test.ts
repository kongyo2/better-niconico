/**
 * Tests for src/content/features/restoreClassicVideoLayout.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

const LAYOUT_MARKER = 'data-bn-layout';
const BOTTOM_CONTAINER_ID = 'bn-bottom-sections';

describe('restoreClassicVideoLayout', () => {
  let apply: typeof import('./restoreClassicVideoLayout').apply;
  let consoleLogSpy: MockInstance;
  // Track fullscreenchange event listeners for cleanup
  const fullscreenListeners: EventListener[] = [];
  let originalAddEventListener: typeof document.addEventListener;

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = '';

    // Mock console.log
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Mock watch page
    vi.stubGlobal('location', {
      pathname: '/watch/sm12345',
      href: 'https://www.nicovideo.jp/watch/sm12345',
    });

    // Mock fullscreen API
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    });

    // Track fullscreenchange event listeners for cleanup
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

    // Reset module state by re-importing
    vi.resetModules();
    const module = await import('./restoreClassicVideoLayout');
    apply = module.apply;
  });

  afterEach(() => {
    // Remove all tracked fullscreenchange listeners
    fullscreenListeners.forEach((listener) => {
      document.removeEventListener('fullscreenchange', listener);
    });
    fullscreenListeners.length = 0;

    // Restore original addEventListener
    if (originalAddEventListener) {
      document.addEventListener = originalAddEventListener;
    }

    consoleLogSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  describe('apply with enabled=true (classic layout)', () => {
    it('should not apply when not on watch page', () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });

      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBeNull();
    });

    it('should not apply when in fullscreen mode', () => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).not.toBe('classic');
    });

    it('should not apply when player area is missing', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[bottom]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      expect(() => apply(true)).not.toThrow();
    });

    it('should not apply when bottom area is missing', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      expect(() => apply(true)).not.toThrow();
    });

    it('should not apply when detail info section is missing', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>Other Section</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBeNull();
    });

    it('should apply classic layout when all conditions met', () => {
      document.body.innerHTML = `
        <div class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div class="video-info">Video Info</div>
            <section><h1>動画の詳細情報</h1></section>
            <section><h1>ニコニ広告</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBe('classic');
    });

    it('should not re-apply when already in classic layout', () => {
      document.body.innerHTML = `
        <div class="parent-grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      // Should not throw or cause issues
      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBe('classic');
    });
  });

  describe('apply with enabled=false (default layout)', () => {
    it('should restore default layout', () => {
      document.body.innerHTML = `
        <div class="parent-grid" style="grid-template-areas: 'custom'">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(false);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBe('default');
    });

    it('should not change when already in default layout', () => {
      document.body.innerHTML = `
        <div class="parent-grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="default"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="default"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(false);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBe('default');
    });

    it('should not change when no marker exists', () => {
      document.body.innerHTML = `
        <div class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(false);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).toBeNull();
    });
  });

  describe('fullscreen detection', () => {
    it('should detect fullscreen via Fullscreen API', () => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.createElement('div'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).not.toBe('classic');
    });

    it('should detect fullscreen via DOM element', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]">
            <div class="w_[100dvw] h_[100dvh]">Fullscreen element</div>
          </div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </div>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea?.getAttribute(LAYOUT_MARKER)).not.toBe('classic');
    });
  });

  describe('realistic DOM structure from actual site', () => {
    it('should apply classic layout with realistic DOM structure', () => {
      // 実際のニコニコ動画のDOM構造を再現（2024年12月時点）
      // bottomAreaの子要素: タイトル、タグ、詳細情報、親子作品、ニコニ広告、フィードバック、sticky要素
      document.body.innerHTML = `
        <section class="d_grid grid-template-areas_[_'player_sidebar'_'bottom_sidebar'_'bottom_sidebar'_] grid-tc_[var(--watch-player-width)_var(--watch-sidebar-width)] grid-tr_[min-content_min-content_1fr]">
          <div class="grid-area_[player]">
            <div class="PlayerPresenter pos_relative">Player</div>
          </div>
          <div class="grid-area_[bottom] d_flex flex-d_column gap_x2">
            <div class="d_flex jc_space-between ai_flex-start gap_var(--watch-video-information-gap) w_100%">
              <h1>新・豪血寺一族 -煩悩解放 - レッツゴー！陰陽師</h1>
            </div>
            <div class="pos_relative d_flex flex-wrap_wrap gap_base">
              <span>陰陽師</span>
              <span>レッツゴー陰陽師</span>
            </div>
            <section class="bg-c_layer.surfaceHighEm bdr_m ov_hidden w_100% d_flex flex-d_column">
              <h1>動画の詳細情報</h1>
              <p>詳細情報コンテンツ</p>
            </section>
            <section class="bg-c_layer.surfaceHighEm bdr_m ov_hidden w_100% p_x3 d_flex flex-d_column gap_x2">
              <h1>この動画の親作品・子作品</h1>
            </section>
            <section class="bg-c_layer.surfaceHighEm bdr_m ov_hidden w_100% p_x3 d_flex flex-d_column gap_x2">
              <h1>ニコニ広告</h1>
            </section>
            <div class="d_flex jc_flex-end">視聴ページに関するフィードバック</div>
            <div class="pos_sticky top_[calc({sizes.commonHeader.inViewHeight}_+_{sizes.webHeader.height}_+_var(--watch-layout-gap-height))]"></div>
          </div>
          <div class="grid-area_[sidebar]">
            <div class="d_flex flex-d_column gap_x2">
              <h1>コメントリスト</h1>
            </div>
          </div>
        </section>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      const bottomArea = document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;
      const parent = playerArea.parentElement as HTMLElement;
      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID);

      // クラシックレイアウトが適用されている
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('classic');
      expect(bottomArea.getAttribute(LAYOUT_MARKER)).toBe('classic');

      // 下部コンテナが作成されている
      expect(bottomContainer).not.toBeNull();

      // グリッドスタイルが変更されている
      expect(parent.style.gridTemplateAreas).toContain('bn-bottom');
    });

    it('should move detail info section and subsequent sections to bottom container', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div id="title">タイトル</div>
            <div id="tags">タグ</div>
            <section id="detail-info"><h1>動画の詳細情報</h1></section>
            <section id="parent-child"><h1>この動画の親作品・子作品</h1></section>
            <section id="nicoad"><h1>ニコニ広告</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID);
      const bottomArea = document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;

      // 下部コンテナに3つのセクションが移動している
      expect(bottomContainer?.children.length).toBe(3);
      expect(bottomContainer?.querySelector('#detail-info')).not.toBeNull();
      expect(bottomContainer?.querySelector('#parent-child')).not.toBeNull();
      expect(bottomContainer?.querySelector('#nicoad')).not.toBeNull();

      // bottomAreaにはタイトルとタグのみ残っている
      expect(bottomArea.querySelector('#title')).not.toBeNull();
      expect(bottomArea.querySelector('#tags')).not.toBeNull();
      expect(bottomArea.querySelector('#detail-info')).toBeNull();
    });

    it('should remove grid Tailwind classes during classic layout', () => {
      document.body.innerHTML = `
        <section class="d_grid grid-tr_[min-content_min-content_1fr] grid-template-areas_[custom] grid-tc_[custom]">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      const parent = document.querySelector('.d_grid') as HTMLElement;

      // Tailwindクラスが削除されている
      expect(parent.classList.contains('grid-tr_[min-content_min-content_1fr]')).toBe(false);
      expect(parent.classList.contains('grid-template-areas_[custom]')).toBe(false);
      expect(parent.classList.contains('grid-tc_[custom]')).toBe(false);
    });

    it('should apply sidebar sticky styles', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      const sidebar = document.querySelector('.grid-area_\\[sidebar\\]') as HTMLElement;

      expect(sidebar.style.maxHeight).toBe('calc(100vh - 80px)');
      expect(sidebar.style.overflowY).toBe('auto');
      expect(sidebar.style.position).toBe('sticky');
      expect(sidebar.style.top).toBe('80px');
    });
  });

  describe('restoreDefaultLayout behavior', () => {
    it('should restore elements from bottom container to bottom area', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic">
            <div id="title">タイトル</div>
          </div>
          <div class="grid-area_[sidebar]"></div>
          <div id="${BOTTOM_CONTAINER_ID}">
            <section id="detail-info"><h1>動画の詳細情報</h1></section>
            <section id="nicoad"><h1>ニコニ広告</h1></section>
          </div>
        </section>
      `;

      apply(false);

      const bottomArea = document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;
      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID);

      // 下部コンテナは削除されている
      expect(bottomContainer).toBeNull();

      // 要素がbottomAreaに戻されている
      expect(bottomArea.querySelector('#detail-info')).not.toBeNull();
      expect(bottomArea.querySelector('#nicoad')).not.toBeNull();
    });

    it('should restore Tailwind classes when reverting to default', () => {
      document.body.innerHTML = `
        <section class="parent-grid d_grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic" style="align-self: start"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic" style="align-self: start"></div>
          <div class="grid-area_[sidebar]" style="max-height: calc(100vh - 80px); overflow-y: auto; position: sticky; top: 80px;"></div>
        </section>
      `;

      apply(false);

      const parent = document.querySelector('.d_grid') as HTMLElement;

      // Tailwindクラスが復元されている
      expect(parent.classList.contains('grid-tr_[min-content_min-content_1fr]')).toBe(true);
      expect(parent.classList.contains('grid-template-areas_[_"player_sidebar"_"bottom_sidebar"_"bottom_sidebar"_]')).toBe(true);
      expect(parent.classList.contains('grid-tc_[var(--watch-player-width)_var(--watch-sidebar-width)]')).toBe(true);
    });

    it('should reset sidebar styles when reverting to default', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[sidebar]" style="max-height: calc(100vh - 80px); overflow-y: auto; position: sticky; top: 80px;"></div>
        </section>
      `;

      apply(false);

      const sidebar = document.querySelector('.grid-area_\\[sidebar\\]') as HTMLElement;

      expect(sidebar.style.maxHeight).toBe('');
      expect(sidebar.style.overflowY).toBe('');
      expect(sidebar.style.position).toBe('');
      expect(sidebar.style.top).toBe('');
    });

    it('should clear inline grid styles when reverting to default', () => {
      document.body.innerHTML = `
        <section class="parent-grid" style="grid-template-areas: custom; grid-template-rows: auto; grid-template-columns: 1fr; align-items: start;">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(false);

      const parent = document.querySelector('.parent-grid') as HTMLElement;

      expect(parent.style.gridTemplateAreas).toBe('');
      expect(parent.style.gridTemplateRows).toBe('');
      expect(parent.style.gridTemplateColumns).toBe('');
      expect(parent.style.alignItems).toBe('');
    });
  });

  describe('fullscreenchange event handling', () => {
    it('should restore default layout when entering fullscreen', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      // まずクラシックレイアウトを適用
      apply(true);
      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('classic');

      // 全画面に入る
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });

      // fullscreenchangeイベントを発火
      document.dispatchEvent(new Event('fullscreenchange'));

      // デフォルトレイアウトに戻る
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('default');
    });

    it('should reapply classic layout when exiting fullscreen if enabled', async () => {
      vi.useFakeTimers();

      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      // クラシックレイアウトを適用（enabled=trueの状態を保持）
      apply(true);

      // 全画面に入る
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('default');

      // 全画面から抜ける
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      // 100ms待機（setTimeoutを進める）
      await vi.advanceTimersByTimeAsync(100);

      // クラシックレイアウトが再適用される
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('classic');

      vi.useRealTimers();
    });

    it('should not reapply classic layout when exiting fullscreen if disabled', async () => {
      vi.useFakeTimers();

      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      // 一度クラシックレイアウトを適用してからデフォルトに戻す
      apply(true);
      apply(false);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('default');

      // 全画面に入って抜ける
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      await vi.advanceTimersByTimeAsync(100);

      // enabled=falseなのでクラシックレイアウトは再適用されない
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('default');

      vi.useRealTimers();
    });
  });

  describe('toggle behavior', () => {
    it('should correctly toggle between classic and default layouts', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div id="title">タイトル</div>
            <section id="detail"><h1>動画の詳細情報</h1></section>
            <section id="nicoad"><h1>ニコニ広告</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;

      // 初期状態
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBeNull();

      // クラシックレイアウト
      apply(true);
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('classic');
      expect(document.getElementById(BOTTOM_CONTAINER_ID)).not.toBeNull();

      // デフォルトレイアウト
      apply(false);
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('default');
      expect(document.getElementById(BOTTOM_CONTAINER_ID)).toBeNull();

      // 再度クラシックレイアウト
      apply(true);
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('classic');
    });

    it('should handle rapid toggles correctly', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;

      // 連続してトグル
      apply(true);
      apply(true);
      apply(true);
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('classic');

      apply(false);
      apply(false);
      apply(false);
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('default');
    });
  });

  describe('edge cases', () => {
    it('should return early when elementsToMove is empty', () => {
      // 詳細情報セクションがbottomAreaの外にある場合
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div id="title">タイトル</div>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
        <section><h1>動画の詳細情報</h1></section>
      `;

      apply(true);

      // bottomContainerは作成されない（移動する要素がないため）
      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID);
      expect(bottomContainer).toBeNull();

      // マーカーも設定されない
      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBeNull();
    });

    it('should not restore default layout when not on watch page', () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });

      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(false);

      // マーカーは変更されない（視聴ページでないため早期リターン）
      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('classic');
    });

    it('should not restore default layout when required elements are missing', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      // bottomAreaがないため早期リターン
      expect(() => apply(false)).not.toThrow();
    });

    it('should handle missing sidebar gracefully', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
        </section>
      `;

      expect(() => apply(true)).not.toThrow();
    });

    it('should handle empty bottomArea children', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID);
      // 詳細情報セクションのみが移動される
      expect(bottomContainer?.children.length).toBe(1);
    });

    it('should handle h1 with null textContent', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1></h1></section>
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      // 最初のh1のtextContentをnullにする
      const firstH1 = document.querySelector('h1') as HTMLElement;
      Object.defineProperty(firstH1, 'textContent', {
        get: () => null,
        configurable: true,
      });

      expect(() => apply(true)).not.toThrow();

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      expect(playerArea.getAttribute(LAYOUT_MARKER)).toBe('classic');
    });

    it('should skip elements not currently in bottomArea during move', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div id="title">タイトル</div>
            <section id="detail"><h1>動画の詳細情報</h1></section>
            <section id="after-detail"><h1>詳細情報の後のセクション</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      // 詳細情報の後のセクションを事前に別の場所に移動
      const afterDetail = document.getElementById('after-detail') as HTMLElement;
      document.body.appendChild(afterDetail);

      apply(true);

      // bottomContainerにはdetailのみが移動される（after-detailはbottomAreaにないのでスキップ）
      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID);
      expect(bottomContainer?.children.length).toBe(1);
      expect(bottomContainer?.querySelector('#detail')).not.toBeNull();
      expect(bottomContainer?.querySelector('#after-detail')).toBeNull();
    });
  });

  describe('console logging', () => {
    it('should log message when classic layout is applied', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('動画情報を上部に移動しました'),
      );
    });

    it('should log message when default layout is restored', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(false);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('レイアウトを元に戻しました'),
      );
    });

    it('should log message when skipping due to fullscreen', () => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('全画面表示中のため'),
      );
    });

    it('should log message when fullscreen listener is set up', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('全画面表示イベントリスナーをセットアップしました'),
      );
    });
  });

  describe('bottom container reuse', () => {
    it('should reuse existing bottom container when already present', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div id="title">タイトル</div>
            <section id="detail"><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
          <div id="${BOTTOM_CONTAINER_ID}" data-bn-bottom-container="true" style="grid-area: bn-bottom;"></div>
        </section>
      `;

      apply(true);

      // コンテナが1つだけ存在する
      const containers = document.querySelectorAll(`#${BOTTOM_CONTAINER_ID}`);
      expect(containers.length).toBe(1);

      // 既存のコンテナが再利用されている
      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID);
      expect(bottomContainer?.querySelector('#detail')).not.toBeNull();
    });
  });

  describe('realistic DOM with all elements', () => {
    it('should move all elements after detail info including feedback and sticky elements', () => {
      // 実際のニコニコ動画の完全なDOM構造
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div id="title-area">タイトル</div>
            <div id="tags-area">タグ</div>
            <section id="detail-info"><h1>動画の詳細情報</h1></section>
            <section id="parent-child"><h1>この動画の親作品・子作品</h1></section>
            <section id="nicoad"><h1>ニコニ広告</h1></section>
            <div id="feedback" class="d_flex jc_flex-end">フィードバック</div>
            <div id="sticky-element" class="pos_sticky">sticky要素</div>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID);
      const bottomArea = document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;

      // 5つの要素が下部コンテナに移動（詳細情報、親子作品、ニコニ広告、フィードバック、sticky）
      expect(bottomContainer?.children.length).toBe(5);
      expect(bottomContainer?.querySelector('#detail-info')).not.toBeNull();
      expect(bottomContainer?.querySelector('#parent-child')).not.toBeNull();
      expect(bottomContainer?.querySelector('#nicoad')).not.toBeNull();
      expect(bottomContainer?.querySelector('#feedback')).not.toBeNull();
      expect(bottomContainer?.querySelector('#sticky-element')).not.toBeNull();

      // タイトルとタグのみがbottomAreaに残る
      expect(bottomArea.querySelector('#title-area')).not.toBeNull();
      expect(bottomArea.querySelector('#tags-area')).not.toBeNull();
      expect(bottomArea.querySelector('#detail-info')).toBeNull();
    });
  });

  describe('module state isolation', () => {
    it('should not have lingering fullscreen listeners from previous tests', async () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      // 最初の呼び出しでリスナーがセットアップされる
      apply(true);
      const setupCallCount = consoleLogSpy.mock.calls.filter(
        (call) => call[0]?.includes('全画面表示イベントリスナーをセットアップしました'),
      ).length;

      // 2回目の呼び出しではリスナーは再セットアップされない
      apply(true);
      const secondSetupCallCount = consoleLogSpy.mock.calls.filter(
        (call) => call[0]?.includes('全画面表示イベントリスナーをセットアップしました'),
      ).length;

      // セットアップは1回のみ
      expect(setupCallCount).toBe(1);
      expect(secondSetupCallCount).toBe(1);
    });
  });

  describe('grid styles', () => {
    it('should set correct grid template areas for classic layout', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      const parent = document.querySelector('.parent-grid') as HTMLElement;
      expect(parent.style.gridTemplateAreas).toBe('"bottom sidebar" "player sidebar" "bn-bottom sidebar"');
      expect(parent.style.gridTemplateRows).toBe('auto auto auto');
      expect(parent.style.gridTemplateColumns).toBe('var(--watch-player-width) var(--watch-sidebar-width)');
      expect(parent.style.alignItems).toBe('start');
    });

    it('should set align-self start on player and bottom areas', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
      const bottomArea = document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;
      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID) as HTMLElement;

      expect(playerArea.style.alignSelf).toBe('start');
      expect(bottomArea.style.alignSelf).toBe('start');
      expect(bottomContainer.style.alignSelf).toBe('start');
    });
  });

  describe('bottom container attributes', () => {
    it('should have correct attributes on bottom container', () => {
      document.body.innerHTML = `
        <section class="parent-grid">
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>
      `;

      apply(true);

      const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID) as HTMLElement;

      expect(bottomContainer.id).toBe(BOTTOM_CONTAINER_ID);
      expect(bottomContainer.getAttribute('data-bn-bottom-container')).toBe('true');
      expect(bottomContainer.style.gridArea).toBe('bn-bottom');
      expect(bottomContainer.className).toBe('d_flex flex-d_column gap_x2');
    });
  });
});
