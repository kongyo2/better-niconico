/**
 * Tests for src/content/features/addNicoRankButton.ts
 *
 * ニコニコ動画はページによってサイドメニューの実装が異なる:
 * - 旧実装(video_top等): Emotion生成クラス(css-XXXX)、a > div > div > svg/p 構造
 * - 新実装(tag等): PandaCSSユーティリティクラス、ul > li > a > svg + span 構造
 *
 * 実装はハッシュクラスに依存せず、ランキングリンクを cloneNode で複製して
 * ニコランボタンを生成する。そのため両方の構造で動作する必要がある。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './addNicoRankButton';

const BUTTON_MARKER = 'data-bn-nico-rank-button';

// --- 旧実装(Emotion, video_top風): グループdiv > a > div > div > svg/p ---

function emotionItem(text: string, href: string): string {
  return `
    <a class="css-1i9dz1a" href="${href}">
      <div class="css-54sd46">
        <div class="css-14y3bdu"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M1 1"></path></svg></div>
        <div><p class="css-ium6yj">${text}</p></div>
      </div>
    </a>`;
}

function emotionSidebar(items: Array<{ text: string; href: string }>): string {
  const links = items.map((i) => emotionItem(i.text, i.href)).join('');
  return `<div class="simplebar-content"><div class="css-1i3qj3a">${links}</div></div>`;
}

// --- 新実装(PandaCSS, tag風): ul > li > a > svg + span ---

function pandaItem(text: string, href: string): string {
  return `
    <li class="cursor_pointer">
      <a data-anchor="1" data-anchor-page="tag" data-anchor-area="web_drawer" data-anchor-href="${href}" class="d_flex ai_center flex-d_column" href="${href}">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" class="w_auto h_x3"><path d="M1 1"></path></svg>
        <span class="wb_keep-all ta_center">${text}</span>
      </a>
    </li>`;
}

function pandaSidebar(items: Array<{ text: string; href: string }>): string {
  const lis = items.map((i) => pandaItem(i.text, i.href)).join('');
  return `<div class="simplebar-content"><ul>${lis}</ul></div>`;
}

// --- ヘルパー ---

function getButton(): HTMLAnchorElement | null {
  return document.querySelector(`[${BUTTON_MARKER}]`);
}

function getRankingLink(): HTMLAnchorElement | null {
  return document.querySelector('a[href*="/ranking"]');
}

const RANKING = { text: 'ランキング', href: '/ranking?ref=video_sidemenu' };

describe('addNicoRankButton', () => {
  beforeEach(() => {
    apply(false); // オブザーバーを停止し、既存のボタンを削除
    document.body.innerHTML = '';
  });

  describe('Emotion sidebar (video_top)', () => {
    beforeEach(() => {
      document.body.innerHTML = emotionSidebar([
        { text: 'おすすめ動画', href: '/recommendations?ref=video_sidemenu' },
        RANKING,
      ]);
    });

    it('should add button right after the ranking link', () => {
      apply(true);

      const button = getButton();
      expect(button).not.toBeNull();
      expect(getRankingLink()?.nextElementSibling).toBe(button);
    });

    it('should set nico-rank href, target and rel', () => {
      apply(true);

      const button = getButton() as HTMLAnchorElement;
      expect(button.getAttribute('href')).toBe('https://nico-rank.com/');
      expect(button.getAttribute('target')).toBe('_blank');
      expect(button.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('should replace the label text with ニコラン', () => {
      apply(true);
      expect(getButton()?.querySelector('p')?.textContent).toBe('ニコラン');
    });

    it('should replace the icon with the podium SVG', () => {
      apply(true);

      const svg = getButton()?.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 22 19');
      expect(svg?.querySelectorAll('rect').length).toBe(4);
    });

    it('should inherit the original link class (no hardcoded class)', () => {
      apply(true);
      // 複製元のクラスをそのまま引き継ぐ
      expect(getButton()?.className).toBe('css-1i9dz1a');
    });
  });

  describe('PandaCSS sidebar (tag page)', () => {
    beforeEach(() => {
      document.body.innerHTML = pandaSidebar([
        { text: 'おすすめ動画', href: '/recommendations?ref=video_sidemenu' },
        RANKING,
      ]);
    });

    it('should add button after the ranking list item', () => {
      apply(true);

      const button = getButton();
      expect(button).not.toBeNull();
      // li単位で複製され、ランキングのliの直後に入る
      const rankingLi = getRankingLink()?.closest('li');
      expect(rankingLi?.nextElementSibling).toBe(button?.closest('li'));
    });

    it('should replace the label text with ニコラン', () => {
      apply(true);
      expect(getButton()?.querySelector('span')?.textContent).toBe('ニコラン');
    });

    it('should set nico-rank href', () => {
      apply(true);
      expect(getButton()?.getAttribute('href')).toBe('https://nico-rank.com/');
    });

    it('should drop niconico tracking (data-anchor) attributes', () => {
      apply(true);

      const button = getButton() as HTMLAnchorElement;
      expect(button.hasAttribute('data-anchor')).toBe(false);
      expect(button.hasAttribute('data-anchor-page')).toBe(false);
      expect(button.hasAttribute('data-anchor-area')).toBe(false);
      expect(button.hasAttribute('data-anchor-href')).toBe(false);
    });

    it('should replace the icon with the podium SVG', () => {
      apply(true);

      const svg = getButton()?.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 22 19');
      expect(svg?.querySelectorAll('rect').length).toBe(4);
    });
  });

  describe('page independence', () => {
    // 旧実装は video_top 限定だったが、新実装はサイドメニューがあれば
    // どのページでも動作する(tag, ranking 等でニコランが出なかった不具合の修正)
    it('should work on tag page', () => {
      document.body.innerHTML = pandaSidebar([RANKING]);
      apply(true);
      expect(getButton()).not.toBeNull();
    });

    it('should work on ranking page', () => {
      document.body.innerHTML = pandaSidebar([RANKING]);
      apply(true);
      expect(getButton()).not.toBeNull();
    });
  });

  describe('guards', () => {
    it('should not add button when sidebar container is missing', () => {
      document.body.innerHTML = '<div class="other-content">No sidebar</div>';
      apply(true);
      expect(getButton()).toBeNull();
    });

    it('should not add button when ranking link is not found', () => {
      document.body.innerHTML = pandaSidebar([
        { text: 'マイリスト', href: '/my/mylist?ref=video_sidemenu' },
        { text: 'Nアニメ', href: 'https://anime.nicovideo.jp/free?ref=video_sidemenu' },
      ]);
      apply(true);
      expect(getButton()).toBeNull();
    });

    it('should not add duplicate buttons (Emotion)', () => {
      document.body.innerHTML = emotionSidebar([RANKING]);
      apply(true);
      apply(true);
      expect(document.querySelectorAll(`[${BUTTON_MARKER}]`).length).toBe(1);
    });

    it('should not add duplicate buttons (PandaCSS)', () => {
      document.body.innerHTML = pandaSidebar([RANKING]);
      apply(true);
      apply(true);
      expect(document.querySelectorAll(`[${BUTTON_MARKER}]`).length).toBe(1);
    });
  });

  describe('apply(false) removes the button', () => {
    it('should remove the button on Emotion sidebar and keep the ranking link', () => {
      document.body.innerHTML = emotionSidebar([RANKING]);
      apply(true);
      expect(getButton()).not.toBeNull();

      apply(false);
      expect(getButton()).toBeNull();
      expect(getRankingLink()).not.toBeNull();
    });

    it('should remove the button (and its li) on PandaCSS sidebar', () => {
      document.body.innerHTML = pandaSidebar([RANKING]);
      apply(true);
      const nicoLi = getButton()?.closest('li');
      expect(nicoLi).not.toBeNull();

      apply(false);
      expect(getButton()).toBeNull();
      // ランキングのliは残る
      expect(getRankingLink()?.closest('li')).not.toBeNull();
    });

    it('should not throw when no button exists', () => {
      document.body.innerHTML = '<div>No buttons</div>';
      expect(() => apply(false)).not.toThrow();
    });
  });

  describe('sidebar state transition (auto rebuild)', () => {
    it('should rebuild the button to inherit new classes when the ranking link changes', async () => {
      document.body.innerHTML = emotionSidebar([RANKING]);
      apply(true);
      expect(getButton()?.className).toBe('css-1i9dz1a');

      // 展開/折りたたみ切り替えでニコニコ動画がクラスを作り替えた状況をシミュレート
      const rankingLink = getRankingLink() as HTMLAnchorElement;
      rankingLink.className = 'css-expanded-xyz';

      await vi.waitFor(() => {
        const button = getButton();
        expect(button).not.toBeNull();
        // 作り直されて新しいクラスを引き継いでいる
        expect(button?.className).toBe('css-expanded-xyz');
        // 重複していない
        expect(document.querySelectorAll(`[${BUTTON_MARKER}]`).length).toBe(1);
      });
    });
  });
});
