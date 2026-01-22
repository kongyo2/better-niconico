/**
 * Tests for src/content/features/addNicoRankButton.ts
 *
 * 実際のニコニコ動画のサイドバー構造:
 *
 * ■ 折りたたみ時 (幅80px):
 * <div class="simplebar-content">
 *   <div class="css-1i3qj3a">  <!-- メニューアイテムコンテナ -->
 *     <a class="css-1i9dz1a" href="/ranking?ref=video_sidemenu">
 *       <div class="css-54sd46">
 *         <div class="css-14y3bdu"><svg>...</svg></div>
 *         <div><p class="css-ium6yj">ランキング</p></div>
 *       </div>
 *     </a>
 *   </div>
 * </div>
 *
 * ■ 展開時 (幅226px):
 * <div class="simplebar-content">
 *   <div class="css-gzpr6t">  <!-- 展開時のメニューアイテムコンテナ -->
 *     <a class="css-1i9dz1a" href="/ranking?ref=video_sidemenu">
 *       <div class="css-1xvl3dk">  <!-- 展開時の内部コンテナ -->
 *         <div class="css-14y3bdu"><svg>...</svg></div>
 *         <div><p class="css-xzkfql">ランキング</p></div>  <!-- 展開時のテキストクラス -->
 *       </div>
 *     </a>
 *   </div>
 * </div>
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './addNicoRankButton';

const BUTTON_MARKER = 'data-bn-nico-rank-button';
const CONTAINER_MARKER = 'data-bn-nico-rank-container';

/**
 * サイドバーのCSSクラス定義
 * 実際のページでは折りたたみ時と展開時でクラス名が異なる
 */
const SIDEBAR_CLASSES = {
  /** 折りたたみ時 */
  collapsed: {
    container: 'css-1i3qj3a', // メニューアイテムコンテナ
    innerDiv: 'css-54sd46', // 内部コンテナ
    textClass: 'css-ium6yj', // テキストのクラス
  },
  /** 展開時 */
  expanded: {
    container: 'css-gzpr6t', // メニューアイテムコンテナ
    innerDiv: 'css-1xvl3dk', // 内部コンテナ
    textClass: 'css-xzkfql', // テキストのクラス
  },
  /** 共通 */
  common: {
    link: 'css-1i9dz1a', // リンクのクラス
    iconContainer: 'css-14y3bdu', // アイコンコンテナ
  },
};

/**
 * 折りたたみ時のサイドバーメニューアイテムHTML
 */
function createCollapsedMenuItemHTML(linkText: string, href: string): string {
  return `
    <div class="${SIDEBAR_CLASSES.collapsed.container}">
      <a class="${SIDEBAR_CLASSES.common.link}" href="${href}">
        <div class="${SIDEBAR_CLASSES.collapsed.innerDiv}">
          <div class="${SIDEBAR_CLASSES.common.iconContainer}"><svg><path></path></svg></div>
          <div><p class="${SIDEBAR_CLASSES.collapsed.textClass}">${linkText}</p></div>
        </div>
      </a>
    </div>
  `;
}

/**
 * 展開時のサイドバーメニューアイテムHTML
 */
function createExpandedMenuItemHTML(linkText: string, href: string): string {
  return `
    <div class="${SIDEBAR_CLASSES.expanded.container}">
      <a class="${SIDEBAR_CLASSES.common.link}" href="${href}">
        <div class="${SIDEBAR_CLASSES.expanded.innerDiv}">
          <div class="${SIDEBAR_CLASSES.common.iconContainer}"><svg><path></path></svg></div>
          <div><p class="${SIDEBAR_CLASSES.expanded.textClass}">${linkText}</p></div>
        </div>
      </a>
    </div>
  `;
}

// 後方互換性のためのエイリアス
function createSidebarMenuItemHTML(linkText: string, href: string): string {
  return createCollapsedMenuItemHTML(linkText, href);
}

/**
 * セパレータのHTML
 * 実際のニコニコ動画では <hr class="css-16zug1i"> を含む
 */
function createSeparatorHTML(): string {
  return '<div class="css-1w0ym84"><hr class="css-16zug1i"></div>';
}

/**
 * 折りたたみ時のサイドバー構造を作成
 */
function createSidebarHTML(items: Array<{ text: string; href: string }>): string {
  const itemsHTML = items
    .map((item) => createCollapsedMenuItemHTML(item.text, item.href))
    .join(createSeparatorHTML());
  return `<div class="simplebar-content">${itemsHTML}</div>`;
}

