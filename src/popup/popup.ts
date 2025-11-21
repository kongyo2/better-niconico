import type { BetterNiconicoSettings } from '../types/settings';
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
}

// --- Configuration ---

const SETTINGS_CONFIG: SettingConfig[] = [
  // Video Category
  {
    id: 'enableVideoUpscaling',
    label: '動画アップスケーリング',
    description: 'Anime4K-WebGPUを使用して動画を高画質化します',
    category: 'video',
    icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
  },
  {
    id: 'enablePictureInPicture',
    label: 'Picture-in-Picture',
    description: 'コメント付きでPiP表示を可能にします',
    category: 'video',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
  },
  {
    id: 'enableVideoScreenshot',
    label: 'スクリーンショット',
    description: '現在のフレームをコメント付きで保存します',
    category: 'video',
    icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z'
  },
  {
    id: 'enableVideoDownload',
    label: '動画ダウンロード',
    description: 'nicozon.netを使用して動画をダウンロードします',
    category: 'video',
    icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3'
  },
  {
    id: 'restoreClassicVideoLayout',
    label: 'クラシックレイアウト',
    description: '動画情報をプレイヤー上部に表示します',
    category: 'video',
    icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z'
  },

  // UI Category
  {
    id: 'hidePremiumSection',
    label: 'プレミアム誘導を非表示',
    description: '「プレミアム会員なら...」セクションを隠します',
    category: 'ui',
    icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  },
  {
    id: 'hideOnAirAnime',
    label: '放送中アニメを非表示',
    description: '「TV放送中のアニメ」セクションを隠します',
    category: 'ui',
    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
  },
  {
    id: 'hideNicoAds',
    label: 'ニコニ広告セクションを非表示',
    description: '動画下の広告セクションを隠します',
    category: 'ui',
    icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'
  },
  {
    id: 'showNicoRankButton',
    label: 'ニコランボタン',
    description: 'サイドバーにランキングサイトへのリンクを追加',
    category: 'ui',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
  },
  {
    id: 'hideSupporterButton',
    label: 'サポーターボタン非表示',
    description: 'サポートボタンと勧誘表示を隠します',
    category: 'ui',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'
  },
  {
    id: 'squareProfileIcons',
    label: '四角いアイコン',
    description: 'プロフィールアイコンを角丸四角形にします',
    category: 'ui',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
  },
];

// --- State ---

let currentSettings: BetterNiconicoSettings = { ...DEFAULT_SETTINGS };
let activeTab: SettingCategory = 'video';

// --- DOM Elements ---

const settingsContainer = document.getElementById('settingsContainer') as HTMLElement;
const statusMessage = document.getElementById('statusMessage') as HTMLElement;
const versionElement = document.getElementById('version') as HTMLElement;
const tabButtons = document.querySelectorAll('.tab-button');

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

  card.innerHTML = `
    <div class="setting-info">
      <div class="setting-header">
        ${iconHtml}
        <div class="setting-title">${config.label}</div>
      </div>
      <div class="setting-description">${config.description}</div>
    </div>
    <label class="toggle">
      <input type="checkbox" id="${config.id}">
      <span class="toggle-slider"></span>
    </label>
  `;

  const checkbox = card.querySelector('input') as HTMLInputElement;
  checkbox.checked = currentSettings[config.id];

  checkbox.addEventListener('change', async () => {
    currentSettings[config.id] = checkbox.checked;
    const result = await saveSettings(currentSettings);
    if (result.isOk()) {
      showStatus('設定を保存しました');
    } else {
      console.error('Failed to save:', result.error);
      showStatus('保存に失敗しました');
      checkbox.checked = !checkbox.checked; // Revert
    }
  });

  return card;
}

function renderSettings() {
  settingsContainer.innerHTML = '';
  
  const filteredSettings = SETTINGS_CONFIG.filter(config => config.category === activeTab);

  if (filteredSettings.length === 0) {
    settingsContainer.innerHTML = `
      <div class="empty-state">
        <p>このカテゴリには設定がありません</p>
      </div>
    `;
    return;
  }

  filteredSettings.forEach(config => {
    settingsContainer.appendChild(createSettingCard(config));
  });
}

function initTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update content
      activeTab = (btn.getAttribute('data-tab') as SettingCategory) || 'video';
      renderSettings();
    });
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
  renderSettings();
}

// Start
init();

