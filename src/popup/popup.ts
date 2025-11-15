// Better Niconico Popup Script
import type { BetterNiconicoSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { loadSettings, saveSettings } from '../utils/storage';

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
  const hideNicoAdsCheckbox = document.getElementById('hideNicoAds') as HTMLInputElement;

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

  if (hideNicoAdsCheckbox) {
    hideNicoAdsCheckbox.checked = settings.hideNicoAds;
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
  const hideNicoAdsCheckbox = document.getElementById('hideNicoAds') as HTMLInputElement;

  return {
    hidePremiumSection: hidePremiumCheckbox?.checked ?? DEFAULT_SETTINGS.hidePremiumSection,
    hideOnAirAnime: hideOnAirAnimeCheckbox?.checked ?? DEFAULT_SETTINGS.hideOnAirAnime,
    restoreClassicVideoLayout: restoreClassicVideoLayoutCheckbox?.checked ?? DEFAULT_SETTINGS.restoreClassicVideoLayout,
    enableVideoUpscaling: enableVideoUpscalingCheckbox?.checked ?? DEFAULT_SETTINGS.enableVideoUpscaling,
    showNicoRankButton: showNicoRankButtonCheckbox?.checked ?? DEFAULT_SETTINGS.showNicoRankButton,
    squareProfileIcons: squareProfileIconsCheckbox?.checked ?? DEFAULT_SETTINGS.squareProfileIcons,
    hideSupporterButton: hideSupporterButtonCheckbox?.checked ?? DEFAULT_SETTINGS.hideSupporterButton,
    hideNicoAds: hideNicoAdsCheckbox?.checked ?? DEFAULT_SETTINGS.hideNicoAds,
  };
}

/**
 * 初期化（Result型を使用）
 */
async function initialize(): Promise<void> {
  try {
    // 設定を読み込んでUIに反映
    const settingsResult = await loadSettings();

    if (settingsResult.isErr()) {
      console.error('[Better Niconico] 設定の読み込みに失敗しました:', settingsResult.error);
      showStatusMessage('設定の読み込みに失敗しました', 3000);
      // エラー時はデフォルト設定を使用
      updateUI(DEFAULT_SETTINGS);
      return;
    }

    const settings = settingsResult.value;
    updateUI(settings);

    // チェックボックスの変更を監視
    const hidePremiumCheckbox = document.getElementById('hidePremiumSection') as HTMLInputElement;
    const hideOnAirAnimeCheckbox = document.getElementById('hideOnAirAnime') as HTMLInputElement;
    const restoreClassicVideoLayoutCheckbox = document.getElementById('restoreClassicVideoLayout') as HTMLInputElement;
    const enableVideoUpscalingCheckbox = document.getElementById('enableVideoUpscaling') as HTMLInputElement;
    const showNicoRankButtonCheckbox = document.getElementById('showNicoRankButton') as HTMLInputElement;
    const squareProfileIconsCheckbox = document.getElementById('squareProfileIcons') as HTMLInputElement;
    const hideSupporterButtonCheckbox = document.getElementById('hideSupporterButton') as HTMLInputElement;
    const hideNicoAdsCheckbox = document.getElementById('hideNicoAds') as HTMLInputElement;

    if (hidePremiumCheckbox) {
      hidePremiumCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        const result = await saveSettings(newSettings);
        if (result.isOk()) {
          showStatusMessage('設定を保存しました');
        } else {
          console.error('[Better Niconico] 設定保存エラー:', result.error);
          showStatusMessage('設定の保存に失敗しました', 3000);
        }
      });
    }

    if (hideOnAirAnimeCheckbox) {
      hideOnAirAnimeCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        const result = await saveSettings(newSettings);
        if (result.isOk()) {
          showStatusMessage('設定を保存しました');
        } else {
          console.error('[Better Niconico] 設定保存エラー:', result.error);
          showStatusMessage('設定の保存に失敗しました', 3000);
        }
      });
    }

    if (restoreClassicVideoLayoutCheckbox) {
      restoreClassicVideoLayoutCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        const result = await saveSettings(newSettings);
        if (result.isOk()) {
          showStatusMessage('設定を保存しました');
        } else {
          console.error('[Better Niconico] 設定保存エラー:', result.error);
          showStatusMessage('設定の保存に失敗しました', 3000);
        }
      });
    }

    if (enableVideoUpscalingCheckbox) {
      enableVideoUpscalingCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        const result = await saveSettings(newSettings);
        if (result.isOk()) {
          showStatusMessage('設定を保存しました');
        } else {
          console.error('[Better Niconico] 設定保存エラー:', result.error);
          showStatusMessage('設定の保存に失敗しました', 3000);
        }
      });
    }

    if (showNicoRankButtonCheckbox) {
      showNicoRankButtonCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        const result = await saveSettings(newSettings);
        if (result.isOk()) {
          showStatusMessage('設定を保存しました');
        } else {
          console.error('[Better Niconico] 設定保存エラー:', result.error);
          showStatusMessage('設定の保存に失敗しました', 3000);
        }
      });
    }

    if (squareProfileIconsCheckbox) {
      squareProfileIconsCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        const result = await saveSettings(newSettings);
        if (result.isOk()) {
          showStatusMessage('設定を保存しました');
        } else {
          console.error('[Better Niconico] 設定保存エラー:', result.error);
          showStatusMessage('設定の保存に失敗しました', 3000);
        }
      });
    }

    if (hideSupporterButtonCheckbox) {
      hideSupporterButtonCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        const result = await saveSettings(newSettings);
        if (result.isOk()) {
          showStatusMessage('設定を保存しました');
        } else {
          console.error('[Better Niconico] 設定保存エラー:', result.error);
          showStatusMessage('設定の保存に失敗しました', 3000);
        }
      });
    }

    if (hideNicoAdsCheckbox) {
      hideNicoAdsCheckbox.addEventListener('change', async () => {
        const newSettings = getSettingsFromUI();
        const result = await saveSettings(newSettings);
        if (result.isOk()) {
          showStatusMessage('設定を保存しました');
        } else {
          console.error('[Better Niconico] 設定保存エラー:', result.error);
          showStatusMessage('設定の保存に失敗しました', 3000);
        }
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
