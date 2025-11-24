// Allegation Form Auto-Fill Assistance
// 通報フォームに定型文入力補助機能を追加

import type { AllegationTemplate } from '../../types/settings';
import { loadSettings } from '../../utils/storage';

// Marker attributes for idempotency
const DROPDOWN_MARKER = 'data-bn-allegation-dropdown';
const CONTAINER_MARKER = 'data-bn-allegation-container';

// Current templates cache
let currentTemplates: AllegationTemplate[] = [];

/**
 * Check if current page is an allegation page
 */
function isAllegationPage(): boolean {
  // Check if current page is an allegation page
  const isPage =
    window.location.hostname === 'garage.nicovideo.jp' &&
    window.location.pathname.includes('/allegation/');

  if (isPage) {
    console.log('[Better Niconico] 通報ページを検出しました');
  }

  return isPage;
}

/**
 * Get form elements
 */
function getFormElements(): {
  reasonSelect: HTMLSelectElement | null;
  contentTypeRadios: HTMLInputElement[];
  commentTextarea: HTMLTextAreaElement | null;
} {
  const reasonSelect = document.querySelector<HTMLSelectElement>('select[name="reason_id"]');
  const contentTypeRadios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="content_type"]'),
  );
  const commentTextarea = document.querySelector<HTMLTextAreaElement>('textarea[name="comment"]');

  return {
    reasonSelect,
    contentTypeRadios,
    commentTextarea,
  };
}

/**
 * Apply template to form
 */
function applyTemplate(template: AllegationTemplate): void {
  const { reasonSelect, contentTypeRadios, commentTextarea } = getFormElements();

  if (!reasonSelect || !commentTextarea || contentTypeRadios.length === 0) {
    console.warn('[Better Niconico] 通報フォームの要素が見つかりませんでした');
    return;
  }

  // Set reason
  reasonSelect.value = template.reasonId;

  // Set content type
  contentTypeRadios.forEach((radio) => {
    radio.checked = radio.value === template.contentType;
  });

  // Set comment
  commentTextarea.value = template.comment;

  console.log('[Better Niconico] 定型文を適用しました:', template.name);
}

/**
 * Create dropdown menu
 */
function createDropdown(templates: AllegationTemplate[]): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute(CONTAINER_MARKER, 'true');
  container.className = 'bn-allegation-assist-container';

  const label = document.createElement('label');
  label.textContent = '定型文を使用：';
  label.className = 'bn-allegation-assist-label';

  const select = document.createElement('select');
  select.setAttribute(DROPDOWN_MARKER, 'true');
  select.className = 'bn-allegation-assist-select';

  // Add placeholder option
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = '-- 定型文を選択してください --';
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  select.appendChild(placeholderOption);

  // Add template options
  templates.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    select.appendChild(option);
  });

  // Add event listener
  select.addEventListener('change', (event) => {
    const selectedId = (event.target as HTMLSelectElement).value;
    const selectedTemplate = templates.find((t) => t.id === selectedId);
    if (selectedTemplate) {
      applyTemplate(selectedTemplate);
    }
  });

  const noteText = document.createElement('p');
  noteText.textContent =
    '※ 定型文を選択すると、フォームに自動入力されます。内容を確認・編集してから送信してください。';
  noteText.className = 'bn-allegation-assist-note';

  container.appendChild(label);
  container.appendChild(select);
  container.appendChild(noteText);

  return container;
}

/**
 * Add dropdown to page
 */
function addDropdownToPage(templates: AllegationTemplate[]): void {
  // Check if already exists
  const existingContainer = document.querySelector(`[${CONTAINER_MARKER}]`);
  if (existingContainer) {
    return; // Already added
  }

  // Find the 違反項目 select element
  const { reasonSelect } = getFormElements();
  if (!reasonSelect) {
    console.log('[Better Niconico] フォーム要素(reasonSelect)が見つかりません');
    return; // Form not ready yet
  }

  // Find the parent element to insert into
  // Usually the select is inside a td or div
  const parent = reasonSelect.parentElement;
  if (!parent) {
    console.log('[Better Niconico] 親要素が見つかりません');
    return;
  }

  // Insert dropdown before the select element
  const dropdown = createDropdown(templates);

  // Try to find a good place to insert
  // If there's a label or text node before the select, we might want to insert before that
  // But inserting directly before the select is the safest fallback

  parent.insertBefore(dropdown, reasonSelect);
  console.log('[Better Niconico] 定型文ドロップダウンを追加しました');
}

/**
 * Remove dropdown from page
 */
function removeDropdown(): void {
  const container = document.querySelector(`[${CONTAINER_MARKER}]`);
  if (container) {
    container.remove();
    console.log('[Better Niconico] 定型文ドロップダウンを削除しました');
  }
}

/**
 * Apply allegation assist feature
 */
export async function apply(enabled: boolean): Promise<void> {
  // Only apply on allegation pages
  if (!isAllegationPage()) {
    removeDropdown();
    return;
  }

  if (enabled) {
    // Load settings to get templates
    const settingsResult = await loadSettings();
    if (settingsResult.isErr()) {
      console.error('[Better Niconico] 設定の読み込みに失敗しました:', settingsResult.error);
      return;
    }

    const settings = settingsResult.value;
    currentTemplates = settings.allegationTemplates || [];

    if (currentTemplates.length === 0) {
      console.warn('[Better Niconico] 定型文テンプレートが設定されていません');
      removeDropdown();
      return;
    }

    addDropdownToPage(currentTemplates);
  } else {
    removeDropdown();
  }
}
