/**
 * かんたんコメント非表示機能
 *
 * ニコニコ動画の「かんたんコメント」を非表示にする機能
 * 参考: https://github.com/nines75/mico
 *
 * かんたんコメントとは:
 * - 動画再生時にワンタップで送信できる定型コメント
 * - APIレスポンスでは fork === "easy" のスレッドに格納される
 *
 * 実装方法:
 * - ページにスクリプトを注入して fetch API を上書き
 * - コメントAPIのレスポンスから fork === "easy" のスレッドを除外
 */

const SCRIPT_ID = 'better-niconico-hide-easy-comments';
const SCRIPT_URL = chrome.runtime.getURL('scripts/hideEasyComments.js');

let scriptInjected = false;

/**
 * ページにスクリプトを注入してかんたんコメントを非表示にする
 */
function injectScript(): void {
  // 既に注入済みの場合はスキップ
  if (document.getElementById(SCRIPT_ID)) {
    scriptInjected = true;
    return;
  }

  // 動画視聴ページでのみ動作
  if (!window.location.pathname.startsWith('/watch/')) {
    return;
  }

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = SCRIPT_URL;
  script.type = 'text/javascript';

  // スクリプトを可能な限り早く注入する（head または documentElement）
  const target = document.head || document.documentElement;
  target.insertBefore(script, target.firstChild);

  scriptInjected = true;
  console.log('[Better Niconico] かんたんコメント非表示スクリプトを注入しました');
}

/**
 * スクリプトを削除する
 * 注意: 既にオーバーライドされたfetchは元に戻せないため、
 * ページのリロードが必要
 */
function removeScript(): void {
  const script = document.getElementById(SCRIPT_ID);
  if (script) {
    script.remove();
    console.log('[Better Niconico] かんたんコメント非表示スクリプトを削除しました（リロードで反映）');
  }
  scriptInjected = false;
}

/**
 * 設定を適用する
 * @param enabled - true: かんたんコメントを非表示, false: 表示（リロードが必要）
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    // 有効化時はスクリプトを注入
    if (!scriptInjected) {
      injectScript();
    }
  } else {
    // 無効化時はスクリプトを削除（ただし即座には反映されない）
    removeScript();
  }
}
