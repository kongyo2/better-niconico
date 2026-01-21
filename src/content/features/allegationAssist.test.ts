/**
 * Tests for src/content/features/allegationAssist.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apply } from './allegationAssist';
import { setMockStorageData, resetChromeMocks } from '../../test/setup';
import { STORAGE_KEY, DEFAULT_ALLEGATION_TEMPLATES } from '../../types/settings';

const DROPDOWN_MARKER = 'data-bn-allegation-dropdown';
const CONTAINER_MARKER = 'data-bn-allegation-container';

describe('allegationAssist', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    // Reset mocks
    resetChromeMocks();
    // Set default storage
    setMockStorageData({
      [STORAGE_KEY]: {
        enableAllegationAssist: true,
        allegationTemplates: DEFAULT_ALLEGATION_TEMPLATES,
      },
    });
  });

  describe('page detection', () => {
    it('should not apply when not on allegation page', async () => {
      vi.stubGlobal('location', {
        hostname: 'www.nicovideo.jp',
        pathname: '/watch/sm12345',
        href: 'https://www.nicovideo.jp/watch/sm12345',
      });

      document.body.innerHTML = `
        <select name="reason_id"></select>
        <input type="radio" name="content_type" value="1">
        <textarea name="comment"></textarea>
      `;

      await apply(true);

      const dropdown = document.querySelector(`[${CONTAINER_MARKER}]`);
      expect(dropdown).toBeNull();
    });

    it('should apply when on allegation page', async () => {
      vi.stubGlobal('location', {
        hostname: 'garage.nicovideo.jp',
        pathname: '/allegation/video/sm12345',
        href: 'https://garage.nicovideo.jp/allegation/video/sm12345',
      });

      document.body.innerHTML = `
        <div>
          <select name="reason_id">
            <option value="91">その他</option>
          </select>
          <input type="radio" name="content_type" value="1">
          <input type="radio" name="content_type" value="2">
          <input type="radio" name="content_type" value="3">
          <textarea name="comment"></textarea>
        </div>
      `;

      await apply(true);

      const dropdown = document.querySelector(`[${CONTAINER_MARKER}]`);
      expect(dropdown).not.toBeNull();
    });
  });

  describe('apply with enabled=true', () => {
    beforeEach(() => {
      vi.stubGlobal('location', {
        hostname: 'garage.nicovideo.jp',
        pathname: '/allegation/video/sm12345',
        href: 'https://garage.nicovideo.jp/allegation/video/sm12345',
      });
    });

    it('should create dropdown with template options', async () => {
      document.body.innerHTML = `
        <div>
          <select name="reason_id">
            <option value="91">その他</option>
          </select>
          <input type="radio" name="content_type" value="1">
          <textarea name="comment"></textarea>
        </div>
      `;

      await apply(true);

      const select = document.querySelector(`[${DROPDOWN_MARKER}]`) as HTMLSelectElement;
      expect(select).not.toBeNull();
      // Should have placeholder + templates
      expect(select.options.length).toBeGreaterThan(1);
    });

    it('should not create duplicate dropdown', async () => {
      document.body.innerHTML = `
        <div>
          <select name="reason_id"></select>
          <input type="radio" name="content_type" value="1">
          <textarea name="comment"></textarea>
        </div>
      `;

      await apply(true);
      await apply(true);

      const dropdowns = document.querySelectorAll(`[${CONTAINER_MARKER}]`);
      expect(dropdowns.length).toBe(1);
    });

    it('should not add dropdown when form elements missing', async () => {
      document.body.innerHTML = '<div>No form elements</div>';

      await apply(true);

      const dropdown = document.querySelector(`[${CONTAINER_MARKER}]`);
      expect(dropdown).toBeNull();
    });

    it('should apply template when selected', async () => {
      document.body.innerHTML = `
        <div>
          <select name="reason_id">
            <option value="91">その他</option>
          </select>
          <input type="radio" name="content_type" value="1">
          <input type="radio" name="content_type" value="2">
          <input type="radio" name="content_type" value="3">
          <textarea name="comment"></textarea>
        </div>
      `;

      await apply(true);

      const select = document.querySelector(`[${DROPDOWN_MARKER}]`) as HTMLSelectElement;
      expect(select).not.toBeNull();

      // Select a template (index 1 is first actual template, 0 is placeholder)
      select.value = DEFAULT_ALLEGATION_TEMPLATES[0].id;
      select.dispatchEvent(new Event('change'));

      // Check form was filled
      const commentTextarea = document.querySelector('textarea[name="comment"]') as HTMLTextAreaElement;
      expect(commentTextarea.value).toBe(DEFAULT_ALLEGATION_TEMPLATES[0].comment);

      const reasonSelect = document.querySelector('select[name="reason_id"]') as HTMLSelectElement;
      expect(reasonSelect.value).toBe(DEFAULT_ALLEGATION_TEMPLATES[0].reasonId);
    });

    it('should not apply template for invalid selection', async () => {
      document.body.innerHTML = `
        <div>
          <select name="reason_id"></select>
          <input type="radio" name="content_type" value="1">
          <textarea name="comment"></textarea>
        </div>
      `;

      await apply(true);

      const select = document.querySelector(`[${DROPDOWN_MARKER}]`) as HTMLSelectElement;
      const commentTextarea = document.querySelector('textarea[name="comment"]') as HTMLTextAreaElement;

      // Select invalid template
      select.value = 'nonexistent-id';
      select.dispatchEvent(new Event('change'));

      // Comment should remain empty
      expect(commentTextarea.value).toBe('');
    });

    it('should remove dropdown when templates are empty', async () => {
      setMockStorageData({
        [STORAGE_KEY]: {
          enableAllegationAssist: true,
          allegationTemplates: [],
        },
      });

      document.body.innerHTML = `
        <div ${CONTAINER_MARKER}="true">Existing dropdown</div>
        <div>
          <select name="reason_id"></select>
          <input type="radio" name="content_type" value="1">
          <textarea name="comment"></textarea>
        </div>
      `;

      await apply(true);

      const dropdown = document.querySelector(`[${CONTAINER_MARKER}]`);
      expect(dropdown).toBeNull();
    });
  });

  describe('apply with enabled=false', () => {
    beforeEach(() => {
      vi.stubGlobal('location', {
        hostname: 'garage.nicovideo.jp',
        pathname: '/allegation/video/sm12345',
        href: 'https://garage.nicovideo.jp/allegation/video/sm12345',
      });
    });

    it('should remove existing dropdown', async () => {
      document.body.innerHTML = `
        <div ${CONTAINER_MARKER}="true">
          <select ${DROPDOWN_MARKER}="true"></select>
        </div>
      `;

      await apply(false);

      const dropdown = document.querySelector(`[${CONTAINER_MARKER}]`);
      expect(dropdown).toBeNull();
    });

    it('should not throw when no dropdown exists', async () => {
      document.body.innerHTML = '<div>No dropdown</div>';

      await expect(apply(false)).resolves.not.toThrow();
    });
  });

  describe('dropdown UI', () => {
    beforeEach(() => {
      vi.stubGlobal('location', {
        hostname: 'garage.nicovideo.jp',
        pathname: '/allegation/video/sm12345',
        href: 'https://garage.nicovideo.jp/allegation/video/sm12345',
      });
    });

    it('should have label element', async () => {
      document.body.innerHTML = `
        <div>
          <select name="reason_id"></select>
          <input type="radio" name="content_type" value="1">
          <textarea name="comment"></textarea>
        </div>
      `;

      await apply(true);

      const container = document.querySelector(`[${CONTAINER_MARKER}]`);
      const label = container?.querySelector('.bn-allegation-assist-label');
      expect(label).not.toBeNull();
      expect(label?.textContent).toBe('定型文を使用：');
    });

    it('should have note text', async () => {
      document.body.innerHTML = `
        <div>
          <select name="reason_id"></select>
          <input type="radio" name="content_type" value="1">
          <textarea name="comment"></textarea>
        </div>
      `;

      await apply(true);

      const container = document.querySelector(`[${CONTAINER_MARKER}]`);
      const note = container?.querySelector('.bn-allegation-assist-note');
      expect(note).not.toBeNull();
      expect(note?.textContent).toContain('定型文を選択すると');
    });

    it('should have placeholder option as first option', async () => {
      document.body.innerHTML = `
        <div>
          <select name="reason_id"></select>
          <input type="radio" name="content_type" value="1">
          <textarea name="comment"></textarea>
        </div>
      `;

      await apply(true);

      const select = document.querySelector(`[${DROPDOWN_MARKER}]`) as HTMLSelectElement;
      // Verify first option is placeholder
      expect(select.options[0].disabled).toBe(true);
      expect(select.options[0].textContent).toBe('-- 定型文を選択してください --');
    });
  });
});
