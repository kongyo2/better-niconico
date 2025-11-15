// Better Niconico - Content Script
// ニコニコ動画のレイアウトと細部改善を行う拡張機能
import './index.css';
import type { BetterNiconicoSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { loadSettings, saveSettings } from '../utils/storage';

// Feature modules
import * as hidePremiumSection from './features/hidePremiumSection';
import * as hideOnAirAnime from './features/hideOnAirAnime';
import * as restoreClassicVideoLayout from './features/restoreClassicVideoLayout';
import * as videoUpscaling from './features/videoUpscaling';
import * as addNicoRankButton from './features/addNicoRankButton';
import * as squareProfileIcons from './features/squareProfileIcons';
import * as hideSupporterButton from './features/hideSupporterButton';
import * as hideNicoAds from './features/hideNicoAds';

/**
 * 設定を適用する（Result型を使用）
 */
async function applySettings(): Promise<void> {
  const settingsResult = await loadSettings();

  if (settingsResult.isErr()) {
    console.error('[Better Niconico] 設定の読み込みに失敗しました:', settingsResult.error);
    // エラー時はデフォルト設定を使用
    const settings = DEFAULT_SETTINGS;
    hidePremiumSection.apply(settings.hidePremiumSection);
    hideOnAirAnime.apply(settings.hideOnAirAnime);
    restoreClassicVideoLayout.apply(settings.restoreClassicVideoLayout);
    videoUpscaling.apply(settings.enableVideoUpscaling);
    addNicoRankButton.apply(settings.showNicoRankButton);
    squareProfileIcons.apply(settings.squareProfileIcons);
    hideSupporterButton.apply(settings.hideSupporterButton);
    hideNicoAds.apply(settings.hideNicoAds);
    return;
  }

  const settings = settingsResult.value;

  // 各機能を適用
  hidePremiumSection.apply(settings.hidePremiumSection);
  hideOnAirAnime.apply(settings.hideOnAirAnime);
  restoreClassicVideoLayout.apply(settings.restoreClassicVideoLayout);
  videoUpscaling.apply(settings.enableVideoUpscaling);
  addNicoRankButton.apply(settings.showNicoRankButton);
  squareProfileIcons.apply(settings.squareProfileIcons);
  hideSupporterButton.apply(settings.hideSupporterButton);
  hideNicoAds.apply(settings.hideNicoAds);
}

/**
 * 設定変更を監視する
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.betterNiconicoSettings) {
    console.log('[Better Niconico] 設定が変更されました');
    void applySettings();
  }
});

/**
 * メッセージリスナー（Result型を使用）
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSettings') {
    void loadSettings().then((result) => {
      if (result.isOk()) {
        sendResponse({ success: true, data: result.value });
      } else {
        console.error('[Better Niconico] 設定取得エラー:', result.error);
        sendResponse({ success: false, error: result.error });
      }
    });
    return true; // 非同期レスポンス
  }

  if (request.action === 'updateSettings') {
    const newSettings = request.data as BetterNiconicoSettings;
    void saveSettings(newSettings).then((result) => {
      if (result.isOk()) {
        void applySettings();
        sendResponse({ success: true });
      } else {
        console.error('[Better Niconico] 設定保存エラー:', result.error);
        sendResponse({ success: false, error: result.error });
      }
    });
    return true; // 非同期レスポンス
  }

  return false;
});

/**
 * 初期化
 * ページ読み込み時とDOM変更時に設定を適用
 */
async function initialize(): Promise<void> {
  console.log('[Better Niconico] 初期化開始');

  // 初回適用
  await applySettings();

  // MutationObserverでDOM変更を監視
  // ニコニコ動画は動的にコンテンツを読み込むため
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // 新しいノードが追加されたら設定を再適用
        void applySettings();
        break;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('[Better Niconico] 初期化完了');
}

// DOMContentLoadedまたは既に読み込み済みの場合は即座に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initialize());
} else {
  void initialize();
}
