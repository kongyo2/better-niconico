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
import * as addNicoRanWebButton from './features/addNicoRanWebButton';
import * as squareProfileIcons from './features/squareProfileIcons';
import * as hideSupporterButton from './features/hideSupporterButton';
import * as hideNicoAds from './features/hideNicoAds';
import * as pictureInPicture from './features/pictureInPicture';
import * as videoScreenshot from './features/videoScreenshot';
import * as allegationAssist from './features/allegationAssist';
import * as cinematicLighting from './features/cinematicLighting';
import * as videoDownload from './features/videoDownload';
import * as restoreNicopediaLink from './features/restoreNicopediaLink';
import * as hideShortsButton from './features/hideShortsButton';

/**
 * 直近に読み込んだ設定のキャッシュ。
 * DOM変更(MutationObserver)起点の再適用ごとに chrome.storage を読みに行くと
 * 動画再生中のような頻繁なDOM変化で大量の非同期読込が走るため、設定はキャッシュし
 * storage.onChanged / メッセージ受信時のみ読み直す。
 */
let cachedSettings: BetterNiconicoSettings = DEFAULT_SETTINGS;
/** 初回読み込みが完了したか(完了前はDOM起点の再適用をしない=デフォルトのちらつき防止) */
let settingsLoaded = false;

/**
 * 各機能の適用処理(機能名, 適用関数)の一覧。順序は適用順を表す。
 * applyAll はこの一覧を機能単位の try/catch で回す。
 */
const FEATURE_APPLIERS: ReadonlyArray<readonly [string, (s: BetterNiconicoSettings) => void]> = [
  ['hidePremiumSection', (s) => hidePremiumSection.apply(s.hidePremiumSection)],
  ['hideOnAirAnime', (s) => hideOnAirAnime.apply(s.hideOnAirAnime)],
  [
    'restoreClassicVideoLayout',
    (s) => restoreClassicVideoLayout.apply(s.restoreClassicVideoLayout),
  ],
  ['videoUpscaling', (s) => videoUpscaling.apply(s.enableVideoUpscaling)],
  ['addNicoRankButton', (s) => addNicoRankButton.apply(s.showNicoRankButton)],
  ['addNicoRanWebButton', (s) => addNicoRanWebButton.apply(s.showNicoRanWebButton)],
  ['squareProfileIcons', (s) => squareProfileIcons.apply(s.squareProfileIcons)],
  ['hideSupporterButton', (s) => hideSupporterButton.apply(s.hideSupporterButton)],
  ['hideNicoAds', (s) => hideNicoAds.apply(s.hideNicoAds)],
  ['pictureInPicture', (s) => pictureInPicture.apply(s.enablePictureInPicture)],
  ['videoScreenshot', (s) => videoScreenshot.apply(s.enableVideoScreenshot)],
  ['allegationAssist', (s) => void allegationAssist.apply(s.enableAllegationAssist)],
  ['cinematicLighting', (s) => cinematicLighting.apply(s.enableCinematicLighting)],
  ['videoDownload', (s) => videoDownload.apply(s.enableVideoDownload)],
  ['restoreNicopediaLink', (s) => restoreNicopediaLink.apply(s.restoreNicopediaLink)],
  ['hideShortsButton', (s) => hideShortsButton.apply(s.hideShortsButton)],
];

/**
 * 指定された設定で各機能を適用する(同期・storageアクセスなし)。
 * ある機能が(ニコニコ側のDOMが想定外の状態などで)同期的に例外を投げても、
 * 他の機能や再適用サイクル全体を巻き込まないよう、機能単位で try/catch する。
 */
function applyAll(settings: BetterNiconicoSettings): void {
  for (const [name, applyFeature] of FEATURE_APPLIERS) {
    try {
      applyFeature(settings);
    } catch (error) {
      console.error(`[Better Niconico] 「${name}」の適用中にエラーが発生しました:`, error);
    }
  }
}

/**
 * loadAndApply の世代カウンタ。設定の高速変更などで loadAndApply が並行すると、
 * 先に開始した呼び出しの loadSettings が後発より遅く解決し、古い設定で
 * キャッシュを上書きしてしまう競合が起こりうる。最新の世代だけを反映する。
 */
let loadGeneration = 0;

/**
 * 設定を chrome.storage から読み直してキャッシュし、適用する（Result型を使用）
 */
async function loadAndApply(): Promise<void> {
  const generation = ++loadGeneration;
  const settingsResult = await loadSettings();

  // 自分より後に開始した loadAndApply があれば、古い結果でキャッシュを上書きしない
  if (generation !== loadGeneration) {
    return;
  }

  if (settingsResult.isErr()) {
    console.error('[Better Niconico] 設定の読み込みに失敗しました:', settingsResult.error);
    cachedSettings = DEFAULT_SETTINGS; // エラー時はデフォルト設定を使用
  } else {
    cachedSettings = settingsResult.value;
  }

  settingsLoaded = true;
  applyAll(cachedSettings);
}

/**
 * DOM変更起点の再適用をフレーム単位に集約する。
 * 連続するDOM変化(コメント流れ・動画切り替え等)で applyAll が連打されるのを防ぐ。
 * キャッシュ済みの設定を使うため storage アクセスは発生しない。
 */
const scheduleFrame: (cb: () => void) => void =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16);
let reapplyScheduled = false;

function scheduleReapply(): void {
  if (!settingsLoaded || reapplyScheduled) {
    return;
  }
  reapplyScheduled = true;
  scheduleFrame(() => {
    reapplyScheduled = false;
    applyAll(cachedSettings);
  });
}

/**
 * 設定変更を監視する
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.betterNiconicoSettings) {
    console.log('[Better Niconico] 設定が変更されました');
    void loadAndApply();
  }
});

/**
 * メッセージリスナー（Result型を使用）
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
        void loadAndApply();
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

  // 初回適用(storageから読み込み)
  await loadAndApply();

  // MutationObserverでDOM変更を監視
  // ニコニコ動画は動的にコンテンツを読み込むため
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // 新しいノードが追加されたら(キャッシュ設定で)再適用。フレーム単位に集約。
        scheduleReapply();
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
