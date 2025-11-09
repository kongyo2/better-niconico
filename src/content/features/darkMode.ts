/**
 * ダークモード機能
 * HTML要素に .bn-dark-mode クラスを追加して、ニコニコ動画をダークモード化します
 * CSS変数を上書きすることで、サイト全体のカラースキームを変更します
 *
 * サポート対象ページ:
 * - 動画視聴ページ (/watch/*)
 * - 動画トップページ (/video_top, /video_top/*)
 * - タグページ (/tag/*)
 * - 検索ページ (/search/*)
 * - ランキングページ (/ranking, /ranking/*)
 */

const DARK_MODE_CLASS = 'bn-dark-mode';

/**
 * ダークモードがサポートされているページかどうかを判定
 *
 * サポート対象:
 * - 動画視聴ページ (/watch/*)
 * - 動画トップページ (/video_top*)
 * - タグページ (/tag/*)
 * - 検索ページ (/search/*)
 * - ランキングページ (/ranking*)
 */
function isDarkModeSupported(): boolean {
  const path = window.location.pathname;
  return (
    path.startsWith('/watch/') ||
    path.startsWith('/video_top') ||
    path.startsWith('/tag/') ||
    path.startsWith('/search/') ||
    path.startsWith('/ranking')
  );
}

/**
 * ダークモードを有効化する
 * HTML要素に .bn-dark-mode クラスを追加
 * サポートされているページでのみ有効化されます
 */
function enableDarkMode(): void {
  // サポートされていないページでは何もしない
  if (!isDarkModeSupported()) {
    return;
  }

  const html = document.documentElement;

  // すでに有効な場合は何もしない（冪等性）
  if (html.classList.contains(DARK_MODE_CLASS)) {
    return;
  }

  html.classList.add(DARK_MODE_CLASS);
  console.log('[Better Niconico] ダークモードを有効化しました');
}

/**
 * ダークモードを無効化する
 * HTML要素から .bn-dark-mode クラスを削除
 */
function disableDarkMode(): void {
  const html = document.documentElement;

  // すでに無効な場合は何もしない（冪等性）
  if (!html.classList.contains(DARK_MODE_CLASS)) {
    return;
  }

  html.classList.remove(DARK_MODE_CLASS);
  console.log('[Better Niconico] ダークモードを無効化しました');
}

/**
 * 設定を適用する
 * @param enabled - true: ダークモード有効, false: ダークモード無効
 *
 * 注意: サポートされていないページでは、設定に関わらずダークモードは無効化されます
 */
export function apply(enabled: boolean): void {
  // サポートされていないページでは、設定に関わらず強制的に無効化
  if (!isDarkModeSupported()) {
    disableDarkMode();
    return;
  }

  // サポートされているページでは、設定に従って有効化/無効化
  if (enabled) {
    enableDarkMode();
  } else {
    disableDarkMode();
  }
}
