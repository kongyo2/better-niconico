// Better Niconico Popup Script
import type { BetterNiconicoSettings } from '../types/settings';
import { STORAGE_KEY, DEFAULT_SETTINGS } from '../types/settings';

const statusMessage = document.getElementById('statusMessage') as HTMLDivElement;

/**
 * ステータスメッセージを表示
 */
function showStatusMessage(message: string, duration = 2000): void {
  if (statusMessage) {
    statusMessage.textContent = message;
    statusMessage.classList.add('show');

    setTimeout(() => {
      statusMessage.classList.remove('show');
    }, duration);
  }
}

/**
 * 設定を読み込む
 */
async function loadSettings(): Promise<BetterNiconicoSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      const settings = result[STORAGE_KEY] as BetterNiconicoSettings | undefined;
      resolve(settings || DEFAULT_SETTINGS);
    });
  });
}

/**
 * 設定を保存する
 */
async function saveSettings(settings: BetterNiconicoSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * UIを設定で更新
 */
function updateUI(settings: BetterNiconicoSettings): void {
  const hidePremiumCheckbox = document.getElementById('hidePremiumSection') as HTMLInputElement;
  const hideOnAirAnimeCheckbox = document.getElementById('hideOnAirAnime') as HTMLInputElement;
  const restoreClassicVideoLayoutCheckbox = document.getElementById('restoreClassicVideoLayout') as HTMLInputElement;
  const enableVideoUpscalingCheckbox = document.getElementById('enableVideoUpscaling') as HTMLInputElement;
  const showNicoRankButtonCheckbox = document.getElementById('showNicoRankButton') as HTMLInputElement;
  const squareProfileIconsCheckbox = document.getElementById('squareProfileIcons') as HTMLInputElement;
  const hideSupporterButtonCheckbox = document.getElementById('hideSupporterButton') as HTMLInputElement;

  if (hidePremiumCheckbox) {
    hidePremiumCheckbox.checked = settings.hidePremiumSection;
  }

  if (hideOnAirAnimeCheckbox) {
    hideOnAirAnimeCheckbox.checked = settings.hideOnAirAnime;
  }

  if (restoreClassicVideoLayoutCheckbox) {
    restoreClassicVideoLayoutCheckbox.checked = settings.restoreClassicVideoLayout;
  }

  if (enableVideoUpscalingCheckbox) {
    enableVideoUpscalingCheckbox.checked = settings.enableVideoUpscaling;
  }

  if (showNicoRankButtonCheckbox) {
    showNicoRankButtonCheckbox.checked = settings.showNicoRankButton;
  }

  if (squareProfileIconsCheckbox) {
    squareProfileIconsCheckbox.checked = settings.squareProfileIcons;
  }

  if (hideSupporterButtonCheckbox) {
    hideSupporterButtonCheckbox.checked = settings.hideSupporterButton;
  }
}

/**
 * UIから設定を取得
 */
function getSettingsFromUI(): BetterNiconicoSettings {
  const hidePremiumCheckbox = document.getElementById('hidePremiumSection') as HTMLInputElement;
  const hideOnAirAnimeCheckbox = document.getElementById('hideOnAirAnime') as HTMLInputElement;
  const restoreClassicVideoLayoutCheckbox = document.getElementById('restoreClassicVideoLayout') as HTMLInputElement;
  const enableVideoUpscalingCheckbox = document.getElementById('enableVideoUpscaling') as HTMLInputElement;
  const showNicoRankButtonCheckbox = document.getElementById('showNicoRankButton') as HTMLInputElement;
  const squareProfileIconsCheckbox = document.getElementById('squareProfileIcons') as HTMLInputElement;
  const hideSupporterButtonCheckbox = document.getElementById('hideSupporterButton') as HTMLInputElement;

  return {
    hidePremiumSection: hidePremiumCheckbox?.checked ?? DEFAULT_SETTINGS.hidePremiumSection,
    hideOnAirAnime: hideOnAirAnimeCheckbox?.checked ?? DEFAULT_SETTINGS.hideOnAirAnime,
    restoreClassicVideoLayout: restoreClassicVideoLayoutCheckbox?.checked ?? DEFAULT_SETTINGS.restoreClassicVideoLayout,
    enableVideoUpscaling: enableVideoUpscalingCheckbox?.checked ?? DEFAULT_SETTINGS.enableVideoUpscaling,
    showNicoRankButton: showNicoRankButtonCheckbox?.checked ?? DEFAULT_SETTINGS.showNicoRankButton,
    squareProfileIcons: squareProfileIconsCheckbox?.checked ?? DEFAULT_SETTINGS.squareProfileIcons,
    hideSupporterButton: hideSupporterButtonCheckbox?.checked ?? DEFAULT_SETTINGS.hideSupporterButton,
  };
}

/**
 * 初期化
 */
async function initialize(): Promise<void> {
  try {
    // 設定を読み込んでUIに反映
    const settings = await loadSettings();
    updateUI(settings);

    // チェックボックスの変更を監視
    const hidePremiumCheckbox = document.getElementById('hidePremiumSection') as HTMLInputElement;
    const hideOnAirAnimeCheckbox = document.getElementById('hideOnAirAnime') as HTMLInputElement;
    const restoreClassicVideoLayoutCheckbox = document.getElementById('restoreClassicVideoLayout') as HTMLInputElement;
    const enableVideoUpscalingCheckbox = document.getElementById('enableVideoUpscaling') as HTMLInputElement;
    const showNicoRankButtonCheckbox = document.getElementById('showNicoRankButton') as HTMLInputElement;
    const squareProfileIconsCheckbox = document.getElementById('squareProfileIcons') as HTMLInputElement;
    const hideSupporterButtonCheckbox = document.getElementById('hideSupporterButton') as HTMLInputElement;

    if (hidePremiumCheckbox) {
      hidePremiumCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        await saveSettings(newSettings);
        showStatusMessage('設定を保存しました');
      });
    }

    if (hideOnAirAnimeCheckbox) {
      hideOnAirAnimeCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        await saveSettings(newSettings);
        showStatusMessage('設定を保存しました');
      });
    }

    if (restoreClassicVideoLayoutCheckbox) {
      restoreClassicVideoLayoutCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        await saveSettings(newSettings);
        showStatusMessage('設定を保存しました');
      });
    }

    if (enableVideoUpscalingCheckbox) {
      enableVideoUpscalingCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        await saveSettings(newSettings);
        showStatusMessage('設定を保存しました');
      });
    }

    if (showNicoRankButtonCheckbox) {
      showNicoRankButtonCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        await saveSettings(newSettings);
        showStatusMessage('設定を保存しました');
      });
    }

    if (squareProfileIconsCheckbox) {
      squareProfileIconsCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        await saveSettings(newSettings);
        showStatusMessage('設定を保存しました');
      });
    }

    if (hideSupporterButtonCheckbox) {
      hideSupporterButtonCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        await saveSettings(newSettings);
        showStatusMessage('設定を保存しました');
      });
    }

    console.log('[Better Niconico] Popup initialized');
  } catch (error) {
    console.error('[Better Niconico] Popup initialization error:', error);
    showStatusMessage('エラーが発生しました', 3000);
  }
}

// DOMが読み込まれたら初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initialize());
} else {
  void initialize();
}
