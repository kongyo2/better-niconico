// Better Niconico - Background Service Worker
// バックグラウンドで動作するサービスワーカー

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
          console.error('[Better Niconico] 初期化データの保存に失敗しました:', chrome.runtime.lastError);
        } else {
          console.log('[Better Niconico] 初期化データを保存しました');
        }
      },
    );
  } else if (details.reason === 'update') {
    const previousVersion = details.previousVersion;
    const currentVersion = chrome.runtime.getManifest().version;
    console.log(`[Better Niconico] 拡張機能が更新されました: ${previousVersion} → ${currentVersion}`);
  }
});

/**
 * タブの更新を監視
 * ニコニコ動画のページが読み込まれたときにログを出力
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('nicovideo.jp')) {
    console.log(`[Better Niconico] ニコニコ動画のタブが読み込まれました: ${tab.url}`);
  }
});

/**
 * Handle video download requests from content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadVideo') {
    const videoId = request.videoId;
    console.log('[Better Niconico] Download request for video:', videoId);

    // Open ext.nicovideo.jp in new tab
    // Content script (downloadHelper.ts) will automatically inject bookmarklet
    const downloadUrl = `https://ext.nicovideo.jp/?${videoId}`;
    chrome.tabs.create({ url: downloadUrl }, (newTab) => {
      if (!newTab.id) {
        console.error('[Better Niconico] Failed to create new tab');
        sendResponse({ success: false, error: 'Failed to create tab' });
        return;
      }

      console.log('[Better Niconico] Download tab opened:', downloadUrl);
      sendResponse({ success: true });
    });

    return true; // Keep message channel open for async response
  }
});

console.log('[Better Niconico] バックグラウンドサービスワーカーが初期化されました');
