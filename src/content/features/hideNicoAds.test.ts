/**
 * Tests for src/content/features/hideNicoAds.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apply } from './hideNicoAds';

const NICOAD_MARKER = 'data-bn-nicoad-hidden';

describe('hideNicoAds', () => {
  beforeEach(() => {
    // Reset DOM before each test
    document.body.innerHTML = '';
  });

  describe('apply with enabled=true (hide)', () => {
    it('should hide NicoAd section when h1 with "ニコニ広告" exists', () => {
      document.body.innerHTML = `
        <section>
          <h1>ニコニ広告</h1>
          <div>Ad content here</div>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('none');
      expect(section.getAttribute(NICOAD_MARKER)).toBe('true');
    });

    it('should not hide when no h1 with "ニコニ広告" exists', () => {
      document.body.innerHTML = `
        <section>
          <h1>Other heading</h1>
          <div>Other content</div>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).not.toBe('none');
    });

    it('should not throw when no sections exist', () => {
      document.body.innerHTML = '<div>No sections here</div>';

      expect(() => apply(true)).not.toThrow();
    });

    it('should not hide when h1 has "ニコニ広告" but no parent section', () => {
      document.body.innerHTML = `
        <div>
          <h1>ニコニ広告</h1>
        </div>
      `;

      expect(() => apply(true)).not.toThrow();
    });

    it('should not re-hide when already hidden', () => {
      document.body.innerHTML = `
        <section style="display: none" ${NICOAD_MARKER}="true">
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('none');
    });

    it('should not re-hide when display is none but marker is missing', () => {
      document.body.innerHTML = `
        <section style="display: none">
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('none');
      // マーカーは追加されないはず（既にdisplay: noneなので）
    });

    it('should not re-hide when marker exists but display is not none', () => {
      document.body.innerHTML = `
        <section ${NICOAD_MARKER}="true">
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      // マーカーがあるので再度非表示にはしない
      expect(section.getAttribute(NICOAD_MARKER)).toBe('true');
    });

    it('should skip when section textContent does not contain "ニコニ広告" (safeguard)', () => {
      // h1には「ニコニ広告」があるが、セクション全体のtextContentを操作して
      // 「ニコニ広告」を含まないようにするケース（エッジケース）
      document.body.innerHTML = `
        <section>
          <h1>ニコニ広告</h1>
        </section>
      `;

      const section = document.querySelector('section') as HTMLElement;
      // textContentを上書きしてセーフガードをトリガー
      Object.defineProperty(section, 'textContent', {
        get: () => '',
        configurable: true,
      });

      apply(true);

      // セーフガードによりスキップされるので、非表示にならない
      expect(section.style.display).not.toBe('none');
      expect(section.hasAttribute(NICOAD_MARKER)).toBe(false);
    });

    it('should work with multiple h1 elements where only one is "ニコニ広告"', () => {
      document.body.innerHTML = `
        <section>
          <h1>動画の詳細情報</h1>
        </section>
        <section>
          <h1>ニコニ広告</h1>
          <p>広告コンテンツ</p>
        </section>
        <section>
          <h1>コメントリスト</h1>
        </section>
      `;

      apply(true);

      const sections = document.querySelectorAll('section');
      expect((sections[0] as HTMLElement).style.display).not.toBe('none');
      expect((sections[1] as HTMLElement).style.display).toBe('none');
      expect((sections[2] as HTMLElement).style.display).not.toBe('none');
    });

    it('should hide section with realistic DOM structure from actual site', () => {
      document.body.innerHTML = `
        <section class="bg-c_layer.surfaceHighEm bdr_m ov_hidden w_100% p_x3 d_flex flex-d_column gap_x2">
          <div class="d_flex jc_space-between ai_center text-layer_highEm">
            <h1>ニコニ広告</h1>
          </div>
          <p>表示するコンテンツがありません</p>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('none');
      expect(section.getAttribute(NICOAD_MARKER)).toBe('true');
    });

    it('should match partial text containing "ニコニ広告"', () => {
      document.body.innerHTML = `
        <section>
          <h1>ニコニ広告を贈ろう！</h1>
          <div>広告コンテンツ</div>
        </section>
      `;

      apply(true);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('none');
    });

    it('should handle h1 with null textContent gracefully', () => {
      document.body.innerHTML = `
        <section>
          <h1></h1>
        </section>
        <section>
          <h1>ニコニ広告</h1>
        </section>
      `;

      // 最初のh1のtextContentをnullにする
      const firstH1 = document.querySelector('h1') as HTMLElement;
      Object.defineProperty(firstH1, 'textContent', {
        get: () => null,
        configurable: true,
      });

      apply(true);

      const sections = document.querySelectorAll('section');
      // 最初のセクションは影響を受けない
      expect((sections[0] as HTMLElement).style.display).not.toBe('none');
      // 2番目のセクションは非表示になる
      expect((sections[1] as HTMLElement).style.display).toBe('none');
    });
  });

  describe('apply with enabled=false (show)', () => {
    it('should show hidden NicoAd section', () => {
      document.body.innerHTML = `
        <section style="display: none" ${NICOAD_MARKER}="true">
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(false);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('');
      expect(section.hasAttribute(NICOAD_MARKER)).toBe(false);
    });

    it('should not change when already visible', () => {
      document.body.innerHTML = `
        <section>
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(false);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('');
    });

    it('should not throw when section does not exist', () => {
      document.body.innerHTML = '<div>No NicoAd section</div>';

      expect(() => apply(false)).not.toThrow();
    });

    it('should show when display is none but marker is missing', () => {
      document.body.innerHTML = `
        <section style="display: none">
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(false);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('');
    });

    it('should show when marker exists but display is not none', () => {
      document.body.innerHTML = `
        <section ${NICOAD_MARKER}="true">
          <h1>ニコニ広告</h1>
        </section>
      `;

      apply(false);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.hasAttribute(NICOAD_MARKER)).toBe(false);
    });

    it('should restore section with realistic DOM structure', () => {
      document.body.innerHTML = `
        <section class="bg-c_layer.surfaceHighEm bdr_m ov_hidden w_100%" style="display: none" ${NICOAD_MARKER}="true">
          <div class="d_flex jc_space-between ai_center">
            <h1>ニコニ広告</h1>
          </div>
          <p>表示するコンテンツがありません</p>
        </section>
      `;

      apply(false);

      const section = document.querySelector('section') as HTMLElement;
      expect(section.style.display).toBe('');
      expect(section.hasAttribute(NICOAD_MARKER)).toBe(false);
      // クラスは保持される
      expect(section.classList.contains('bg-c_layer.surfaceHighEm')).toBe(true);
    });

    it('should only affect the NicoAd section when multiple sections exist', () => {
      document.body.innerHTML = `
        <section style="display: none">
          <h1>動画の詳細情報</h1>
        </section>
        <section style="display: none" ${NICOAD_MARKER}="true">
          <h1>ニコニ広告</h1>
        </section>
        <section style="display: none">
          <h1>コメントリスト</h1>
        </section>
      `;

      apply(false);

      const sections = document.querySelectorAll('section');
      // 他のセクションは影響を受けない
      expect((sections[0] as HTMLElement).style.display).toBe('none');
      // ニコニ広告セクションのみ表示される
      expect((sections[1] as HTMLElement).style.display).toBe('');
      // 他のセクションは影響を受けない
      expect((sections[2] as HTMLElement).style.display).toBe('none');
    });
  });

  describe('toggle behavior', () => {
    it('should correctly toggle between hide and show', () => {
      document.body.innerHTML = `
        <section>
          <h1>ニコニ広告</h1>
          <p>広告コンテンツ</p>
        </section>
      `;

      const section = document.querySelector('section') as HTMLElement;

      // 初期状態
      expect(section.style.display).toBe('');

      // 非表示にする
      apply(true);
      expect(section.style.display).toBe('none');
      expect(section.getAttribute(NICOAD_MARKER)).toBe('true');

      // 表示する
      apply(false);
      expect(section.style.display).toBe('');
      expect(section.hasAttribute(NICOAD_MARKER)).toBe(false);

      // 再度非表示にする
      apply(true);
      expect(section.style.display).toBe('none');
      expect(section.getAttribute(NICOAD_MARKER)).toBe('true');
    });

    it('should handle rapid toggles correctly', () => {
      document.body.innerHTML = `
        <section>
          <h1>ニコニ広告</h1>
        </section>
      `;

      const section = document.querySelector('section') as HTMLElement;

      // 連続してトグル
      apply(true);
      apply(true);
      apply(true);
      expect(section.style.display).toBe('none');

      apply(false);
      apply(false);
      apply(false);
      expect(section.style.display).toBe('');
    });
  });
});
