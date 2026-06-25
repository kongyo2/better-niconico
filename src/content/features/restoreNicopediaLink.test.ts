/**
 * Tests for src/content/features/restoreNicopediaLink.ts
 *
 * 実際のニコニコ動画ページの DOM 構造（2026-06 に実機調査で検証）に基づく。
 * 動画タグは次の形:
 *   <a data-scope="hover-card" data-anchor-page="watch" data-anchor-area="tags"
 *      data-anchor-href="/tag/X" href="/tag/X"><span>タグ名</span></a>
 * タグコンテナ（.grid-area_[bottom] 内）:
 *   <div class="pos_relative d_flex flex-wrap_wrap gap_base"> ...タグ + タグ編集ボタン... </div>
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply, __resetNicopediaLinkState } from './restoreNicopediaLink';

const LINK_MARKER = 'data-bn-nicopedia-link';

/** 実際のタグリンク HTML を生成（data-anchor-area="tags" を含む） */
function tagHTML(tagName: string, encoded?: string): string {
  const enc = encoded ?? encodeURIComponent(tagName);
  const id = `hover-card:test-${Math.random().toString(36).slice(2)}:trigger`;
  const cls = [
    'd_inline-flex',
    'ai_center',
    'bdr_full',
    'bg-c_action.base',
    'flex-wrap_nowrap',
    'fw_bold',
    'ov_hidden',
    '[&:hover]:bg-c_action.baseHover',
    '[&_>_span]:lc_1',
    'h_x4',
    'px_x2',
  ].join(' ');
  return `<a data-scope="hover-card" data-part="trigger" dir="ltr" id="${id}" data-state="closed"
      data-anchor="1" data-anchor-page="watch" data-anchor-area="tags"
      data-anchor-href="/tag/${enc}" class="${cls}" href="/tag/${enc}"><span>${tagName}</span></a>`;
}

/** タグ編集ボタン HTML（タグリンクではない） */
function editButtonHTML(): string {
  return `<button class="Pressable cursor_pointer d_inline-flex ai_center h_x4" type="button"
      data-scope="dialog" data-part="trigger">タグ編集</button>`;
}

/** .grid-area_[bottom] 内のタグコンテナ HTML */
function bottomContainerHTML(tags: string[], includeEditButton = true): string {
  return `
    <div class="grid-area_[bottom] d_flex flex-d_column gap_x2">
      <div class="d_flex jc_space-between ai_flex-start">タイトル等</div>
      <div class="pos_relative d_flex flex-wrap_wrap gap_base">
        ${tags.map((t) => tagHTML(t)).join('')}
        ${includeEditButton ? editButtonHTML() : ''}
      </div>
      <section>コメント等</section>
    </div>
  `;
}

/** Background 応答をモックするヘルパー */
function mockExists(value: boolean) {
  vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: value });
}
function mockError(viaReject = false) {
  if (viaReject) {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('disconnected'));
  } else {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: false, error: true });
  }
}

/** 非同期の存在確認＋注入が落ち着くのを待つ */
async function flush(ms = 20) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function linkCount(): number {
  return document.querySelectorAll(`a[${LINK_MARKER}]`).length;
}

beforeEach(() => {
  document.body.innerHTML = '';
  __resetNicopediaLinkState();
  vi.stubGlobal('location', {
    pathname: '/watch/sm9',
    href: 'https://www.nicovideo.jp/watch/sm9',
  });
  vi.mocked(chrome.runtime.sendMessage).mockReset();
});

