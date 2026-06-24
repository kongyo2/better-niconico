import type { BetterNiconicoSettings, AllegationTemplate } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { loadSettings, saveSettings } from '../utils/storage';

// --- Types ---

type SettingCategory = 'video' | 'ui' | 'system';

interface SettingConfig {
  id: keyof BetterNiconicoSettings;
  label: string;
  description: string;
  category: SettingCategory;
  icon?: string; // SVG path d attribute
  actionButton?: {
    label: string;
    onClick: () => void;
  };
}

// --- State ---

let currentSettings: BetterNiconicoSettings = { ...DEFAULT_SETTINGS };
let activeTab: SettingCategory = 'video';
let editingTemplateId: string | null = null;

// --- DOM Elements ---

const settingsContainer = document.getElementById('settingsContainer') as HTMLElement;
const statusMessage = document.getElementById('statusMessage') as HTMLElement;
const versionElement = document.getElementById('version') as HTMLElement;
const tabButtons = document.querySelectorAll('.tab-button');

// Template Editor Elements
const templateEditor = document.getElementById('templateEditor') as HTMLElement;
const templateList = document.getElementById('templateList') as HTMLElement;
const backButton = document.getElementById('backButton') as HTMLElement;
const addTemplateButton = document.getElementById('addTemplateButton') as HTMLElement;
const editFormOverlay = document.getElementById('editFormOverlay') as HTMLElement;
const cancelEditButton = document.getElementById('cancelEditButton') as HTMLElement;
const saveTemplateButton = document.getElementById('saveTemplateButton') as HTMLElement;

// Form Elements
const templateNameInput = document.getElementById('templateName') as HTMLInputElement;
const templateReasonSelect = document.getElementById('templateReason') as HTMLSelectElement;
const templateCommentTextarea = document.getElementById('templateComment') as HTMLTextAreaElement;
const templateTypeRadios = document.querySelectorAll('input[name="templateType"]');

// --- Configuration ---

const SETTINGS_CONFIG: SettingConfig[] = [
  // Video Category
  {
    id: 'enableVideoDownload',
    label: '動画ダウンロード機能',
    description: 'プレイヤーに動画ダウンロードボタンを追加します',
    category: 'video',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  },
  {
    id: 'enableVideoUpscaling',
    label: '動画アップスケーリング',
    description: 'Anime4K-WebGPUを使用して動画を高画質化します',
    category: 'video',
    icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  },
  {
    id: 'enablePictureInPicture',
    label: 'Picture-in-Picture',
    description: 'コメント付きでPiP表示を可能にします',
    category: 'video',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  },
  {
    id: 'enableVideoScreenshot',
    label: 'スクリーンショット',
    description: '現在のフレームをコメント付きで保存します',
    category: 'video',
    icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    id: 'restoreClassicVideoLayout',
    label: 'クラシックレイアウト',
    description: '動画情報をプレイヤー上部に表示します',
    category: 'video',
    icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
  },
  {
    id: 'enableCinematicLighting',
    label: 'シネマティックライティング',
    description: '動画の色をプレイヤー周囲にグロー表示します',
    category: 'video',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  },

  // UI Category
  {
    id: 'hidePremiumSection',
    label: 'プレミアム誘導を非表示',
    description: '「プレミアム会員なら...」セクションを隠します',
    category: 'ui',
    icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    id: 'hideOnAirAnime',
    label: '放送中アニメを非表示',
    description: '「TV放送中のアニメ」セクションを隠します',
    category: 'ui',
    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    id: 'hideShortsButton',
    label: 'ショートボタンを非表示',
    description: 'サイドメニューの「ショート」ボタンを隠します',
    category: 'ui',
    icon: 'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1z M10.5 9.5l4 2.5-4 2.5v-5z',
  },
  {
    id: 'hideNicoAds',
    label: 'ニコニ広告セクションを非表示',
    description: '動画下の広告セクションを隠します',
    category: 'ui',
    icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  },
  {
    id: 'showNicoRankButton',
    label: 'ニコランボタン',
    description: 'サイドバーにランキングサイトへのリンクを追加',
    category: 'ui',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    id: 'showNicoRanWebButton',
    label: 'ニコランWEBボタン',
    description: 'サイドバーにニコランWEB（過去ランキング・動画履歴検索）へのリンクを追加',
    category: 'ui',
    icon: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  },
  {
    id: 'hideSupporterButton',
    label: 'サポーターボタン非表示',
    description: 'サポートボタンと勧誘表示を隠します',
    category: 'ui',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    id: 'restoreNicopediaLink',
    label: '大百科リンクを復元',
    description: '動画タグの横に大百科（百）へのリンクを表示します',
    category: 'ui',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    id: 'squareProfileIcons',
    label: '四角いアイコン',
    description: 'プロフィールアイコンを角丸四角形にします',
    category: 'ui',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  },

  // System Category
  {
    id: 'enableAllegationAssist',
    label: '通報フォーム入力補助',
    description: '通報画面で定型文を選択して自動入力できます',
    category: 'system',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    actionButton: {
      label: '定型文を管理',
      onClick: () => openTemplateEditor(),
    },
  },
];

