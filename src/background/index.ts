// Better Niconico - Background Service Worker
// バックグラウンドで動作するサービスワーカー

import { resolveArticleExistence } from './nicopediaCheck';

/**
 * 拡張機能のインストール・アップデート時の処理
 */
chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
  if (details.reason === 'install') {
    console.log('[Better Niconico] 拡張機能がインストールされました');

    // デフォルト設定の初期化（必要に応じて）
    chrome.storage.sync.set(
      {
        initialized: true,
        installedAt: new Date().toISOString(),
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            '[Better Niconico] 初期化データの保存に失敗しました:',
            chrome.runtime.lastError,
          );
        } else {
          console.log('[Better Niconico] 初期化データを保存しました');
        }
      },
    );
  } else if (details.reason === 'update') {
    const previousVersion = details.previousVersion;
    const currentVersion = chrome.runtime.getManifest().version;
    console.log(
      `[Better Niconico] 拡張機能が更新されました: ${previousVersion} → ${currentVersion}`,
    );
  }
});

/**
 * タブの更新を監視
 * ニコニコ動画のページが読み込まれたときにログを出力
 */
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('nicovideo.jp')) {
    console.log(`[Better Niconico] ニコニコ動画のタブが読み込まれました: ${tab.url}`);
  }
});

/**
 * Content Scriptからのメッセージを処理
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'CHECK_NICOPEDIA_ARTICLE') {
    const encodedTagName = typeof message.tagName === 'string' ? message.tagName : '';

    // タグ名が不正なら確認せず「不明(error)」を返す（呼び出し側でリンクを隠さない）
    if (encodedTagName.length === 0) {
      sendResponse({ exists: false, error: true });
      return true;
    }

    // Background から HEAD で存在確認（CORS 回避 + 軽量化。詳細は nicopediaCheck.ts）
    void resolveArticleExistence(encodedTagName)
      .then((result) => {
        if (result === 'exists') {
          sendResponse({ exists: true });
        } else if (result === 'missing') {
          sendResponse({ exists: false });
        } else {
          // 不明（通信エラー等）。exists:false は旧クライアント互換、error:true で新クライアントが識別する
          sendResponse({ exists: false, error: true });
        }
      })
      .catch(() => {
        sendResponse({ exists: false, error: true });
      });

    // 非同期レスポンスを返すためにtrueを返す
    return true;
  }
  return false;
});

console.log('[Better Niconico] バックグラウンドサービスワーカーが初期化されました');
