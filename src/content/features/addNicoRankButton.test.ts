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
 *
 * ■ サイドバー切り替え時の状態同期（修正済み）
 *
 * 問題（修正前）:
 *   サイドバーを展開/折りたたむと、ニコニコ動画のJSが既存のメニュー項目の
 *   CSSクラスを変更するが、拡張機能で追加したニコランボタンは更新されなかった。
 *
 * 解決策（実装済み）:
 *   addNicoRankButton.ts 内で専用のMutationObserverを作成し、
 *   サイドバー内のclass属性変更を監視。ランキングリンクのコンテナクラスが
 *   変更されると、自動的にニコランボタンのクラスを更新する。
 *
 * テスト:
 *   「should auto-update button when sidebar classes change」テストで
 *   自動更新が機能することを検証している。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './addNicoRankButton';

const BUTTON_MARKER = 'data-bn-nico-rank-button';

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

const GROUP_SELECTOR = `.${SIDEBAR_CLASSES.collapsed.container}, .${SIDEBAR_CLASSES.expanded.container}`;

function getRankingLink(hrefPart = '/ranking?ref=video_sidemenu'): HTMLAnchorElement | null {
  return document.querySelector(`a[href*="${hrefPart}"]`) as HTMLAnchorElement | null;
}

function getNicoRankButton(): HTMLAnchorElement | null {
  return document.querySelector(`[${BUTTON_MARKER}]`) as HTMLAnchorElement | null;
}

function getMenuGroup(element: Element | null): HTMLElement | null {
  return element?.closest(GROUP_SELECTOR) as HTMLElement | null;
}

function updateRankingGroupToExpanded(): HTMLElement | null {
  const rankingGroup = getMenuGroup(getRankingLink());
  if (!rankingGroup) {
    return null;
  }

  rankingGroup.className = SIDEBAR_CLASSES.expanded.container;
  const innerDiv = rankingGroup.querySelector(`.${SIDEBAR_CLASSES.collapsed.innerDiv}`);
  if (innerDiv) {
    innerDiv.className = SIDEBAR_CLASSES.expanded.innerDiv;
  }
  const textP = rankingGroup.querySelector(`.${SIDEBAR_CLASSES.collapsed.textClass}`);
  if (textP) {
    textP.className = SIDEBAR_CLASSES.expanded.textClass;
  }

  return rankingGroup;
}

function updateRankingGroupToCollapsed(): HTMLElement | null {
  const rankingGroup = getMenuGroup(getRankingLink());
  if (!rankingGroup) {
    return null;
  }

  rankingGroup.className = SIDEBAR_CLASSES.collapsed.container;
  const innerDiv = rankingGroup.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`);
  if (innerDiv) {
    innerDiv.className = SIDEBAR_CLASSES.collapsed.innerDiv;
  }
  const textP = rankingGroup.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`);
  if (textP) {
    textP.className = SIDEBAR_CLASSES.collapsed.textClass;
  }

  return rankingGroup;
}