// --- Functions ---

function showStatus(message: string, duration = 2000) {
  statusMessage.textContent = message;
  statusMessage.classList.add('show');
  setTimeout(() => statusMessage.classList.remove('show'), duration);
}

function createSettingCard(config: SettingConfig): HTMLElement {
  const card = document.createElement('div');
  card.className = 'setting-card';

  const iconHtml = config.icon
    ? `<div class="setting-icon">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="${config.icon}"></path>
         </svg>
       </div>`
    : '';

  let actionButtonHtml = '';
  if (config.actionButton) {
    actionButtonHtml = `<button class="manage-button" id="action-${config.id}">${config.actionButton.label}</button>`;
  }

  card.innerHTML = `
    <div class="setting-info">
      <div class="setting-header">
        ${iconHtml}
        <div class="setting-title">${config.label}</div>
      </div>
      <div class="setting-description">${config.description}</div>
      ${actionButtonHtml}
    </div>
    <label class="toggle">
      <input type="checkbox" id="${config.id}">
      <span class="toggle-slider"></span>
    </label>
  `;

  const checkbox = card.querySelector('input') as HTMLInputElement;
  checkbox.checked = currentSettings[config.id] as boolean;

  checkbox.addEventListener('change', async () => {
    (currentSettings[config.id] as boolean) = checkbox.checked;
    const result = await saveSettings(currentSettings);
    if (result.isOk()) {
      showStatus('設定を保存しました');
    } else {
      console.error('Failed to save:', result.error);
      showStatus('保存に失敗しました');
      checkbox.checked = !checkbox.checked; // Revert
    }
  });

  if (config.actionButton) {
    const actionBtn = card.querySelector(`#action-${config.id}`);
    actionBtn?.addEventListener('click', config.actionButton.onClick);
  }

  return card;
}

function renderSettings() {
  settingsContainer.innerHTML = '';

  const filteredSettings = SETTINGS_CONFIG.filter((config) => config.category === activeTab);

  if (filteredSettings.length === 0) {
    settingsContainer.innerHTML = `
      <div class="empty-state">
        <p>このカテゴリには設定がありません</p>
      </div>
    `;
    return;
  }

  filteredSettings.forEach((config) => {
    settingsContainer.appendChild(createSettingCard(config));
  });
}

function initTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Update active state
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content
      activeTab = (btn.getAttribute('data-tab') as SettingCategory) || 'video';
      renderSettings();
    });
  });
}

// --- Template Editor Functions ---

function openTemplateEditor() {
  renderTemplateList();
  templateEditor.style.display = 'flex';
}

function closeTemplateEditor() {
  templateEditor.style.display = 'none';
}

