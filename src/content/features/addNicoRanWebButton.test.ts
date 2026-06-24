/**
 * Tests for src/content/features/addNicoRanWebButton.ts
 *
 * ニコランWEBボタンは既存のニコランボタンと同じ仕組み(sidebarRankButton ファクトリ)で
 * 動作する。ランキングリンクを cloneNode で複製し、両サイドメニュー実装
 * (Emotion / PandaCSS)に追従する。
 *
 * ニコランWEB固有の挙動:
 * - リンク先は https://nicoranweb.com/
 * - ラベルは「ニコランWEB」
 * - アイコンは虫眼鏡(検索)
 * - ニコランボタンが存在すればその直後、なければランキング直後に挿入する
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './addNicoRanWebButton';

const BUTTON_MARKER = 'data-bn-nico-ran-web-button';
const NICO_RANK_MARKER = 'data-bn-nico-rank-button';

// --- 旧実装(Emotion, video_top風): グループdiv > a > div > div > svg/p ---

function emotionItem(text: string, href: string): string {
  return `
    <a class="css-1i9dz1a" href="${href}">
      <div class="css-54sd46">
        <div class="css-14y3bdu"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="19" viewBox="0 0 22 19"><path d="M1 1"></path></svg></div>
        <div><p class="css-ium6yj">${text}</p></div>
      </div>
    </a>`;
}

function emotionSidebar(items: Array<{ text: string; href: string }>): string {
  const links = items.map((i) => emotionItem(i.text, i.href)).join('');
  return `<div class="simplebar-content"><div class="css-1i3qj3a">${links}</div></div>`;
}

// 既存のニコランボタン(Emotion)を模したマークアップ
function emotionNicoRankButton(): string {
  return `
    <a class="css-1i9dz1a" ${NICO_RANK_MARKER}="true" target="_blank" rel="noopener noreferrer" href="https://nico-rank.com/">
      <div class="css-54sd46">
        <div class="css-14y3bdu"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="19" viewBox="0 0 22 19"></svg></div>
        <div><p class="css-ium6yj">ニコラン</p></div>
      </div>
    </a>`;
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

describe('addNicoRanWebButton', () => {
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

    it('should add button right after the ranking link when no nico-rank button', () => {
      apply(true);

      const button = getButton();
      expect(button).not.toBeNull();
      expect(getRankingLink()?.nextElementSibling).toBe(button);
    });

    it('should set nicoranweb href, target and rel', () => {
      apply(true);

      const button = getButton() as HTMLAnchorElement;
      expect(button.getAttribute('href')).toBe('https://nicoranweb.com/');
      expect(button.getAttribute('target')).toBe('_blank');
      expect(button.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('should set the label to ニコランWEB', () => {
      apply(true);
      expect(getButton()?.querySelector('p')?.textContent).toBe('ニコランWEB');
    });

    it('should replace the icon with the search (magnifier) SVG', () => {
      apply(true);

      const svg = getButton()?.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 22 19');
      expect(svg?.querySelectorAll('circle').length).toBe(1);
      expect(svg?.querySelectorAll('line').length).toBe(1);
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
      const rankingLi = getRankingLink()?.closest('li');
      expect(rankingLi?.nextElementSibling).toBe(button?.closest('li'));
    });

    it('should set the label to ニコランWEB', () => {
      apply(true);
      expect(getButton()?.querySelector('span')?.textContent).toBe('ニコランWEB');
    });

    it('should set nicoranweb href', () => {
      apply(true);
      expect(getButton()?.getAttribute('href')).toBe('https://nicoranweb.com/');
    });

    it('should drop niconico tracking (data-anchor) attributes', () => {
      apply(true);

      const button = getButton() as HTMLAnchorElement;
      expect(button.hasAttribute('data-anchor')).toBe(false);
      expect(button.hasAttribute('data-anchor-page')).toBe(false);
      expect(button.hasAttribute('data-anchor-area')).toBe(false);
      expect(button.hasAttribute('data-anchor-href')).toBe(false);
    });
  });

  describe('coexistence with the nico-rank button', () => {
    it('should insert right after the existing nico-rank button (Emotion)', () => {
      document.body.innerHTML = `<div class="simplebar-content"><div class="css-1i3qj3a">${emotionItem(
        'ランキング',
        '/ranking?ref=video_sidemenu',
      )}${emotionNicoRankButton()}</div></div>`;

      apply(true);

      const web = getButton();
      const nicoRank = document.querySelector(`[${NICO_RANK_MARKER}]`);
      expect(web).not.toBeNull();
      // ランキング → ニコラン → ニコランWEB の順に並ぶ
      expect(nicoRank?.nextElementSibling).toBe(web);
    });

    it('should fall back to the ranking link when no nico-rank button exists', () => {
      document.body.innerHTML = emotionSidebar([RANKING]);
      apply(true);
      expect(getRankingLink()?.nextElementSibling).toBe(getButton());
    });
  });

  describe('page independence', () => {
    it('should work on tag page (PandaCSS)', () => {
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
      expect(getButton()?.closest('li')).not.toBeNull();

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
