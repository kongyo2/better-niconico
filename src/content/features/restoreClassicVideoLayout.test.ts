/**
 * Tests for src/content/features/restoreClassicVideoLayout.ts
 *
 * 新設計（実機調査 2026-06 を反映）:
 * - 構造が安定した「タイトル・タグ」だけを上部コンテナ(bn-top-sections)へ退避し、
 *   可変構造の「動画の詳細情報」以降はReact管理下のbottomAreaに残す。
 * - マーカーではなく実DOM状態で冪等に判定し、SPA遷移・構造変化に追従する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const LAYOUT_MARKER = 'data-bn-layout';
const TOP_CONTAINER_ID = 'bn-top-sections';
const LEGACY_BOTTOM_CONTAINER_ID = 'bn-bottom-sections';

/**
 * 実機調査(2026-06, sm9 等)で確認した視聴ページのDOM構造を再現する。
 * bottomArea直下の子: タイトル・タグ・詳細情報・(シリーズ)・親子作品・ニコニ広告・フィードバック・sticky広告
 */
function buildWatchDOM(options: { withSeries?: boolean } = {}): string {
  const series = options.withSeries
    ? '<div id="series-section" class="bdr_m ov_hidden"><div>シリーズ情報</div></div>'
    : '';
  return `
    <section class="d_grid grid-template-areas_[_'player_sidebar'_'bottom_sidebar'_'bottom_sidebar'_] grid-tc_[var(--watch-player-width)_var(--watch-sidebar-width)] grid-tr_[min-content_min-content_1fr] jc_center">
      <div class="grid-area_[player]"><div class="PlayerPresenter">Player</div></div>
      <div class="grid-area_[bottom] d_flex flex-d_column gap_x2">
        <div id="title-area" class="d_flex jc_space-between ai_flex-start w_100%"><h1>動画タイトル</h1></div>
        <div id="tags-area" class="pos_relative d_flex flex-wrap_wrap gap_base"><a>タグ1</a><a>タグ2</a></div>
        <section id="detail-info" class="bg-c_layer.surfaceHighEm bdr_m ov_hidden w_100% d_flex flex-d_column"><h1>動画の詳細情報</h1></section>
        ${series}
        <section id="parent-child" class="bg-c_layer.surfaceHighEm bdr_m ov_hidden w_100% p_x3"><h1>この動画の親作品・子作品</h1></section>
        <section id="nicoad" class="bg-c_layer.surfaceHighEm bdr_m ov_hidden w_100% p_x3"><h1>ニコニ広告</h1></section>
        <div id="feedback" class="d_flex jc_flex-end">フィードバック</div>
        <div id="sticky-ads" class="pos_sticky top_[calc(...)]">広告</div>
      </div>
      <div class="grid-area_[sidebar]"><div class="d_flex flex-d_column gap_x2"><h1>コメントリスト</h1></div></div>
    </section>
  `;
}

const getPlayer = () => document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
const getBottom = () => document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;
const getSidebar = () => document.querySelector('.grid-area_\\[sidebar\\]') as HTMLElement;
const getTopContainer = () => document.getElementById(TOP_CONTAINER_ID);