function renderTemplateList() {
  templateList.innerHTML = '';
  const templates = currentSettings.allegationTemplates || [];

  if (templates.length === 0) {
    templateList.innerHTML = `
      <div class="empty-state">
        <p>定型文がありません</p>
      </div>
    `;
    return;
  }

  templates.forEach((template) => {
    const item = document.createElement('div');
    item.className = 'template-item';

    // Create info container
    const infoDiv = document.createElement('div');
    infoDiv.className = 'template-item-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'template-item-name';
    nameDiv.textContent = template.name; // Safe: uses textContent instead of innerHTML

    const previewDiv = document.createElement('div');
    previewDiv.className = 'template-item-preview';
    previewDiv.textContent = template.comment; // Safe: uses textContent instead of innerHTML

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(previewDiv);

    // Create actions container with buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'template-actions';

    // Edit button
    const editButton = document.createElement('button');
    editButton.className = 'icon-button';
    editButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    `;
    editButton.addEventListener('click', () => openEditForm(template));

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'icon-button';
    deleteButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
      </svg>
    `;
    deleteButton.addEventListener('click', () => deleteTemplate(template.id));

    actionsDiv.appendChild(editButton);
    actionsDiv.appendChild(deleteButton);

    item.appendChild(infoDiv);
    item.appendChild(actionsDiv);
    templateList.appendChild(item);
  });
}

function openEditForm(template?: AllegationTemplate) {
  editingTemplateId = template ? template.id : null;

  // Reset form
  templateNameInput.value = template ? template.name : '';
  templateReasonSelect.value = template ? template.reasonId : '91';
  templateCommentTextarea.value = template ? template.comment : '';

  const typeValue = template ? template.contentType : '3';
  templateTypeRadios.forEach((radio) => {
    (radio as HTMLInputElement).checked = (radio as HTMLInputElement).value === typeValue;
  });

  editFormOverlay.style.display = 'flex';
}

function closeEditForm() {
  editFormOverlay.style.display = 'none';
  editingTemplateId = null;
}

async function saveTemplate() {
  const name = templateNameInput.value.trim();
  const reasonId = templateReasonSelect.value;
  const comment = templateCommentTextarea.value;

  let contentType = '3';
  templateTypeRadios.forEach((radio) => {
    if ((radio as HTMLInputElement).checked) {
      contentType = (radio as HTMLInputElement).value;
    }
  });

  if (!name) {
    alert('テンプレート名を入力してください');
    return;
  }

  const newTemplate: AllegationTemplate = {
    id: editingTemplateId || `template-${Date.now()}`,
    name,
    reasonId,
    contentType,
    comment,
  };

  let templates = [...(currentSettings.allegationTemplates || [])];

  if (editingTemplateId) {
    // Update existing
    templates = templates.map((t) => (t.id === editingTemplateId ? newTemplate : t));
  } else {
    // Add new
    templates.push(newTemplate);
  }

  currentSettings.allegationTemplates = templates;

  const result = await saveSettings(currentSettings);
  if (result.isOk()) {
    showStatus('テンプレートを保存しました');
    closeEditForm();
    renderTemplateList();
  } else {
    console.error('Failed to save:', result.error);
    showStatus('保存に失敗しました');
  }
}

async function deleteTemplate(id: string) {
  if (!confirm('このテンプレートを削除してもよろしいですか？')) {
    return;
  }

  const templates = (currentSettings.allegationTemplates || []).filter((t) => t.id !== id);
  currentSettings.allegationTemplates = templates;

  const result = await saveSettings(currentSettings);
  if (result.isOk()) {
    showStatus('テンプレートを削除しました');
    renderTemplateList();
  } else {
    console.error('Failed to save:', result.error);
    showStatus('削除に失敗しました');
  }
}

function initTemplateEditor() {
  backButton.addEventListener('click', closeTemplateEditor);
  addTemplateButton.addEventListener('click', () => openEditForm());
  cancelEditButton.addEventListener('click', closeEditForm);
  saveTemplateButton.addEventListener('click', () => void saveTemplate());

  // Close modal when clicking outside
  editFormOverlay.addEventListener('click', (e) => {
    if (e.target === editFormOverlay) {
      closeEditForm();
    }
  });
}

async function init() {
  // Display version
  const manifest = chrome.runtime.getManifest();
  versionElement.textContent = `v${manifest.version}`;

  // Load settings
  const result = await loadSettings();
  if (result.isOk()) {
    currentSettings = result.value;
  } else {
    console.error('Failed to load settings:', result.error);
  }

  // Initialize UI
  initTabs();
  initTemplateEditor();
  renderSettings();
}

// Start
init();