/**
 * 展開時のサイドバー構造を作成
 */
function createExpandedSidebarHTML(items: Array<{ text: string; href: string }>): string {
  const itemsHTML = items
    .map((item) => createExpandedMenuItemHTML(item.text, item.href))
    .join(createSeparatorHTML());
  return `<div class="simplebar-content">${itemsHTML}</div>`;
}

describe('addNicoRankButton', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    // Mock location for video_top page
    vi.stubGlobal('location', {
      pathname: '/video_top',
      href: 'https://www.nicovideo.jp/video_top',
    });
  });

  describe('apply with enabled=true (add button)', () => {
    it('should add button when on video_top page with ranking link', () => {
      // 実際のニコニコ動画のサイドバー構造を再現
      document.body.innerHTML = createSidebarHTML([
        { text: 'おすすめ動画', href: '/recommendations?ref=video_sidemenu' },
        { text: 'マイリスト', href: '/my/mylist?ref=video_sidemenu' },
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).not.toBeNull();
      // 新規作成されたボタンのクラス名を確認
      expect(button?.className).toBe('css-1i9dz1a');
      expect(button?.getAttribute('href')).toBe('https://nico-rank.com/');
      expect(button?.getAttribute('target')).toBe('_blank');

      // テキストが正しく設定されているか
      expect(button?.querySelector('p')?.textContent).toBe('ニコラン');
    });

    it('should insert button after ranking link container', () => {
      document.body.innerHTML = createSidebarHTML([
        { text: 'マイリスト', href: '/my/mylist?ref=video_sidemenu' },
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      // ランキングリンクのコンテナを取得
      const rankingLink = document.querySelector('a[href*="/ranking?ref=video_sidemenu"]');
      const rankingContainer = rankingLink?.closest('.css-1i3qj3a');

      // ニコランボタンのコンテナを取得
      const nicoRankContainer = document.querySelector(`[${CONTAINER_MARKER}]`);

      // ニコランボタンがランキングの直後に挿入されているか確認
      expect(nicoRankContainer).not.toBeNull();
      expect(rankingContainer?.nextElementSibling).toBe(nicoRankContainer);
    });

    it('should not add button when not on video_top page', () => {
      vi.stubGlobal('location', {
        pathname: '/watch/sm12345',
        href: 'https://www.nicovideo.jp/watch/sm12345',
      });

      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
    });

    it('should not add button when sidebar container missing', () => {
      document.body.innerHTML = '<div class="other-content">No sidebar</div>';

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
    });

    it('should not add button when ranking link not found', () => {
      document.body.innerHTML = createSidebarHTML([
        { text: 'マイリスト', href: '/my/mylist?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
    });

    it('should not add button when link class is wrong', () => {
      // css-1i9dz1aクラスがない場合
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="wrong-class" href="/ranking?ref=video_sidemenu">
              <div><p>ランキング</p></div>
            </a>
          </div>
        </div>
      `;

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
    });

    it('should not add button when text is not ランキング', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking?ref=video_sidemenu">
              <div class="css-54sd46">
                <div class="css-14y3bdu"><svg></svg></div>
                <div><p class="css-ium6yj">Ranking</p></div>
              </div>
            </a>
          </div>
        </div>
      `;

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
    });

    it('should not add duplicate buttons', () => {
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);
      apply(true);

      const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
      expect(buttons.length).toBe(1);
    });

    it('should add button with podium icon SVG', () => {
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      const svg = button?.querySelector('svg');
      expect(svg).not.toBeNull();
      // SVGのサイズを確認
      expect(svg?.getAttribute('width')).toBe('22');
      expect(svg?.getAttribute('height')).toBe('19');
    });

    it('should have correct structure matching original ranking link', () => {
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      // 内部構造を確認
      expect(button?.querySelector('.css-54sd46')).not.toBeNull();
      expect(button?.querySelector('.css-14y3bdu')).not.toBeNull();
      expect(button?.querySelector('.css-ium6yj')).not.toBeNull();
    });

    it('should set correct attributes on the link', () => {
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`) as HTMLAnchorElement;
      expect(button?.href).toBe('https://nico-rank.com/');
      expect(button?.target).toBe('_blank');
      expect(button?.rel).toBe('noopener noreferrer');
    });

    it('should create container with same class as ranking container', () => {
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);

      const rankingContainer = document
        .querySelector('a[href*="/ranking?ref=video_sidemenu"]')
        ?.closest('.css-1i3qj3a');
      const nicoRankContainer = document.querySelector(`[${CONTAINER_MARKER}]`);

      expect(nicoRankContainer?.className).toBe(rankingContainer?.className);
    });
  });

  describe('apply with enabled=false (remove button)', () => {
    it('should remove existing button', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking?ref=video_sidemenu">
              <div class="css-54sd46">
                <div class="css-14y3bdu"><svg></svg></div>
                <div><p class="css-ium6yj">ランキング</p></div>
              </div>
            </a>
          </div>
          <div class="css-1i3qj3a" ${CONTAINER_MARKER}="true">
            <a class="css-1i9dz1a" ${BUTTON_MARKER}="true" href="https://nico-rank.com/">
              <div class="css-54sd46">
                <div class="css-14y3bdu"><svg></svg></div>
                <div><p class="css-ium6yj">ニコラン</p></div>
              </div>
            </a>
          </div>
        </div>
      `;

      apply(false);

      const container = document.querySelector(`[${CONTAINER_MARKER}]`);
      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(container).toBeNull();
      expect(button).toBeNull();
    });

    it('should not throw when no button exists', () => {
      document.body.innerHTML = '<div>No buttons</div>';

      expect(() => apply(false)).not.toThrow();
    });

    it('should remove all buttons when multiple exist', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a" ${CONTAINER_MARKER}="true">
            <a ${BUTTON_MARKER}="true" href="https://nico-rank.com/">Button 1</a>
          </div>
          <div class="css-1i3qj3a" ${CONTAINER_MARKER}="true">
            <a ${BUTTON_MARKER}="true" href="https://nico-rank.com/">Button 2</a>
          </div>
        </div>
      `;

      apply(false);

      const containers = document.querySelectorAll(`[${CONTAINER_MARKER}]`);
      const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
      expect(containers.length).toBe(0);
      expect(buttons.length).toBe(0);
    });
  });

  describe('page detection', () => {
    it('should detect video_top page correctly', () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);
      expect(document.querySelector(`[${BUTTON_MARKER}]`)).not.toBeNull();
    });

    it('should detect video_top subpath', () => {
      vi.stubGlobal('location', {
        pathname: '/video_top/ranking',
        href: 'https://www.nicovideo.jp/video_top/ranking',
      });
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);
      expect(document.querySelector(`[${BUTTON_MARKER}]`)).not.toBeNull();
    });

    it('should not work on other pages even with sidebar present', () => {
      vi.stubGlobal('location', {
        pathname: '/ranking',
        href: 'https://www.nicovideo.jp/ranking',
      });
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);
      expect(document.querySelector(`[${BUTTON_MARKER}]`)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle ranking link without parent container', () => {
      // css-1i3qj3a, css-gzpr6t のどちらも親にない場合
      document.body.innerHTML = `
        <div class="simplebar-content">
          <a class="css-1i9dz1a" href="/ranking?ref=video_sidemenu">
            <div><p>ランキング</p></div>
          </a>
        </div>
      `;

      apply(true);

      // 親コンテナがないため、ボタンは追加されない
      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
    });

    it('should handle multiple ranking links in different sections', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking?ref=video_sidemenu">
              <div class="css-54sd46">
                <div class="css-14y3bdu"><svg></svg></div>
                <div><p class="css-ium6yj">ランキング</p></div>
              </div>
            </a>
          </div>
        </div>
        <div class="other-section">
          <div class="css-1i3qj3a">
            <a class="css-1i9dz1a" href="/ranking?ref=other">
              <div class="css-54sd46">
                <div class="css-14y3bdu"><svg></svg></div>
                <div><p class="css-ium6yj">ランキング</p></div>
              </div>
            </a>
          </div>
        </div>
      `;

      apply(true);

      // 両方のランキングリンクに対してボタンが追加される
      const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
      expect(buttons.length).toBe(2);
    });
  });

  /**
   * 展開時サイドバー（幅226px）のテスト
   *
   * サイドバー展開時は折りたたみ時とは異なるCSSクラスが使用される:
   * - コンテナ: css-gzpr6t (折りたたみ時: css-1i3qj3a)
   * - 内部div: css-1xvl3dk (折りたたみ時: css-54sd46)
   * - テキストp: css-xzkfql (折りたたみ時: css-ium6yj)
   */
  describe('expanded sidebar (width 226px)', () => {
    it('should add button in expanded sidebar', () => {
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'おすすめ動画', href: '/recommendations?ref=video_sidemenu' },
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).not.toBeNull();
    });

    it('should use expanded classes when in expanded sidebar', () => {
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).not.toBeNull();

      // 展開時のクラスが使用されているか確認
      // 現在の実装は折りたたみ時のクラスを常に使用しているため、このテストは失敗するはず
      const innerDiv = button?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`);
      const textElement = button?.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`);

      expect(innerDiv).not.toBeNull();
      expect(textElement).not.toBeNull();
      expect(textElement?.textContent).toBe('ニコラン');
    });

    it('should insert button after ranking container in expanded sidebar', () => {
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'マイリスト', href: '/my/mylist?ref=video_sidemenu' },
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      const rankingLink = document.querySelector('a[href*="/ranking?ref=video_sidemenu"]');
      const rankingContainer = rankingLink?.closest(`.${SIDEBAR_CLASSES.expanded.container}`);
      const nicoRankContainer = document.querySelector(`[${CONTAINER_MARKER}]`);

      expect(nicoRankContainer).not.toBeNull();
      expect(rankingContainer?.nextElementSibling).toBe(nicoRankContainer);
    });

    it('should create container with same class as expanded ranking container', () => {
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);

      const rankingContainer = document
        .querySelector('a[href*="/ranking?ref=video_sidemenu"]')
        ?.closest(`.${SIDEBAR_CLASSES.expanded.container}`);
      const nicoRankContainer = document.querySelector(`[${CONTAINER_MARKER}]`);

      expect(nicoRankContainer?.className).toBe(rankingContainer?.className);
    });

    it('should not add duplicate buttons in expanded sidebar', () => {
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);
      apply(true);

      const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
      expect(buttons.length).toBe(1);
    });
  });

  /**
   * サイドバー状態切り替えのテスト
   */
  describe('sidebar state transitions', () => {
    it('should work when sidebar toggles from collapsed to expanded', () => {
      // まず折りたたみ状態でボタンを追加
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);
      expect(document.querySelectorAll(`[${BUTTON_MARKER}]`).length).toBe(1);

      // 既存のボタンを削除
      apply(false);
      expect(document.querySelectorAll(`[${BUTTON_MARKER}]`).length).toBe(0);

      // 展開状態のDOMに変更されてボタンを再追加
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);
      expect(document.querySelectorAll(`[${BUTTON_MARKER}]`).length).toBe(1);
    });

    it('should handle mixed sidebar states (both collapsed and expanded elements)', () => {
      // 折りたたみ時と展開時の両方の要素が混在する異常ケース
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="${SIDEBAR_CLASSES.collapsed.container}">
            <a class="${SIDEBAR_CLASSES.common.link}" href="/ranking?ref=video_sidemenu_1">
              <div class="${SIDEBAR_CLASSES.collapsed.innerDiv}">
                <div class="${SIDEBAR_CLASSES.common.iconContainer}"><svg></svg></div>
                <div><p class="${SIDEBAR_CLASSES.collapsed.textClass}">ランキング</p></div>
              </div>
            </a>
          </div>
          <div class="${SIDEBAR_CLASSES.expanded.container}">
            <a class="${SIDEBAR_CLASSES.common.link}" href="/ranking?ref=video_sidemenu_2">
              <div class="${SIDEBAR_CLASSES.expanded.innerDiv}">
                <div class="${SIDEBAR_CLASSES.common.iconContainer}"><svg></svg></div>
                <div><p class="${SIDEBAR_CLASSES.expanded.textClass}">ランキング</p></div>
              </div>
            </a>
          </div>
        </div>
      `;

      apply(true);

      // 両方のランキングリンクに対してボタンが追加される
      const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
      expect(buttons.length).toBe(2);
    });

    /**
     * サイドバー切り替え時のバグテスト
     *
     * 実際のページでは、サイドバーを切り替えると:
     * 1. ニコニコ動画のJSが元のメニュー項目のクラスを更新する
     * 2. しかし、追加したニコランボタンは古いクラスのまま残る
     *
     * このテストは、ニコランボタンのクラスが
     * ランキングのコンテナクラスと一致することを確認する
     */
    it('should update button classes when sidebar state changes (collapsed -> expanded)', () => {
      // 1. 折りたたみ状態でボタンを追加
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);

      const collapsedButton = document.querySelector(`[${BUTTON_MARKER}]`);
      const collapsedContainer = document.querySelector(`[${CONTAINER_MARKER}]`);
      expect(collapsedContainer?.className).toBe(SIDEBAR_CLASSES.collapsed.container);
      expect(collapsedButton?.querySelector(`.${SIDEBAR_CLASSES.collapsed.innerDiv}`)).not.toBeNull();

      // 2. サイドバーが展開された時のDOM変更をシミュレート
      //    実際のページでは、ニコニコ動画のJSがランキングリンクのクラスを更新する
      //    しかし、追加したニコランボタンのコンテナとボタン内部は古いクラスのまま
      const rankingContainer = document
        .querySelector('a[href*="/ranking?ref=video_sidemenu"]')
        ?.closest(`.${SIDEBAR_CLASSES.collapsed.container}`);

      if (rankingContainer) {
        // ランキングのコンテナクラスが展開時のクラスに変更される
        rankingContainer.className = SIDEBAR_CLASSES.expanded.container;
        // ランキングの内部div も変更される
        const innerDiv = rankingContainer.querySelector(`.${SIDEBAR_CLASSES.collapsed.innerDiv}`);
        if (innerDiv) {
          innerDiv.className = SIDEBAR_CLASSES.expanded.innerDiv;
        }
        // テキストのクラスも変更される
        const textP = rankingContainer.querySelector(`.${SIDEBAR_CLASSES.collapsed.textClass}`);
        if (textP) {
          textP.className = SIDEBAR_CLASSES.expanded.textClass;
        }
      }

      // 3. apply(true) を再度呼び出して、ボタンを更新
      apply(true);

      // 4. ニコランボタンのクラスがランキングと一致することを確認
      const updatedContainer = document.querySelector(`[${CONTAINER_MARKER}]`);
      const updatedButton = document.querySelector(`[${BUTTON_MARKER}]`);
      const newRankingContainer = document
        .querySelector('a[href*="/ranking?ref=video_sidemenu"]')
        ?.closest(`.${SIDEBAR_CLASSES.expanded.container}`);

      // コンテナのクラスが展開時のクラスに更新されていること
      expect(updatedContainer?.className).toBe(SIDEBAR_CLASSES.expanded.container);
      expect(updatedContainer?.className).toBe(newRankingContainer?.className);

      // ボタン内部のクラスも展開時のクラスに更新されていること
      expect(updatedButton?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).not.toBeNull();
      expect(updatedButton?.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`)).not.toBeNull();
    });

    it('should update button classes when sidebar state changes (expanded -> collapsed)', () => {
      // 1. 展開状態でボタンを追加
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);

      const expandedButton = document.querySelector(`[${BUTTON_MARKER}]`);
      const expandedContainer = document.querySelector(`[${CONTAINER_MARKER}]`);
      expect(expandedContainer?.className).toBe(SIDEBAR_CLASSES.expanded.container);
      expect(expandedButton?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).not.toBeNull();

      // 2. サイドバーが折りたたまれた時のDOM変更をシミュレート
      const rankingContainer = document
        .querySelector('a[href*="/ranking?ref=video_sidemenu"]')
        ?.closest(`.${SIDEBAR_CLASSES.expanded.container}`);

      if (rankingContainer) {
        // ランキングのコンテナクラスが折りたたみ時のクラスに変更される
        rankingContainer.className = SIDEBAR_CLASSES.collapsed.container;
        // ランキングの内部div も変更される
        const innerDiv = rankingContainer.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`);
        if (innerDiv) {
          innerDiv.className = SIDEBAR_CLASSES.collapsed.innerDiv;
        }
        // テキストのクラスも変更される
        const textP = rankingContainer.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`);
        if (textP) {
          textP.className = SIDEBAR_CLASSES.collapsed.textClass;
        }
      }

      // 3. apply(true) を再度呼び出して、ボタンを更新
      apply(true);

      // 4. ニコランボタンのクラスがランキングと一致することを確認
      const updatedContainer = document.querySelector(`[${CONTAINER_MARKER}]`);
      const updatedButton = document.querySelector(`[${BUTTON_MARKER}]`);
      const newRankingContainer = document
        .querySelector('a[href*="/ranking?ref=video_sidemenu"]')
        ?.closest(`.${SIDEBAR_CLASSES.collapsed.container}`);

      // コンテナのクラスが折りたたみ時のクラスに更新されていること
      expect(updatedContainer?.className).toBe(SIDEBAR_CLASSES.collapsed.container);
      expect(updatedContainer?.className).toBe(newRankingContainer?.className);

      // ボタン内部のクラスも折りたたみ時のクラスに更新されていること
      expect(updatedButton?.querySelector(`.${SIDEBAR_CLASSES.collapsed.innerDiv}`)).not.toBeNull();
      expect(updatedButton?.querySelector(`.${SIDEBAR_CLASSES.collapsed.textClass}`)).not.toBeNull();
    });
  });
});