describe('restoreClassicVideoLayout', () => {
  let apply: typeof import('./restoreClassicVideoLayout').apply;
  const fullscreenListeners: EventListener[] = [];
  let originalAddEventListener: typeof document.addEventListener;

  beforeEach(async () => {
    document.body.innerHTML = '';

    vi.stubGlobal('location', {
      pathname: '/watch/sm12345',
      href: 'https://www.nicovideo.jp/watch/sm12345',
    });

    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    });

    // fullscreenchangeリスナーを追跡（テスト後のクリーンアップ・重複検出用）
    originalAddEventListener = document.addEventListener.bind(document);
    document.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      opts?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'fullscreenchange' && typeof listener === 'function') {
        fullscreenListeners.push(listener);
      }
      return originalAddEventListener(type, listener, opts);
    }) as typeof document.addEventListener;

    vi.resetModules();
    const module = await import('./restoreClassicVideoLayout');
    apply = module.apply;
  });

  afterEach(() => {
    fullscreenListeners.forEach((l) => document.removeEventListener('fullscreenchange', l));
    fullscreenListeners.length = 0;
    if (originalAddEventListener) {
      document.addEventListener = originalAddEventListener;
    }
    vi.unstubAllGlobals();
  });

  describe('apply(true): クラシックレイアウト適用', () => {
    it('視聴ページでなければ何もしない', () => {
      vi.stubGlobal('location', { pathname: '/video_top', href: 'https://www.nicovideo.jp/video_top' });
      document.body.innerHTML = buildWatchDOM();

      apply(true);

      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBeNull();
      expect(getTopContainer()).toBeNull();
    });

    it('全画面表示中は適用しない', () => {
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.body.innerHTML = buildWatchDOM();

      apply(true);

      expect(getPlayer().getAttribute(LAYOUT_MARKER)).not.toBe('classic');
      expect(getTopContainer()).toBeNull();
    });

    it('playerエリアが無くても例外を投げない', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[bottom]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>`;
      expect(() => apply(true)).not.toThrow();
    });

    it('bottomエリアが無くても例外を投げない', () => {
      document.body.innerHTML = `
        <div>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[sidebar]"></div>
        </div>`;
      expect(() => apply(true)).not.toThrow();
    });

    it('詳細情報セクションが無ければタイトル・タグを移動しない', () => {
      document.body.innerHTML = `
        <section>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div id="title-area"><h1>タイトル</h1></div>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>`;

      apply(true);

      // 移動対象（詳細情報の前の要素）を確定できないため退避コンテナは作られない
      expect(getTopContainer()).toBeNull();
      expect(getBottom().querySelector('#title-area')).not.toBeNull();
    });

    it('すべての条件が揃えばクラシックレイアウトを適用する', () => {
      document.body.innerHTML = buildWatchDOM();

      apply(true);

      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('classic');
      expect(getBottom().getAttribute(LAYOUT_MARKER)).toBe('classic');
      expect(getTopContainer()).not.toBeNull();
    });

    it('タイトル・タグだけを上部コンテナへ移動し、詳細情報以降はbottomAreaに残す', () => {
      document.body.innerHTML = buildWatchDOM();

      apply(true);

      const top = getTopContainer() as HTMLElement;
      const bottom = getBottom();

      // 上部コンテナ: タイトル・タグの2要素
      expect(top.children.length).toBe(2);
      expect(top.querySelector('#title-area')).not.toBeNull();
      expect(top.querySelector('#tags-area')).not.toBeNull();

      // bottomArea: 詳細情報以降が残る（先頭が詳細情報）
      expect(bottom.querySelector('#title-area')).toBeNull();
      expect(bottom.querySelector('#tags-area')).toBeNull();
      expect(bottom.querySelector('#detail-info')).not.toBeNull();
      expect(bottom.querySelector('#parent-child')).not.toBeNull();
      expect(bottom.querySelector('#nicoad')).not.toBeNull();
      expect(bottom.firstElementChild?.id).toBe('detail-info');
    });

    it('上部コンテナはタイトル・タグの順序を保持する', () => {
      document.body.innerHTML = buildWatchDOM();

      apply(true);

      const top = getTopContainer() as HTMLElement;
      expect(top.children[0].id).toBe('title-area');
      expect(top.children[1].id).toBe('tags-area');
    });

    it('上部コンテナに正しい属性とクラスが設定される', () => {
      document.body.innerHTML = buildWatchDOM();

      apply(true);

      const top = getTopContainer() as HTMLElement;
      expect(top.getAttribute('data-bn-top-container')).toBe('true');
      expect(top.style.gridArea).toBe('bn-top');
      expect(top.className).toBe('d_flex flex-d_column gap_x2');
    });
  });

  describe('グリッド・サイドバースタイル', () => {
    beforeEach(() => {
      document.body.innerHTML = buildWatchDOM();
      apply(true);
    });

    it('クラシック用のグリッドエリアを設定する', () => {
      const parent = getPlayer().parentElement as HTMLElement;
      expect(parent.style.gridTemplateAreas).toBe(
        '"bn-top sidebar" "player sidebar" "bottom sidebar"',
      );
      expect(parent.style.gridTemplateRows).toBe('auto auto auto');
      expect(parent.style.gridTemplateColumns).toBe(
        'var(--watch-player-width) var(--watch-sidebar-width)',
      );
      expect(parent.style.alignItems).toBe('start');
    });

    it('元のグリッド指定Tailwindクラスを除去する', () => {
      const parent = getPlayer().parentElement as HTMLElement;
      const hasGridClass = Array.from(parent.classList).some(
        (c) => c.includes('grid-tr_') || c.includes('grid-template-areas_') || c.includes('grid-tc_'),
      );
      expect(hasGridClass).toBe(false);
    });

    it('player・bottom・topにalign-self:startを設定する', () => {
      expect(getPlayer().style.alignSelf).toBe('start');
      expect(getBottom().style.alignSelf).toBe('start');
      expect((getTopContainer() as HTMLElement).style.alignSelf).toBe('start');
    });

    it('サイドバーをstickyにする（ヘッダー高さはCSS変数で動的算出、実機Chromeでcomputed=100pxを確認済み）', () => {
      const sidebar = getSidebar();
      expect(sidebar.style.position).toBe('sticky');
      expect(sidebar.style.overflowY).toBe('auto');
      // top/maxHeightはvar()入りcalc。happy-domはvar()を含むcalcを保持できず空文字になるため値自体は検証しない。
      // 仮に80pxハードコードへ逆戻りすると happy-dom はその値を保持するため、'80px'を含まないことで回帰を検出する。
      expect(sidebar.style.top).not.toContain('80px');
      expect(sidebar.style.maxHeight).not.toContain('80px');
    });
  });

  describe('冪等性と再適用', () => {
    it('連続で適用しても重複移動しない', () => {
      document.body.innerHTML = buildWatchDOM();

      apply(true);
      apply(true);
      apply(true);

      const top = getTopContainer() as HTMLElement;
      expect(top.children.length).toBe(2);
      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('classic');
    });

    it('既に退避済み（bottomArea先頭が詳細情報）なら移動を発生させない', () => {
      document.body.innerHTML = buildWatchDOM();
      apply(true);

      const bottomChildrenBefore = getBottom().children.length;
      apply(true);

      expect(getBottom().children.length).toBe(bottomChildrenBefore);
      expect((getTopContainer() as HTMLElement).children.length).toBe(2);
    });
  });

  describe('SPA遷移への追従', () => {
    it('Reactが要素を再利用するケース（中身だけ差し替え）では再適用で変化しない', () => {
      document.body.innerHTML = buildWatchDOM();
      apply(true);

      // 実機のReact再利用を模擬: タイトル・タグは上部コンテナに留まり中身が更新される
      const top = getTopContainer() as HTMLElement;
      top.querySelector('#title-area h1')!.textContent = '次の動画タイトル';

      // MutationObserver起点の再適用
      apply(true);

      expect((getTopContainer() as HTMLElement).children.length).toBe(2);
      expect(getBottom().firstElementChild?.id).toBe('detail-info');
      expect(getTopContainer()!.querySelector('#title-area h1')!.textContent).toBe('次の動画タイトル');
    });

    it('Reactが新しいタイトル・タグをbottomAreaに作り直すケースでは追従し、古い残骸を除去して重複させない', () => {
      document.body.innerHTML = buildWatchDOM();
      apply(true);

      // 作り直しを模擬: bottomArea先頭に新しいタイトル・タグを挿入（古い退避要素はそのまま残る）
      const bottom = getBottom();
      const newTags = document.createElement('div');
      newTags.id = 'tags-area-new';
      newTags.innerHTML = '<a>新タグ</a>';
      bottom.insertBefore(newTags, bottom.firstChild);
      const newTitle = document.createElement('div');
      newTitle.id = 'title-area-new';
      newTitle.innerHTML = '<h1>新動画タイトル</h1>';
      bottom.insertBefore(newTitle, bottom.firstChild);

      apply(true);

      const top = getTopContainer() as HTMLElement;
      // 新しいタイトル・タグのみが上部に入り、古い残骸は除去される（重複2要素のまま）
      expect(top.children.length).toBe(2);
      expect(top.querySelector('#title-area-new')).not.toBeNull();
      expect(top.querySelector('#tags-area-new')).not.toBeNull();
      expect(top.querySelector('#title-area')).toBeNull();
      // bottomArea先頭は詳細情報に戻る
      expect(getBottom().firstElementChild?.id).toBe('detail-info');
    });

    it('シリーズ有りの動画へ遷移してもタイトル・タグの退避に影響せず、シリーズはbottomAreaに残る', () => {
      // シリーズ無しで適用
      document.body.innerHTML = buildWatchDOM({ withSeries: false });
      apply(true);

      // シリーズ有り構造へ切り替え（bottomAreaの詳細情報以降が増える＝構造変化）を模擬
      const bottom = getBottom();
      const series = document.createElement('div');
      series.id = 'series-section';
      series.textContent = 'シリーズ情報';
      bottom.querySelector('#detail-info')!.after(series);

      apply(true);

      // タイトル・タグは上部のまま、シリーズは可変領域(bottomArea)に残る
      expect((getTopContainer() as HTMLElement).children.length).toBe(2);
      expect(getBottom().querySelector('#series-section')).not.toBeNull();
      expect(getBottom().querySelector('#detail-info')).not.toBeNull();
    });
  });

  describe('apply(false): デフォルトレイアウト復帰', () => {
    it('上部コンテナのタイトル・タグをbottomAreaの先頭へ戻し、コンテナを削除する', () => {
      document.body.innerHTML = buildWatchDOM();
      apply(true);
      apply(false);

      const bottom = getBottom();
      expect(getTopContainer()).toBeNull();
      expect(bottom.querySelector('#title-area')).not.toBeNull();
      expect(bottom.querySelector('#tags-area')).not.toBeNull();
      // 元の順序（タイトル→タグ→詳細情報）に戻る
      expect(bottom.children[0].id).toBe('title-area');
      expect(bottom.children[1].id).toBe('tags-area');
      expect(bottom.children[2].id).toBe('detail-info');
      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('default');
    });

    it('Tailwindクラスを復元しインラインスタイルをクリアする', () => {
      document.body.innerHTML = buildWatchDOM();
      apply(true);
      apply(false);

      const parent = getPlayer().parentElement as HTMLElement;
      expect(parent.classList.contains('grid-tr_[min-content_min-content_1fr]')).toBe(true);
      expect(
        parent.classList.contains(
          'grid-template-areas_[_"player_sidebar"_"bottom_sidebar"_"bottom_sidebar"_]',
        ),
      ).toBe(true);
      expect(
        parent.classList.contains('grid-tc_[var(--watch-player-width)_var(--watch-sidebar-width)]'),
      ).toBe(true);
      expect(parent.style.gridTemplateAreas).toBe('');
      expect(parent.style.gridTemplateRows).toBe('');
      expect(parent.style.gridTemplateColumns).toBe('');
      expect(parent.style.alignItems).toBe('');
    });

    it('サイドバーのスタイルをリセットする', () => {
      document.body.innerHTML = buildWatchDOM();
      apply(true);
      apply(false);

      const sidebar = getSidebar();
      expect(sidebar.style.maxHeight).toBe('');
      expect(sidebar.style.overflowY).toBe('');
      expect(sidebar.style.position).toBe('');
      expect(sidebar.style.top).toBe('');
    });

    it('既にデフォルト状態なら何もしない', () => {
      document.body.innerHTML = buildWatchDOM();

      apply(false);

      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBeNull();
      expect(getTopContainer()).toBeNull();
    });

    it('視聴ページでなければ復帰処理をしない', () => {
      document.body.innerHTML = buildWatchDOM();
      apply(true);

      vi.stubGlobal('location', { pathname: '/video_top', href: 'https://www.nicovideo.jp/video_top' });
      apply(false);

      // 視聴ページでないため早期リターン（マーカーはclassicのまま）
      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('classic');
    });
  });

  describe('旧実装(下部コンテナ方式)からのアップグレード', () => {
    it('残存する旧コンテナ(bn-bottom-sections)の中身をbottomAreaへ戻して除去する', () => {
      document.body.innerHTML = `
        <section class="d_grid">
          <div class="grid-area_[player]" ${LAYOUT_MARKER}="classic"></div>
          <div class="grid-area_[bottom]" ${LAYOUT_MARKER}="classic">
            <div id="title-area">タイトル</div>
          </div>
          <div class="grid-area_[sidebar]"></div>
          <div id="${LEGACY_BOTTOM_CONTAINER_ID}" data-bn-bottom-container="true">
            <section id="detail-info"><h1>動画の詳細情報</h1></section>
            <section id="nicoad"><h1>ニコニ広告</h1></section>
          </div>
        </section>`;

      apply(false);

      expect(document.getElementById(LEGACY_BOTTOM_CONTAINER_ID)).toBeNull();
      const bottom = getBottom();
      expect(bottom.querySelector('#detail-info')).not.toBeNull();
      expect(bottom.querySelector('#nicoad')).not.toBeNull();
    });
  });

  describe('getDetailInfoSectionの誤検出防止', () => {
    it('bottomArea外に同名見出しがあっても誤って反応しない', () => {
      document.body.innerHTML = `
        <section>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div id="title-area"><h1>タイトル</h1></div>
          </div>
          <div class="grid-area_[sidebar]">
            <section><h1>動画の詳細情報</h1></section>
          </div>
        </section>`;

      apply(true);

      // 詳細情報はサイドバー内なので、bottomAreaでは検出されず移動は起きない
      expect(getTopContainer()).toBeNull();
      expect(getBottom().querySelector('#title-area')).not.toBeNull();
    });
  });

  describe('全画面表示イベント処理', () => {
    it('全画面に入るとデフォルトへ戻す', () => {
      document.body.innerHTML = buildWatchDOM();
      apply(true);
      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('classic');

      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('default');
    });

    it('全画面から戻り設定がONならクラシックを再適用する', async () => {
      vi.useFakeTimers();
      document.body.innerHTML = buildWatchDOM();
      apply(true);

      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('default');

      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
      await vi.advanceTimersByTimeAsync(100);

      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('classic');
      vi.useRealTimers();
    });

    it('全画面から戻っても設定がOFFなら再適用しない', async () => {
      vi.useFakeTimers();
      document.body.innerHTML = buildWatchDOM();
      apply(true);
      apply(false);
      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('default');

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

      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('default');
      vi.useRealTimers();
    });
  });

  describe('トグル動作', () => {
    it('クラシック⇔デフォルトを正しく切り替える', () => {
      document.body.innerHTML = buildWatchDOM();
      const player = getPlayer();

      expect(player.getAttribute(LAYOUT_MARKER)).toBeNull();

      apply(true);
      expect(player.getAttribute(LAYOUT_MARKER)).toBe('classic');
      expect(getTopContainer()).not.toBeNull();

      apply(false);
      expect(player.getAttribute(LAYOUT_MARKER)).toBe('default');
      expect(getTopContainer()).toBeNull();

      apply(true);
      expect(player.getAttribute(LAYOUT_MARKER)).toBe('classic');
      expect(getTopContainer()).not.toBeNull();
    });

    it('連続トグルでも壊れない', () => {
      document.body.innerHTML = buildWatchDOM();
      const player = getPlayer();

      apply(true);
      apply(true);
      expect(player.getAttribute(LAYOUT_MARKER)).toBe('classic');

      apply(false);
      apply(false);
      expect(player.getAttribute(LAYOUT_MARKER)).toBe('default');
      // 復帰後、全要素がbottomAreaに揃う
      expect(getBottom().querySelector('#title-area')).not.toBeNull();
      expect(getBottom().querySelector('#detail-info')).not.toBeNull();
    });
  });

  describe('エッジケース', () => {
    it('サイドバーが無くても例外を投げない', () => {
      document.body.innerHTML = `
        <section>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <div id="title-area"><h1>タイトル</h1></div>
            <section id="detail-info"><h1>動画の詳細情報</h1></section>
          </div>
        </section>`;

      expect(() => apply(true)).not.toThrow();
      expect((getTopContainer() as HTMLElement).children.length).toBe(1);
    });

    it('h1のtextContentがnullでも例外を投げない', () => {
      document.body.innerHTML = buildWatchDOM();
      const firstH1 = document.querySelector('.grid-area_\\[bottom\\] h1') as HTMLElement;
      Object.defineProperty(firstH1, 'textContent', { get: () => null, configurable: true });

      expect(() => apply(true)).not.toThrow();
      expect(getPlayer().getAttribute(LAYOUT_MARKER)).toBe('classic');
    });

    it('詳細情報の前に要素が無い（タイトル等が無い）場合は移動しない', () => {
      document.body.innerHTML = `
        <section>
          <div class="grid-area_[player]"></div>
          <div class="grid-area_[bottom]">
            <section id="detail-info"><h1>動画の詳細情報</h1></section>
            <section id="nicoad"><h1>ニコニ広告</h1></section>
          </div>
          <div class="grid-area_[sidebar]"></div>
        </section>`;

      apply(true);

      // 移動対象が無いため上部コンテナは作られないが、グリッドスタイルは適用される
      expect(getTopContainer()).toBeNull();
      expect(getBottom().firstElementChild?.id).toBe('detail-info');
    });
  });

  describe('モジュール状態の分離', () => {
    it('全画面リスナーは複数回applyしても1つだけ登録される', () => {
      document.body.innerHTML = buildWatchDOM();

      apply(true);
      apply(true);
      apply(false);
      apply(true);

      expect(fullscreenListeners.length).toBe(1);
    });
  });
});