describe('addNicoRankButton', () => {
  beforeEach(() => {
    // Reset DOM and observer state
    apply(false); // オブザーバーを停止し、既存のボタンを削除
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

    it('should insert button after ranking link inside the same group', () => {
      document.body.innerHTML = createSidebarHTML([
        { text: 'マイリスト', href: '/my/mylist?ref=video_sidemenu' },
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      const rankingLink = getRankingLink();
      const button = getNicoRankButton();

      expect(button).not.toBeNull();
      expect(rankingLink?.nextElementSibling).toBe(button);
      expect(getMenuGroup(button)).toBe(getMenuGroup(rankingLink));
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

    it('should keep button inside the ranking group', () => {
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);

      const rankingLink = getRankingLink();
      const button = getNicoRankButton();
      const rankingGroup = getMenuGroup(rankingLink);

      expect(button).not.toBeNull();
      expect(getMenuGroup(button)).toBe(rankingGroup);
      expect(rankingGroup?.querySelectorAll(`[${BUTTON_MARKER}]`).length).toBe(1);
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

      const button = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button).toBeNull();
      expect(getRankingLink()).not.toBeNull();
    });

    it('should not throw when no button exists', () => {
      document.body.innerHTML = '<div>No buttons</div>';

      expect(() => apply(false)).not.toThrow();
    });

    it('should remove all buttons when multiple exist', () => {
      document.body.innerHTML = `
        <div class="simplebar-content">
          <div class="css-1i3qj3a">
            <a ${BUTTON_MARKER}="true" href="https://nico-rank.com/">Button 1</a>
          </div>
          <div class="css-1i3qj3a">
            <a ${BUTTON_MARKER}="true" href="https://nico-rank.com/">Button 2</a>
          </div>
        </div>
      `;

      apply(false);

      const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
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

    it('should only add one button for the sidebar ranking link', () => {
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

      const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
      expect(buttons.length).toBe(1);
      expect(getRankingLink()?.nextElementSibling).toBe(buttons[0]);
      expect(document.querySelector('.other-section')?.querySelector(`[${BUTTON_MARKER}]`)).toBeNull();
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

    it('should insert button after ranking link in expanded sidebar', () => {
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'マイリスト', href: '/my/mylist?ref=video_sidemenu' },
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      const rankingLink = getRankingLink();
      const button = getNicoRankButton();

      expect(button).not.toBeNull();
      expect(rankingLink?.nextElementSibling).toBe(button);
      expect(getMenuGroup(button)?.className).toBe(SIDEBAR_CLASSES.expanded.container);
    });

    it('should keep button inside the expanded ranking group', () => {
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);

      apply(true);

      const rankingGroup = getMenuGroup(getRankingLink());
      const button = getNicoRankButton();

      expect(button).not.toBeNull();
      expect(getMenuGroup(button)).toBe(rankingGroup);
      expect(rankingGroup?.className).toBe(SIDEBAR_CLASSES.expanded.container);
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

    it('should prefer the first matching sidebar ranking link', () => {
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

      const button = getNicoRankButton();
      expect(button).not.toBeNull();
      expect(document.querySelectorAll(`[${BUTTON_MARKER}]`).length).toBe(1);
      expect(getMenuGroup(button)?.className).toBe(SIDEBAR_CLASSES.collapsed.container);
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
    it('should update button classes when sidebar state changes (collapsed -> expanded)', async () => {
      // 1. 折りたたみ状態でボタンを追加
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);

      const collapsedButton = getNicoRankButton();
      expect(getMenuGroup(collapsedButton)?.className).toBe(SIDEBAR_CLASSES.collapsed.container);
      expect(
        collapsedButton?.querySelector(`.${SIDEBAR_CLASSES.collapsed.innerDiv}`),
      ).not.toBeNull();

      // 2. サイドバーが展開された時のDOM変更をシミュレート
      //    実際のページでは、ニコニコ動画のJSがランキングリンクのクラスを更新する
      //    しかし、追加したニコランボタンのコンテナとボタン内部は古いクラスのまま
      updateRankingGroupToExpanded();

      await vi.waitFor(() => {
        const updatedButton = getNicoRankButton();

        expect(getMenuGroup(updatedButton)?.className).toBe(SIDEBAR_CLASSES.expanded.container);
        expect(updatedButton?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).not.toBeNull();
        expect(updatedButton?.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`)).not.toBeNull();
      });
    });

    it('should update button classes when sidebar state changes (expanded -> collapsed)', async () => {
      // 1. 展開状態でボタンを追加
      document.body.innerHTML = createExpandedSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);

      const expandedButton = getNicoRankButton();
      expect(getMenuGroup(expandedButton)?.className).toBe(SIDEBAR_CLASSES.expanded.container);
      expect(expandedButton?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).not.toBeNull();

      // 2. サイドバーが折りたたまれた時のDOM変更をシミュレート
      updateRankingGroupToCollapsed();

      await vi.waitFor(() => {
        const updatedButton = getNicoRankButton();

        expect(getMenuGroup(updatedButton)?.className).toBe(SIDEBAR_CLASSES.collapsed.container);
        expect(updatedButton?.querySelector(`.${SIDEBAR_CLASSES.collapsed.innerDiv}`)).not.toBeNull();
        expect(updatedButton?.querySelector(`.${SIDEBAR_CLASSES.collapsed.textClass}`)).not.toBeNull();
      });
    });

    /**
     * 重要: DOM変更後、apply(true) 呼び出し前の中間状態テスト
     *
     * このテストは、サイドバーが切り替わった直後（ニコニコ動画のJSがクラスを更新した後）
     * かつ apply(true) が呼び出される前の状態を検証します。
     *
     * この中間状態では、ニコランボタンのクラスはまだ古い状態のままです。
     * これは「正常な動作」であり、apply(true) が呼ばれることで解決されます。
     *
     * 実際の問題は、この apply(true) が適切なタイミングで呼ばれるかどうかです。
     * 現在のMutationObserver設定では childList のみを監視しているため、
     * クラス属性の変更だけでは apply(true) がトリガーされません。
     */
    it('should stay in sync without requiring manual apply(true) after sidebar toggle', async () => {
      // 1. 折りたたみ状態でボタンを追加
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);

      updateRankingGroupToExpanded();

      await vi.waitFor(() => {
        const button = getNicoRankButton();

        expect(getMenuGroup(button)?.className).toBe(SIDEBAR_CLASSES.expanded.container);
        expect(button?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).not.toBeNull();
      });
    });

    /**
     * 連続した状態切り替えのテスト
     *
     * 短時間で複数回サイドバーが切り替わった場合の動作を確認
     */
    it('should handle rapid sidebar toggles correctly', async () => {
      // 折りたたみ状態で開始
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);
      expect(getMenuGroup(getNicoRankButton())?.className).toBe(SIDEBAR_CLASSES.collapsed.container);

      // 展開に切り替え
      updateRankingGroupToExpanded();
      updateRankingGroupToExpanded();
      await vi.waitFor(() => {
        expect(getMenuGroup(getNicoRankButton())?.className).toBe(SIDEBAR_CLASSES.expanded.container);
      });

      // すぐに折りたたみに戻す
      updateRankingGroupToCollapsed();
      updateRankingGroupToCollapsed();
      await vi.waitFor(() => {
        expect(getMenuGroup(getNicoRankButton())?.className).toBe(SIDEBAR_CLASSES.collapsed.container);
      });

      // 再び展開
      updateRankingGroupToExpanded();
      await vi.waitFor(() => {
        const button = getNicoRankButton();

        expect(getMenuGroup(button)?.className).toBe(SIDEBAR_CLASSES.expanded.container);
        expect(button?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).not.toBeNull();
        expect(button?.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`)).not.toBeNull();
      });
    });

    /**
     * ボタン内部のすべてのクラスが正しく更新されることを検証
     */
    it('should update all internal classes (group, innerDiv, textClass) on state change', async () => {
      // 折りたたみ状態でボタンを追加
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);

      // 初期状態を確認
      const button1 = document.querySelector(`[${BUTTON_MARKER}]`);
      expect(button1?.querySelector(`.${SIDEBAR_CLASSES.collapsed.innerDiv}`)).not.toBeNull();
      expect(button1?.querySelector(`.${SIDEBAR_CLASSES.collapsed.textClass}`)).not.toBeNull();
      // 展開時のクラスは存在しない
      expect(button1?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).toBeNull();
      expect(button1?.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`)).toBeNull();

      updateRankingGroupToExpanded();

      await vi.waitFor(() => {
        const button2 = getNicoRankButton();

        expect(getMenuGroup(button2)?.className).toBe(SIDEBAR_CLASSES.expanded.container);
        expect(button2?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).not.toBeNull();
        expect(button2?.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`)).not.toBeNull();
        expect(button2?.querySelector(`.${SIDEBAR_CLASSES.collapsed.innerDiv}`)).toBeNull();
        expect(button2?.querySelector(`.${SIDEBAR_CLASSES.collapsed.textClass}`)).toBeNull();
      });
    });
  });

  /**
   * サイドバー切り替え時の自動更新テスト
   *
   * MutationObserverがサイドバー内のclass属性変更を監視し、
   * ランキングリンクのコンテナクラスが変更されると、自動的に
   * ニコランボタンのクラスを更新する機能をテストする。
   */
  describe('sidebar toggle auto-updates button classes', () => {
    /**
     * サイドバーのクラス変更時に、ニコランボタンが自動更新されることを確認
     */
    it('should auto-update button when sidebar classes change', async () => {
      // 1. 折りたたみ状態でボタンを追加
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);

      expect(getMenuGroup(getNicoRankButton())?.className).toBe(SIDEBAR_CLASSES.collapsed.container);

      updateRankingGroupToExpanded();

      await vi.waitFor(() => {
        const button = getNicoRankButton();

        expect(getMenuGroup(button)?.className).toBe(SIDEBAR_CLASSES.expanded.container);
        expect(button?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).not.toBeNull();
        expect(button?.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`)).not.toBeNull();
      });
    });

    /**
     * 実装が修正されるまで、明示的に apply(true) を呼び出す必要があることを示すテスト
     */
    it('should not require manual apply(true) call to sync button classes', async () => {
      // 折りたたみ状態でボタンを追加
      document.body.innerHTML = createSidebarHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
      ]);
      apply(true);

      updateRankingGroupToExpanded();

      await vi.waitFor(() => {
        const button = getNicoRankButton();

        expect(getMenuGroup(button)?.className).toBe(SIDEBAR_CLASSES.expanded.container);
        expect(button?.querySelector(`.${SIDEBAR_CLASSES.expanded.innerDiv}`)).not.toBeNull();
        expect(button?.querySelector(`.${SIDEBAR_CLASSES.expanded.textClass}`)).not.toBeNull();
      });
    });
  });

  /**
   * セパレータの扱いに関するテスト
   *
   * 実際のニコニコ動画のサイドバーでは、メニューアイテム間にセパレータが存在する:
   * - セパレータ: <div class="css-1w0ym84"><hr class="css-16zug1i"></div>
   * - 構造: メニューアイテム → セパレータ → メニューアイテム → セパレータ ...
   *
   * ニコランボタンはランキングの直後、既存のセパレータの前に挿入される。
   */
  describe('separator handling', () => {
    /**
     * セパレータを含むサイドバー構造を作成（実際のページと同じ構造）
     */
    function createSidebarWithSeparatorsHTML(
      items: Array<{ text: string; href: string }>,
    ): string {
      const itemsHTML = items
        .map((item) => createCollapsedMenuItemHTML(item.text, item.href))
        .join(createSeparatorHTML());
      // 最後のアイテムの後にもセパレータを追加（実際のページと同様）
      return `<div class="simplebar-content">${itemsHTML}${createSeparatorHTML()}</div>`;
    }

    it('should insert button inside the ranking group before the existing separator', () => {
      // 実際のページのDOM構造を再現: ランキング → セパレータ → Nアニメ
      document.body.innerHTML = createSidebarWithSeparatorsHTML([
        { text: 'マイリスト', href: '/my/mylist?ref=video_sidemenu' },
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      const rankingLink = getRankingLink();
      const rankingGroup = getMenuGroup(rankingLink);
      const button = getNicoRankButton();

      expect(button).not.toBeNull();
      expect(rankingLink?.nextElementSibling).toBe(button);
      expect(rankingGroup?.nextElementSibling?.className).toBe('css-1w0ym84');
      expect(rankingGroup?.nextElementSibling?.querySelector('hr')).not.toBeNull();
    });

    it('should not create duplicate separators', () => {
      document.body.innerHTML = createSidebarWithSeparatorsHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      // 挿入前のセパレータ数をカウント
      const separatorsBefore = document.querySelectorAll('.css-1w0ym84').length;

      apply(true);

      // 挿入後のセパレータ数をカウント（変わらないはず）
      const separatorsAfter = document.querySelectorAll('.css-1w0ym84').length;

      expect(separatorsAfter).toBe(separatorsBefore);
    });

    it('should preserve separator between nicorank button and next menu item', () => {
      document.body.innerHTML = createSidebarWithSeparatorsHTML([
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      const sidebar = document.querySelector('.simplebar-content');
      const children = Array.from(sidebar?.children || []);

      const rankingIndex = children.findIndex((child) =>
        child.querySelector('a[href*="/ranking?ref=video_sidemenu"]'),
      );
      expect(rankingIndex).toBeGreaterThan(-1);

      const rankingGroup = children[rankingIndex] as HTMLElement;
      const links = Array.from(rankingGroup.querySelectorAll('a'));
      expect(links).toHaveLength(2);
      expect(links[0]?.textContent?.trim()).toBe('ランキング');
      expect(links[1]?.getAttribute(BUTTON_MARKER)).toBe('true');

      const nextElement = children[rankingIndex + 1];
      expect(nextElement?.className).toBe('css-1w0ym84');
      expect(nextElement?.querySelector('hr')).not.toBeNull();

      const nAnimeElement = children[rankingIndex + 2];
      const nAnimeLink = nAnimeElement?.querySelector('a[href*="anime.nicovideo.jp"]');
      expect(nAnimeLink).not.toBeNull();
    });

    it('should maintain correct order: ranking -> nicorank -> separator -> next item', () => {
      document.body.innerHTML = createSidebarWithSeparatorsHTML([
        { text: 'マイリスト', href: '/my/mylist?ref=video_sidemenu' },
        { text: 'ランキング', href: '/ranking?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);

      apply(true);

      const sidebar = document.querySelector('.simplebar-content');
      const children = Array.from(sidebar?.children || []);

      const structure = children.flatMap((child) => {
        const element = child as HTMLElement;
        if (element.querySelector('hr')) {
          return ['separator'];
        }
        return Array.from(element.querySelectorAll('a')).map((link) =>
          link.hasAttribute(BUTTON_MARKER) ? 'nicorank' : (link.textContent?.trim() ?? 'unknown'),
        );
      });

      // ランキングとニコランの位置を確認
      const rankingIndex = structure.indexOf('ランキング');
      const nicoRankIndex = structure.indexOf('nicorank');

      expect(nicoRankIndex).toBe(rankingIndex + 1);
      expect(structure[nicoRankIndex + 1]).toBe('separator');
    });
  });
});
