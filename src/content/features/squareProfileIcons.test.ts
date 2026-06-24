/**
 * Tests for src/content/features/squareProfileIcons.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { apply } from './squareProfileIcons';

const SQUARE_ICONS_CLASS = 'bn-square-icons';

describe('squareProfileIcons', () => {
  let consoleLogSpy: MockInstance;

  beforeEach(() => {
    // Reset body classes before each test
    document.body.className = '';
    document.body.innerHTML = '';
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('apply', () => {
    it('should add class when enabled is true', () => {
      apply(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);
    });

    it('should not add duplicate class when already enabled', () => {
      apply(true);
      apply(true);
      // Count occurrences of the class
      const classCount = document.body.className
        .split(' ')
        .filter((c) => c === SQUARE_ICONS_CLASS).length;
      expect(classCount).toBe(1);
    });

    it('should remove class when enabled is false', () => {
      document.body.classList.add(SQUARE_ICONS_CLASS);
      apply(false);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(false);
    });

    it('should not throw when removing non-existent class', () => {
      expect(() => apply(false)).not.toThrow();
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(false);
    });

    it('should toggle class correctly', () => {
      // Enable
      apply(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      // Disable
      apply(false);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(false);

      // Enable again
      apply(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);
    });
  });

  describe('console logging', () => {
    it('should log message when enabling square icons', () => {
      apply(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Better Niconico] プロフィールアイコンを四角型に変更しました',
      );
    });

    it('should log message when disabling square icons', () => {
      document.body.classList.add(SQUARE_ICONS_CLASS);
      apply(false);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Better Niconico] プロフィールアイコンを丸型に戻しました',
      );
    });

    it('should not log when already enabled', () => {
      document.body.classList.add(SQUARE_ICONS_CLASS);
      apply(true);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log when already disabled', () => {
      apply(false);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('realistic DOM structure from actual site (2026-01)', () => {
    it('should apply class with header profile icon present', () => {
      // ヘッダーのプロフィールアイコン構造（実際のニコニコ動画から取得）
      document.body.innerHTML = `
        <div class="nico-CommonHeaderRoot">
          <div class="common-header-k9169b">
            <img class="common-header-1h5huqo"
                 src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank_s.jpg"
                 alt="ユーザーアイコン">
          </div>
        </div>
      `;

      apply(true);

      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      // CSSセレクタがマッチする要素が存在することを確認
      const headerIcon = document.querySelector('.nico-CommonHeaderRoot .common-header-1h5huqo');
      expect(headerIcon).not.toBeNull();
    });

    it('should apply class with content user icons present', () => {
      // コンテンツ内のユーザーアイコン構造（動画投稿者）
      document.body.innerHTML = `
        <div class="video-owner">
          <a href="/user/4">
            <img class="bdr_full ov_hidden contain_content_size w_x6 min-w_x6 h_x6"
                 src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg"
                 alt="中の">
          </a>
        </div>
      `;

      apply(true);

      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      // CSSセレクタがマッチする要素が存在することを確認
      const userIcon = document.querySelector('.bdr_full[src*="nicoaccount/usericon"]');
      expect(userIcon).not.toBeNull();
    });

    it('should apply class with channel icons present', () => {
      // チャンネルアイコン構造
      document.body.innerHTML = `
        <div class="channel-info">
          <a href="/channel/ch2649942">
            <img class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3"
                 src="https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/128x128/ch2649942.jpg"
                 alt="チャンネルアイコン">
          </a>
        </div>
      `;

      apply(true);

      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      // CSSセレクタがマッチする要素が存在することを確認
      const channelIcon = document.querySelector('.bdr_full[src*="comch/channel-icon"]');
      expect(channelIcon).not.toBeNull();
    });

    it('should apply class with recommended video user icons', () => {
      // おすすめ動画一覧のユーザーアイコン構造
      document.body.innerHTML = `
        <div class="recommended-videos">
          <div class="video-item">
            <a href="/user/10227291" class="hover:c_action.primaryAzure d_flex gap_x0_5 ai_center text-layer_mediumEm w_fit-content">
              <img class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3"
                   src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1022/10227291.jpg?1553653860"
                   alt="バイヤー高橋">
              <span>バイヤー高橋</span>
            </a>
          </div>
          <div class="video-item">
            <a href="/user/179610" class="hover:c_action.primaryAzure d_flex gap_x0_5 ai_center text-layer_mediumEm w_fit-content">
              <img class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3"
                   src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg"
                   alt="うっひー">
              <span>うっひー</span>
            </a>
          </div>
        </div>
      `;

      apply(true);

      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      // 全てのユーザーアイコンがセレクタにマッチすることを確認
      const userIcons = document.querySelectorAll('.bdr_full[src*="nicoaccount/usericon"]');
      expect(userIcons.length).toBe(2);
    });

    it('should apply class with tab user icon (投稿者タブ)', () => {
      // 投稿動画タブのアイコン構造（ml_-x1_5クラス付き）
      document.body.innerHTML = `
        <div class="tab-container">
          <button class="d_flex jc_center ai_center pl_x2 pr_x2 fs_s fw_bold bg-c_tab.base" data-selected>
            <img class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3 ml_-x1_5 mr_x0_5"
                 src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg"
                 alt="中の">
            <span>中の の投稿動画</span>
          </button>
        </div>
      `;

      apply(true);

      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      // ml_-x1_5クラスを持つアイコンもセレクタにマッチすることを確認
      const tabIcon = document.querySelector('.bdr_full.ml_-x1_5[src*="nicoaccount/usericon"]');
      expect(tabIcon).not.toBeNull();
    });

    it('should apply class with video page complete DOM structure', () => {
      // 動画ページの完全なDOM構造（2026年1月時点）
      document.body.innerHTML = `
        <!-- ヘッダー -->
        <div class="nico-CommonHeaderRoot">
          <div class="common-header-k9169b">
            <img class="common-header-1h5huqo"
                 src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/1234567.jpg"
                 alt="ログインユーザー">
          </div>
        </div>

        <!-- メインコンテンツ -->
        <main>
          <!-- 動画投稿者情報 -->
          <div class="video-owner-section">
            <a href="/user/4" class="hover:c_action.primaryAzure pos_relative z_[0]">
              <img class="bdr_full ov_hidden contain_content_size w_x6 min-w_x6 h_x6"
                   src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg"
                   alt="中の">
            </a>
            <span>中の</span>
          </div>

          <!-- おすすめ動画 -->
          <div class="recommended-section">
            <div class="video-card">
              <a href="/user/5240997" class="hover:c_action.primaryAzure d_flex gap_x0_5 ai_center">
                <img class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3"
                     src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/524/5240997.jpg"
                     alt="百花 繚乱">
                <span>百花 繚乱</span>
              </a>
            </div>

            <!-- チャンネル動画 -->
            <div class="video-card">
              <a href="/channel/ch2649942" class="hover:c_action.primaryAzure d_flex gap_x0_5 ai_center">
                <img class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3"
                     src="https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/128x128/ch2649942.jpg"
                     alt="野原ひろし 昼メシの流儀">
                <span>野原ひろし 昼メシの流儀</span>
              </a>
            </div>
          </div>

          <!-- タブ -->
          <div class="tabs-section">
            <button class="tab-button" data-selected>
              <img class="bdr_full ov_hidden contain_content_size w_x3 min-w_x3 h_x3 ml_-x1_5 mr_x0_5"
                   src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg"
                   alt="中の">
              <span>中の の投稿動画</span>
            </button>
          </div>
        </main>
      `;

      apply(true);

      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      // 全ての種類のアイコンがセレクタにマッチすることを確認
      const headerIcon = document.querySelector('.nico-CommonHeaderRoot .common-header-1h5huqo');
      const ownerIcon = document.querySelector(
        '.video-owner-section .bdr_full[src*="nicoaccount/usericon"]',
      );
      const recommendedIcons = document.querySelectorAll(
        '.recommended-section .bdr_full[src*="nicoaccount/usericon"]',
      );
      const channelIcon = document.querySelector('.bdr_full[src*="comch/channel-icon"]');
      const tabIcon = document.querySelector('.bdr_full.ml_-x1_5[src*="nicoaccount/usericon"]');

      expect(headerIcon).not.toBeNull();
      expect(ownerIcon).not.toBeNull();
      expect(recommendedIcons.length).toBe(1);
      expect(channelIcon).not.toBeNull();
      expect(tabIcon).not.toBeNull();
    });

    it('should correctly toggle with realistic DOM', () => {
      document.body.innerHTML = `
        <div class="nico-CommonHeaderRoot">
          <img class="common-header-1h5huqo"
               src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/1234567.jpg">
        </div>
        <img class="bdr_full" src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg">
      `;

      // 有効化
      apply(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      // 無効化
      apply(false);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(false);

      // 再有効化
      apply(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);
    });
  });

  describe('CSS selector coverage verification', () => {
    it('should match header icon selectors from CSS', () => {
      // CSSで定義されているヘッダーアイコンセレクタのテスト
      // body.bn-square-icons .nico-CommonHeaderRoot .common-header-1h5huqo
      document.body.innerHTML = `
        <div class="nico-CommonHeaderRoot">
          <img class="common-header-1h5huqo" src="test.jpg">
          <img class="common-header-ws8uen" src="test.jpg">
          <img class="common-header-1cb8wce" src="test.jpg">
          <img class="common-header-n6q0ln" src="test.jpg">
        </div>
      `;

      apply(true);

      // セレクタがマッチする要素を確認
      const selectors = [
        'body.bn-square-icons .nico-CommonHeaderRoot .common-header-1h5huqo',
        'body.bn-square-icons .nico-CommonHeaderRoot .common-header-ws8uen',
        'body.bn-square-icons .nico-CommonHeaderRoot .common-header-1cb8wce',
        'body.bn-square-icons .nico-CommonHeaderRoot .common-header-n6q0ln',
      ];

      selectors.forEach((selector) => {
        const element = document.querySelector(selector);
        expect(element).not.toBeNull();
      });
    });

    it('should match content icon selectors from CSS', () => {
      // CSSで定義されているコンテンツアイコンセレクタのテスト
      document.body.innerHTML = `
        <img class="bdr_full" src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/456.jpg">
        <img class="bdr_full" src="https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/ch123.jpg">
        <img class="other" src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/789.jpg">
      `;

      apply(true);

      // bdr_fullクラスを持つユーザーアイコン
      const userIcon = document.querySelector(
        'body.bn-square-icons .bdr_full[src*="nicoaccount/usericon"]',
      );
      expect(userIcon).not.toBeNull();

      // bdr_fullクラスを持つチャンネルアイコン
      const channelIcon = document.querySelector(
        'body.bn-square-icons .bdr_full[src*="comch/channel-icon"]',
      );
      expect(channelIcon).not.toBeNull();

      // bdr_fullクラスを持たないアイコンもimg[src*=]セレクタにはマッチする
      const genericUserIcon = document.querySelector(
        'body.bn-square-icons img[src*="nicoaccount/usericon"]',
      );
      expect(genericUserIcon).not.toBeNull();
    });

    it('should match lazy-loaded icon selectors (data-src)', () => {
      // 遅延読み込みアイコンのテスト
      document.body.innerHTML = `
        <img class="bdr_full" data-src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/456.jpg">
        <img class="bdr_full" srcset="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/456.jpg 1x">
      `;

      apply(true);

      // data-src属性を持つアイコン
      const dataSrcIcon = document.querySelector(
        'body.bn-square-icons img.bdr_full[data-src*="nicoaccount/usericon"]',
      );
      expect(dataSrcIcon).not.toBeNull();

      // srcset属性を持つアイコン
      const srcsetIcon = document.querySelector(
        'body.bn-square-icons img.bdr_full[srcset*="nicoaccount/usericon"]',
      );
      expect(srcsetIcon).not.toBeNull();
    });

    it('should match generic img selectors without bdr_full class', () => {
      // bdr_fullクラスを持たないアイコンのテスト（汎用セレクタ）
      document.body.innerHTML = `
        <img src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/456.jpg">
        <img data-src="https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/ch123.jpg">
      `;

      apply(true);

      // クラスなしのユーザーアイコン
      const userIcon = document.querySelector(
        'body.bn-square-icons img[src*="nicoaccount/usericon"]',
      );
      expect(userIcon).not.toBeNull();

      // クラスなしのチャンネルアイコン（data-src）
      const channelIcon = document.querySelector(
        'body.bn-square-icons img[data-src*="comch/channel-icon"]',
      );
      expect(channelIcon).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty body', () => {
      document.body.innerHTML = '';
      expect(() => apply(true)).not.toThrow();
      expect(() => apply(false)).not.toThrow();
    });

    it('should handle multiple rapid toggles', () => {
      for (let i = 0; i < 10; i++) {
        apply(true);
        apply(false);
      }
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(false);

      apply(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);
    });

    it('should preserve other body classes', () => {
      document.body.className = 'existing-class another-class';

      apply(true);
      expect(document.body.classList.contains('existing-class')).toBe(true);
      expect(document.body.classList.contains('another-class')).toBe(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(true);

      apply(false);
      expect(document.body.classList.contains('existing-class')).toBe(true);
      expect(document.body.classList.contains('another-class')).toBe(true);
      expect(document.body.classList.contains(SQUARE_ICONS_CLASS)).toBe(false);
    });

    it('should handle icons with escaped characters in URL', () => {
      // エスケープされたURLを持つアイコン
      document.body.innerHTML = `
        <img class="bdr_full" src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/456.jpg?timestamp=12345">
      `;

      apply(true);

      const icon = document.querySelector(
        'body.bn-square-icons .bdr_full[src*="nicoaccount/usericon"]',
      );
      expect(icon).not.toBeNull();
    });

    it('should handle default blank icons', () => {
      // デフォルトのブランクアイコン
      document.body.innerHTML = `
        <img class="bdr_full" src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg">
        <img class="bdr_full" src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank_s.jpg">
      `;

      apply(true);

      const icons = document.querySelectorAll(
        'body.bn-square-icons .bdr_full[src*="nicoaccount/usericon"]',
      );
      expect(icons.length).toBe(2);
    });
  });
});
