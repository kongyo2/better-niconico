/**
 * コメントAPIキャプチャ用インジェクトスクリプト
 * ページコンテキストで実行され、fetchをフックしてコメントデータをキャプチャする
 *
 * このスクリプトは以下の流れで動作:
 * 1. fetchをフックしてコメントAPIへのリクエストを監視
 * 2. レスポンスデータをカスタムイベントでコンテンツスクリプトに通知
 * 3. コンテンツスクリプトがniconicommentsでコメントを描画
 */

(function () {
  'use strict';

  // コメントAPIのエンドポイント
  const COMMENT_API_URL = 'public.nvcomment.nicovideo.jp/v1/threads';

  // イベント名
  const COMMENT_DATA_EVENT = 'bn-comment-data-captured';

  // オリジナルのfetchを保存
  const originalFetch = window.fetch;

  /**
   * fetchをフックしてコメントAPIレスポンスをキャプチャ
   */
  window.fetch = async function (...args): Promise<Response> {
    const [input, init] = args;

    // URLを取得
    let url: string;
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input instanceof Request) {
      url = input.url;
    } else {
      // 不明な型の場合はオリジナルのfetchを呼び出す
      return originalFetch.apply(window, args);
    }

    // コメントAPIへのリクエストかチェック
    if (url.includes(COMMENT_API_URL)) {
      try {
        // オリジナルのfetchを呼び出す
        const response = await originalFetch.apply(window, args);

        // レスポンスをクローンしてJSONを取得
        const clonedResponse = response.clone();

        // 非同期でレスポンスデータを処理
        clonedResponse
          .json()
          .then((data) => {
            // コメントデータをカスタムイベントで通知
            if (data && data.data && data.data.threads) {
              const event = new CustomEvent(COMMENT_DATA_EVENT, {
                detail: {
                  threads: data.data.threads,
                  globalComments: data.data.globalComments,
                  timestamp: Date.now(),
                },
              });
              window.dispatchEvent(event);
              console.log('[Better Niconico] コメントデータをキャプチャしました');
            }
          })
          .catch((err) => {
            console.warn('[Better Niconico] コメントデータのパースに失敗:', err);
          });

        // 元のレスポンスを返す
        return response;
      } catch (error) {
        console.error('[Better Niconico] fetchエラー:', error);
        throw error;
      }
    }

    // コメントAPI以外は通常のfetchを実行
    return originalFetch.apply(window, args);
  };

  console.log('[Better Niconico] コメントキャプチャスクリプトを初期化しました');
})();
