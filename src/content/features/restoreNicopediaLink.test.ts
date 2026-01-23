/**
 * Tests for src/content/features/restoreNicopediaLink.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './restoreNicopediaLink';

const MARKER = 'data-bn-nicopedia-processed';
const LINK_MARKER = 'data-bn-nicopedia-link';

describe('restoreNicopediaLink', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    // Mock watch page
    vi.stubGlobal('location', {
      pathname: '/watch/sm12345',
      href: 'https://www.nicovideo.jp/watch/sm12345',
    });
    // Reset chrome.runtime.sendMessage mock
    vi.mocked(chrome.runtime.sendMessage).mockReset();
  });

  describe('apply with enabled=true (add links)', () => {
    it('should not add links when not on watch page', async () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/test">test</a>
          </div>
        </div>
      `;

      apply(true);

      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(0);
    });

    it('should not add links when tag container not found', async () => {
      document.body.innerHTML = '<div>No tag container</div>';

      apply(true);

      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(0);
    });

    it('should add link when article exists', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: true });

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/VOCALOID">VOCALOID</a>
          </div>
        </div>
      `;

      apply(true);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      const processedTag = document.querySelector(`[${MARKER}]`);
      expect(processedTag).not.toBeNull();
    });

    it('should not add link when article does not exist', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: false });

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/nonexistent">nonexistent</a>
          </div>
        </div>
      `;

      apply(true);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(0);
    });

    it('should skip already processed tags', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: true });

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/test" ${MARKER}="true">test</a>
          </div>
        </div>
      `;

      apply(true);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not call sendMessage for already processed tag
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle sendMessage error gracefully', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Connection error'));

      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/test">test</a>
          </div>
        </div>
      `;

      expect(() => apply(true)).not.toThrow();

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });

  describe('apply with enabled=false (remove links)', () => {
    it('should remove existing nicopedia links', () => {
      document.body.innerHTML = `
        <div class="grid-area_[bottom]">
          <div class="d_flex flex-wrap_wrap gap_base">
            <a href="/tag/test" ${MARKER}="true">
              test
              <a ${LINK_MARKER}="true" href="https://dic.nicovideo.jp/a/test">dic</a>
            </a>
          </div>
        </div>
      `;

      apply(false);

      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(0);

      // Marker should also be removed
      const markers = document.querySelectorAll(`[${MARKER}]`);
      expect(markers.length).toBe(0);
    });

    it('should not throw when no links exist', () => {
      document.body.innerHTML = '<div>No links</div>';

      expect(() => apply(false)).not.toThrow();
    });

    it('should not run on non-watch pages', () => {
      vi.stubGlobal('location', {
        pathname: '/video_top',
        href: 'https://www.nicovideo.jp/video_top',
      });

      document.body.innerHTML = `
        <a ${LINK_MARKER}="true">Link</a>
        <a ${MARKER}="true">Tag</a>
      `;

      apply(false);

      // Links should still exist because we're not on watch page
      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(1);
    });
  });

  describe('page detection', () => {
    it('should detect watch page correctly', () => {
      expect(window.location.pathname.startsWith('/watch/')).toBe(true);
    });

    it('should not detect other pages as watch page', () => {
      vi.stubGlobal('location', { pathname: '/video_top' });
      expect(window.location.pathname.startsWith('/watch/')).toBe(false);
    });
  });

  /**
   * 実際のニコニコ動画ページのDOM構造に基づくテスト
   *
   * 実際の構造:
   * .grid-area_[bottom]
   *   └── div.pos_relative.d_flex.flex-wrap_wrap.gap_base  ← タグコンテナ
   *         └── a[data-scope="hover-card"]
   *               └── <span>タグ名</span>
   */
  describe('realistic DOM structure', () => {
    /**
     * 実際のニコニコ動画のタグリンク構造を再現
     * 実際のクラス: d_inline-flex h_x4 px_x2 ai_center bdr_full bg-c_action.base
     *              flex-wrap_nowrap fw_bold ov_hidden [&:...]
     * 実際の属性: data-scope, data-part, dir, id, data-state, data-anchor-*
     */
    function createRealisticTagHTML(tagName: string, encoded?: string): string {
      const encodedName = encoded || encodeURIComponent(tagName);
      const uniqueId = `hover-card:test-${Math.random().toString(36).slice(2)}:trigger`;
      return `
        <a data-scope="hover-card" data-part="trigger"
           dir="ltr" id="${uniqueId}" data-state="closed"
           data-anchor="1" data-anchor-page="watch" data-anchor-area="tags"
           data-anchor-href="/tag/${encodedName}"
           class="d_inline-flex h_x4 px_x2 ai_center bdr_full bg-c_action.base flex-wrap_nowrap fw_bold ov_hidden"
           href="/tag/${encodedName}">
          <span>${tagName}</span>
        </a>
      `;
    }

    /**
     * 実際のニコニコ動画のタグコンテナ構造を再現
     */
    function createRealisticTagContainerHTML(tags: string[]): string {
      const tagsHTML = tags.map((t) => createRealisticTagHTML(t)).join('');
      return `
        <div class="grid-area_[bottom] d_flex flex-d_column gap_x2">
          <div class="d_flex jc_space-between ai_flex-start">タイトル等</div>
          <div class="pos_relative d_flex flex-wrap_wrap gap_base">
            ${tagsHTML}
          </div>
          <section>コメント等</section>
        </div>
      `;
    }

    it('should find tag container with realistic class structure', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: true });

      document.body.innerHTML = createRealisticTagContainerHTML(['VOCALOID', '初音ミク']);

      apply(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const processedTags = document.querySelectorAll(`[${MARKER}]`);
      expect(processedTags.length).toBe(2);
    });

    it('should add link to tags with span children', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: true });

      document.body.innerHTML = createRealisticTagContainerHTML(['陰陽師']);

      apply(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const link = document.querySelector(`[${LINK_MARKER}]`);
      expect(link).not.toBeNull();

      // リンクがタグアンカー内に追加されていることを確認
      const tagAnchor = document.querySelector('a[href*="/tag/"]');
      expect(tagAnchor?.querySelector(`[${LINK_MARKER}]`)).not.toBeNull();
    });

    it('should handle tags with data-scope="hover-card" attribute', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: true });

      document.body.innerHTML = createRealisticTagContainerHTML(['公式']);

      apply(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const processedTag = document.querySelector(`[${MARKER}]`);
      expect(processedTag).not.toBeNull();
      expect(processedTag?.getAttribute('data-scope')).toBe('hover-card');
    });

    it('should extract tag name from href correctly', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: true });

      // URL encoded tag name
      document.body.innerHTML = createRealisticTagContainerHTML(['レッツゴー！陰陽師']);

      apply(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // sendMessageが正しいエンコード済みタグ名で呼ばれたか確認
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CHECK_NICOPEDIA_ARTICLE',
        tagName: expect.stringContaining('%'),
      });
    });

    it('should work with mix of tags with and without articles', async () => {
      // 全てのモックをリセット
      vi.mocked(chrome.runtime.sendMessage).mockReset();

      // ユニークなタグ名を使用（キャッシュの影響を避ける）
      const uniqueTag1 = 'unique_tag_exists_1_' + Date.now();
      const uniqueTag2 = 'unique_tag_not_exists_' + Date.now();
      const uniqueTag3 = 'unique_tag_exists_2_' + Date.now();

      vi.mocked(chrome.runtime.sendMessage)
        .mockResolvedValueOnce({ exists: true }) // 1つ目: 記事あり
        .mockResolvedValueOnce({ exists: false }) // 2つ目: 記事なし
        .mockResolvedValueOnce({ exists: true }); // 3つ目: 記事あり

      document.body.innerHTML = createRealisticTagContainerHTML([
        uniqueTag1,
        uniqueTag2,
        uniqueTag3,
      ]);

      apply(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 全てのタグが処理されたことを確認
      const processedTags = document.querySelectorAll(`[${MARKER}]`);
      expect(processedTags.length).toBe(3);

      // 記事がある2つのタグにのみリンクが追加される
      const links = document.querySelectorAll(`[${LINK_MARKER}]`);
      expect(links.length).toBe(2);
    });

    it('should not affect tags outside grid-area_[bottom]', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ exists: true });

      document.body.innerHTML = `
        ${createRealisticTagContainerHTML(['ターゲットタグ'])}
        <div class="sidebar">
          <a href="/tag/other">関連タグ</a>
        </div>
      `;

      apply(true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // grid-area_[bottom]内のタグのみ処理される
      const processedTags = document.querySelectorAll(`[${MARKER}]`);
      expect(processedTags.length).toBe(1);

      // サイドバーのタグは処理されない
      const sidebarTag = document.querySelector('.sidebar a');
      expect(sidebarTag?.hasAttribute(MARKER)).toBe(false);
    });
  });
});
