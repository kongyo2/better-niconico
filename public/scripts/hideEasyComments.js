/**
 * かんたんコメント非表示スクリプト
 * ニコニコ動画のコメントAPIレスポンスから「かんたんコメント」(fork === "easy")を除外する
 *
 * このスクリプトはページに注入され、fetch APIを上書きして動作する
 */
(function() {
  'use strict';

  // コメントAPIのURLパターン
  const COMMENT_API_PATTERN = /public\.nvcomment\.nicovideo\.jp\/v1\/threads/;

  // 元のfetch関数を保存
  const originalFetch = window.fetch;

  // fetchを上書き
  window.fetch = async function(input, init) {
    const response = await originalFetch.apply(this, arguments);

    // URLを取得
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');

    // コメントAPIへのリクエストでない場合はそのまま返す
    if (!COMMENT_API_PATTERN.test(url)) {
      return response;
    }

    try {
      // レスポンスをクローンしてJSONとして解析
      const clonedResponse = response.clone();
      const json = await clonedResponse.json();

      // threadsが存在する場合、easyコメントを除外
      if (json.data && Array.isArray(json.data.threads)) {
        json.data.threads = json.data.threads.filter(thread => thread.fork !== 'easy');

        // 除外されたコメント数をログ
        const originalCount = json.data.threads.length;
        console.log('[Better Niconico] かんたんコメントを非表示にしました');

        // 新しいレスポンスを作成
        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
    } catch (e) {
      // JSONパースに失敗した場合は元のレスポンスを返す
      console.error('[Better Niconico] コメントAPIのフィルタリングに失敗:', e);
    }

    return response;
  };

  console.log('[Better Niconico] かんたんコメント非表示スクリプトが読み込まれました');
})();
