/**
 * Tests for src/content/features/hideOnAirAnime.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apply } from './hideOnAirAnime';

const ANIME_SELECTOR = '.OnTvAnimeVideosContainer';
const ANIME_MARKER = 'data-bn-anime-hidden';

describe('hideOnAirAnime', () => {
  beforeEach(() => {
    // Reset DOM before each test
    document.body.innerHTML = '';
  });

  describe('apply with enabled=true (hide)', () => {
    it('should hide anime section when container exists', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>TV放送中のアニメ</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('none');
      expect(parentBlock.getAttribute(ANIME_MARKER)).toBe('true');
    });

    it('should not hide when container does not exist', () => {
      document.body.innerHTML = '<div class="other-content">Other content</div>';

      expect(() => apply(true)).not.toThrow();
    });

    it('should not hide when parent block does not exist', () => {
      document.body.innerHTML = `<div class="${ANIME_SELECTOR.slice(1)}">Content</div>`;

      expect(() => apply(true)).not.toThrow();
    });

    it('should not hide when text does not contain anime keywords', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>Other content without keywords</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).not.toBe('none');
    });

    it('should not re-hide when already hidden', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block" style="display: none" ${ANIME_MARKER}="true">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>TV放送中アニメ</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('none');
    });

    // 実際のページ構造に近いDOMでのテスト
    it('should hide anime section with realistic DOM structure (Separator, ColumnTitle)', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="Separator"></div>
          <div class="OnTvAnimeVideosContainer">
            <div class="ColumnTitle">
              <a href="https://ch.nicovideo.jp/portal/anime" class="ColumnTitle-link">
                <span class="ColumnTitle-icon" title="TV放送中のアニメ"></span>
                <span class="ColumnTitle-text">TV放送中のアニメ</span>
                <span class="ColumnTitle-linkText">もっと見る</span>
              </a>
            </div>
            <div class="OnTvAnimeVideosContainer-list">
              <div class="NC-VideoCardSkeleton"></div>
            </div>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('none');
      expect(parentBlock.getAttribute(ANIME_MARKER)).toBe('true');
    });

    // 複数のBaseLayout-blockが存在する場合
    it('should only hide the correct block when multiple BaseLayout-blocks exist', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block" id="block1">
          <div class="SomeOtherContainer">
            <span>人気の動画</span>
          </div>
        </div>
        <div class="BaseLayout-block" id="block2">
          <div class="Separator"></div>
          <div class="OnTvAnimeVideosContainer">
            <span class="ColumnTitle-text">TV放送中のアニメ</span>
          </div>
        </div>
        <div class="BaseLayout-block" id="block3">
          <div class="NewArrivalVideosContainer">
            <span>新着動画</span>
          </div>
        </div>
      `;

      apply(true);

      const block1 = document.getElementById('block1') as HTMLElement;
      const block2 = document.getElementById('block2') as HTMLElement;
      const block3 = document.getElementById('block3') as HTMLElement;

      expect(block1.style.display).not.toBe('none');
      expect(block2.style.display).toBe('none');
      expect(block2.getAttribute(ANIME_MARKER)).toBe('true');
      expect(block3.style.display).not.toBe('none');
    });

    // キーワード検証の境界テスト - "TV放送中" のみ
    it('should hide when text contains only "TV放送中"', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="OnTvAnimeVideosContainer">
            <span>TV放送中のドラマ</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('none');
    });

    // キーワード検証の境界テスト - "アニメ" のみ
    it('should hide when text contains only "アニメ"', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="OnTvAnimeVideosContainer">
            <span>おすすめアニメ特集</span>
          </div>
        </div>
      `;

      apply(true);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('none');
    });
  });

  describe('apply with enabled=false (show)', () => {
    it('should show hidden anime section', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block" style="display: none" ${ANIME_MARKER}="true">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>TV放送中アニメ</span>
          </div>
        </div>
      `;

      apply(false);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('');
      expect(parentBlock.hasAttribute(ANIME_MARKER)).toBe(false);
    });

    it('should not change when already visible', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="${ANIME_SELECTOR.slice(1)}">
            <span>TV放送中アニメ</span>
          </div>
        </div>
      `;

      apply(false);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('');
    });

    it('should not throw when container does not exist', () => {
      document.body.innerHTML = '<div>Other content</div>';

      expect(() => apply(false)).not.toThrow();
    });

    // 実際の構造での表示テスト
    it('should correctly restore display with realistic DOM structure', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block" style="display: none" ${ANIME_MARKER}="true">
          <div class="Separator"></div>
          <div class="OnTvAnimeVideosContainer">
            <div class="ColumnTitle">
              <span class="ColumnTitle-text">TV放送中のアニメ</span>
            </div>
            <div class="OnTvAnimeVideosContainer-list"></div>
          </div>
        </div>
      `;

      apply(false);

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;
      expect(parentBlock.style.display).toBe('');
      expect(parentBlock.hasAttribute(ANIME_MARKER)).toBe(false);
      // Separator should still be visible
      const separator = parentBlock.querySelector('.Separator');
      expect(separator).not.toBeNull();
    });

    // 複数ブロック存在時の表示復元テスト
    it('should only show the correct block when multiple blocks exist', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block" id="block1">
          <div class="SomeContainer"><span>Other content</span></div>
        </div>
        <div class="BaseLayout-block" id="block2" style="display: none" ${ANIME_MARKER}="true">
          <div class="OnTvAnimeVideosContainer">
            <span>TV放送中アニメ</span>
          </div>
        </div>
        <div class="BaseLayout-block" id="block3">
          <div class="AnotherContainer"><span>Another section</span></div>
        </div>
      `;

      apply(false);

      const block1 = document.getElementById('block1') as HTMLElement;
      const block2 = document.getElementById('block2') as HTMLElement;
      const block3 = document.getElementById('block3') as HTMLElement;

      expect(block1.style.display).toBe('');
      expect(block2.style.display).toBe('');
      expect(block2.hasAttribute(ANIME_MARKER)).toBe(false);
      expect(block3.style.display).toBe('');
    });
  });

  describe('toggle behavior', () => {
    it('should correctly toggle hide and show', () => {
      document.body.innerHTML = `
        <div class="BaseLayout-block">
          <div class="OnTvAnimeVideosContainer">
            <span>TV放送中のアニメ</span>
          </div>
        </div>
      `;

      const parentBlock = document.querySelector('.BaseLayout-block') as HTMLElement;

      // Initial state
      expect(parentBlock.style.display).toBe('');

      // Hide
      apply(true);
      expect(parentBlock.style.display).toBe('none');
      expect(parentBlock.getAttribute(ANIME_MARKER)).toBe('true');

      // Show
      apply(false);
      expect(parentBlock.style.display).toBe('');
      expect(parentBlock.hasAttribute(ANIME_MARKER)).toBe(false);

      // Hide again
      apply(true);
      expect(parentBlock.style.display).toBe('none');
      expect(parentBlock.getAttribute(ANIME_MARKER)).toBe('true');
    });
  });
});
