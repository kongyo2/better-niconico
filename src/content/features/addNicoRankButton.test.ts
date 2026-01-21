/**
 * Tests for src/content/features/addNicoRankButton.ts
 *
 * 実際のニコニコ動画のサイドバー構造:
 *
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
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './addNicoRankButton';

const BUTTON_MARKER = 'data-bn-nico-rank-button';
const CONTAINER_MARKER = 'data-bn-nico-rank-container';

/**
 * 実際のニコニコ動画サイドバーの構造を再現するヘルパー関数
 * @param linkText - リンクのテキスト
 * @param href - リンクのhref
 * @returns HTML文字列
 */
function createSidebarMenuItemHTML(linkText: string, href: string): string {
  return `
    <div class="css-1i3qj3a">
      <a class="css-1i9dz1a" href="${href}">
        <div class="css-54sd46">
          <div class="css-14y3bdu"><svg><path></path></svg></div>
          <div><p class="css-ium6yj">${linkText}</p></div>
        </div>
      </a>
    </div>
  `;
}

/**
 * セパレータのHTML
 */
function createSeparatorHTML(): string {
  return '<div class="css-1w0ym84"></div>';
}

/**
 * 完全なサイドバー構造を作成
 */
function createSidebarHTML(items: Array<{ text: string; href: string }>): string {
  const itemsHTML = items
    .map((item) => createSidebarMenuItemHTML(item.text, item.href))
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
});
