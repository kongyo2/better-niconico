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
  return (
    window.location.hostname === 'garage.nicovideo.jp' &&
    window.location.pathname.includes('/allegation/')
  );
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
  container.style.cssText = `
    margin-bottom: 16px;
    padding: 12px;
    background-color: #f0f8ff;
    border: 1px solid #b0d4ff;
    border-radius: 4px;
  `;

  const label = document.createElement('label');
  label.textContent = '定型文を使用：';
  label.style.cssText = `
    display: block;
    margin-bottom: 8px;
    font-weight: bold;
    font-size: 14px;
    color: #333;
  `;

  const select = document.createElement('select');
  select.setAttribute(DROPDOWN_MARKER, 'true');
  select.style.cssText = `
    width: 100%;
    padding: 8px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background-color: white;
    cursor: pointer;
  `;

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
  noteText.textContent = '※ 定型文を選択すると、フォームに自動入力されます。内容を確認・編集してから送信してください。';
  noteText.style.cssText = `
    margin-top: 8px;
    margin-bottom: 0;
    font-size: 12px;
    color: #666;
    line-height: 1.5;
  `;

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

  // Find the form (it's after the heading)
  const heading = document.querySelector('h1');
  if (!heading) {
    return; // Page not ready yet
  }

  // Find the parent element that contains the form
  const formParent = heading.parentElement;
  if (!formParent) {
    return;
  }

  // Find the 違反項目 select element
  const { reasonSelect } = getFormElements();
  if (!reasonSelect) {
    return; // Form not ready yet
  }

  // Insert dropdown before the "違反項目：" label
  const reasonLabel = Array.from(formParent.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('違反項目：'),
  );

  if (reasonLabel && reasonLabel.parentElement) {
    const dropdown = createDropdown(templates);
    reasonLabel.parentElement.insertBefore(dropdown, reasonLabel);
    console.log('[Better Niconico] 定型文ドロップダウンを追加しました');
  }
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