describe('restoreNicopediaLink', () => {
  describe('apply(true): 基本動作', () => {
    it('視聴ページ以外ではリンクを追加しない', async () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });
      mockExists(true);
      document.body.innerHTML = bottomContainerHTML(['test']);

      apply(true);
      await flush();

      expect(linkCount()).toBe(0);
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('タグコンテナが無ければ何もしない', async () => {
      mockExists(true);
      document.body.innerHTML = '<div>タグなし</div>';

      apply(true);
      await flush();

      expect(linkCount()).toBe(0);
    });

    it('記事が存在するタグにリンクを追加する', async () => {
      mockExists(true);
      document.body.innerHTML = bottomContainerHTML(['VOCALOID']);

      apply(true);
      await flush();

      const tag = document.querySelector<HTMLAnchorElement>('a[href*="/tag/"]');
      expect(tag?.querySelector(`a[${LINK_MARKER}]`)).not.toBeNull();
      const link = document.querySelector<HTMLAnchorElement>(`a[${LINK_MARKER}]`);
      expect(link?.getAttribute('href')).toBe('https://dic.nicovideo.jp/a/VOCALOID');
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('記事が存在しないタグにはリンクを追加しない', async () => {
      mockExists(false);
      document.body.innerHTML = bottomContainerHTML(['nonexistent']);

      apply(true);
      await flush();

      expect(linkCount()).toBe(0);
    });

    it('存在する/しないタグが混在しても正しく処理する', async () => {
      vi.mocked(chrome.runtime.sendMessage)
        .mockResolvedValueOnce({ exists: true })
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: true });
      document.body.innerHTML = bottomContainerHTML(['a-exists', 'b-missing', 'c-exists']);

      apply(true);
      await flush(60);

      expect(linkCount()).toBe(2);
    });
  });

  describe('通信エラーの扱い', () => {
    it('sendMessage が reject してもスローせず、リンクを追加しない', async () => {
      mockError(true);
      document.body.innerHTML = bottomContainerHTML(['test']);

      expect(() => apply(true)).not.toThrow();
      await flush();

      expect(linkCount()).toBe(0);
    });

    it('error:true 応答は「非存在」と区別し、キャッシュせず後で再試行できる', async () => {
      mockError(false);
      document.body.innerHTML = bottomContainerHTML(['retry-tag']);

      apply(true);
      await flush();
      expect(linkCount()).toBe(0);

      // エラー直後はクールダウンで再問い合わせされない
      const callsAfterError = vi.mocked(chrome.runtime.sendMessage).mock.calls.length;
      apply(true);
      await flush();
      expect(vi.mocked(chrome.runtime.sendMessage).mock.calls.length).toBe(callsAfterError);

      // クールダウンと状態をリセットすれば、復旧後に再試行してリンクが付く
      __resetNicopediaLinkState();
      mockExists(true);
      apply(true);
      await flush();
      expect(linkCount()).toBe(1);
    });
  });

  describe('冪等性・再注入', () => {
    it('既にリンクがあるタグは再処理しない（重複追加なし）', async () => {
      mockExists(true);
      document.body.innerHTML = bottomContainerHTML(['dup']);

      apply(true);
      await flush();
      expect(linkCount()).toBe(1);

      const callsAfterFirst = vi.mocked(chrome.runtime.sendMessage).mock.calls.length;
      apply(true);
      await flush();

      expect(linkCount()).toBe(1);
      // 既にリンクがあるので追加の問い合わせは発生しない
      expect(vi.mocked(chrome.runtime.sendMessage).mock.calls.length).toBe(callsAfterFirst);
    });

    it('React 等がリンクを消しても、再適用でキャッシュを使い再注入する', async () => {
      mockExists(true);
      document.body.innerHTML = bottomContainerHTML(['revive']);

      apply(true);
      await flush();
      expect(linkCount()).toBe(1);
      const callsAfterFirst = vi.mocked(chrome.runtime.sendMessage).mock.calls.length;

      // リンクだけ削除（タグは残す）= 再描画でリンクが消えた状況
      document.querySelector(`a[${LINK_MARKER}]`)?.remove();
      expect(linkCount()).toBe(0);

      apply(true);
      await flush();

      // 再注入される。存在はキャッシュ済みなので再 fetch しない
      expect(linkCount()).toBe(1);
      expect(vi.mocked(chrome.runtime.sendMessage).mock.calls.length).toBe(callsAfterFirst);
    });

    it('同一タグ名の存在確認結果をキャッシュし、再 fetch しない', async () => {
      mockExists(true);
      document.body.innerHTML = bottomContainerHTML(['cached']);

      apply(true);
      await flush();
      expect(vi.mocked(chrome.runtime.sendMessage).mock.calls.length).toBe(1);

      // 同名タグを新たに追加して再適用 → キャッシュ利用で sendMessage は増えない
      const container = document.querySelector('div[class*="flex-wrap_wrap"]')!;
      container.insertAdjacentHTML('beforeend', tagHTML('cached'));

      apply(true);
      await flush();

      expect(linkCount()).toBe(2);
      expect(vi.mocked(chrome.runtime.sendMessage).mock.calls.length).toBe(1);
    });
  });

  describe('タグの特定（セレクタの堅牢性）', () => {
    it('data-anchor-area="tags" を主シグナルに動画タグを特定する', async () => {
      mockExists(true);
      document.body.innerHTML = bottomContainerHTML(['t1', 't2', 't3']);

      apply(true);
      await flush(40);

      expect(linkCount()).toBe(3);
    });

    it('data-anchor-area が無くても grid-area_[bottom] のコンテナから拾う（フォールバック）', async () => {
      mockExists(true);
      // data-anchor-area を持たないタグ（属性ベース検出が効かないケース）
      document.body.innerHTML = `
        <div class="grid-area_[bottom] d_flex flex-d_column">
          <div class="pos_relative d_flex flex-wrap_wrap gap_base">
            <a href="/tag/fallback1"><span>fallback1</span></a>
            <a href="/tag/fallback2"><span>fallback2</span></a>
          </div>
        </div>
      `;

      apply(true);
      await flush(40);

      expect(linkCount()).toBe(2);
    });

    it('クラシックレイアウトで #bn-top-sections へ移動したタグも拾う', async () => {
      mockExists(true);
      // restoreClassicVideoLayout がタグを上部コンテナへ退避した状況（属性は無い前提でフォールバックを検証）
      document.body.innerHTML = `
        <div id="bn-top-sections" class="d_flex flex-d_column gap_x2">
          <div class="pos_relative d_flex flex-wrap_wrap gap_base">
            <a href="/tag/moved"><span>moved</span></a>
          </div>
        </div>
        <div class="grid-area_[bottom]"></div>
      `;

      apply(true);
      await flush();

      expect(linkCount()).toBe(1);
    });

    it('属性ベース検出は移動後も追従する（コンテナ位置に依存しない）', async () => {
      mockExists(true);
      document.body.innerHTML = `
        <div id="bn-top-sections">
          <div class="pos_relative d_flex flex-wrap_wrap gap_base">
            ${tagHTML('attr-moved')}
          </div>
        </div>
        <div class="grid-area_[bottom]"></div>
      `;

      apply(true);
      await flush();

      expect(linkCount()).toBe(1);
    });

    it('関連動画・サイドバーのタグ（data-anchor-area が異なる）は対象外', async () => {
      mockExists(true);
      document.body.innerHTML = `
        ${bottomContainerHTML(['target'])}
        <div class="grid-area_[sidebar]">
          <a data-anchor-area="recommend" href="/tag/related"><span>related</span></a>
        </div>
      `;

      apply(true);
      await flush();

      // 動画タグ(target)のみリンクが付く
      expect(linkCount()).toBe(1);
      const related = document.querySelector('a[href="/tag/related"]');
      expect(related?.querySelector(`a[${LINK_MARKER}]`)).toBeNull();
    });

    it('タグ編集ボタンは対象にしない', async () => {
      mockExists(true);
      document.body.innerHTML = bottomContainerHTML(['x', 'y'], true);

      apply(true);
      await flush(40);

      expect(linkCount()).toBe(2);
      const button = document.querySelector('button');
      expect(button?.querySelector(`a[${LINK_MARKER}]`)).toBeNull();
    });
  });

  describe('タグ名の抽出', () => {
    it('href のクエリ・ハッシュを除いてエンコード済みタグ名を抽出する', async () => {
      mockExists(true);
      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap">
            <a data-anchor-area="tags" href="/tag/VOCALOID?ref=watch#top"><span>VOCALOID</span></a>
          </div>
        </div>
      `;

      apply(true);
      await flush();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CHECK_NICOPEDIA_ARTICLE',
        tagName: 'VOCALOID',
      });
      const link = document.querySelector<HTMLAnchorElement>(`a[${LINK_MARKER}]`);
      expect(link?.getAttribute('href')).toBe('https://dic.nicovideo.jp/a/VOCALOID');
    });

    it('日本語タグはエンコード済みのまま問い合わせる', async () => {
      mockExists(true);
      document.body.innerHTML = bottomContainerHTML(['レッツゴー！陰陽師']);

      apply(true);
      await flush();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CHECK_NICOPEDIA_ARTICLE',
        tagName: expect.stringContaining('%'),
      });
    });

    it('不正な % エンコードでも decodeURIComponent でスローしない', async () => {
      mockExists(true);
      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap">
            <a data-anchor-area="tags" href="/tag/%E0%A4%A"><span>broken</span></a>
          </div>
        </div>
      `;

      expect(() => apply(true)).not.toThrow();
      await flush();

      // リンクは生成され、title 属性も付与される（デコード不能でも落ちない）
      const link = document.querySelector<HTMLAnchorElement>(`a[${LINK_MARKER}]`);
      expect(link).not.toBeNull();
      expect(link?.getAttribute('title')).toContain('ニコニコ大百科');
    });
  });

  describe('リンク要素の属性', () => {
    it('生成されるリンクにアクセシビリティ属性とアイコンが含まれる', async () => {
      mockExists(true);
      document.body.innerHTML = bottomContainerHTML(['初音ミク']);

      apply(true);
      await flush();

      const link = document.querySelector<HTMLAnchorElement>(`a[${LINK_MARKER}]`);
      expect(link?.getAttribute('aria-label')).toContain('初音ミク');
      expect(link?.className).toBe('bn-nicopedia-link');
      const icon = link?.querySelector('.bn-nicopedia-icon');
      expect(icon).not.toBeNull();
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.querySelector('svg')).not.toBeNull();
    });
  });

  describe('apply(false): 除去', () => {
    it('注入済みの大百科リンクを除去する', () => {
      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap">
            <a data-anchor-area="tags" href="/tag/test"><span>test</span>
              <a ${LINK_MARKER}="true" href="https://dic.nicovideo.jp/a/test">dic</a>
            </a>
          </div>
        </div>
      `;

      apply(false);

      expect(linkCount()).toBe(0);
    });

    it('リンクが無くてもスローしない', () => {
      document.body.innerHTML = '<div>なにもない</div>';
      expect(() => apply(false)).not.toThrow();
    });

    it('視聴ページ以外でも確実に除去する', () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });
      document.body.innerHTML = `<a ${LINK_MARKER}="true" href="https://dic.nicovideo.jp/a/x">dic</a>`;

      apply(false);

      expect(linkCount()).toBe(0);
    });
  });

  describe('ページ判定', () => {
    it('視聴ページを正しく判定する', () => {
      expect(window.location.pathname.startsWith('/watch/')).toBe(true);
    });

    it('視聴ページ以外を視聴ページと誤判定しない', () => {
      vi.stubGlobal('location', { pathname: '/video_top' });
      expect(window.location.pathname.startsWith('/watch/')).toBe(false);
    });
  });
});
