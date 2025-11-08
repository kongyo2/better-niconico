/**
 * ダークモード機能
 * HTML要素に .bn-dark-mode クラスを追加して、ニコニコ動画をダークモード化します
 * CSS変数を上書きすることで、サイト全体のカラースキームを変更します
 *
 * 注意: ダークモードは動画視聴ページ（/watch/*）のみで動作します
 */

const DARK_MODE_CLASS = 'bn-dark-mode';

/**
 * 動画視聴ページかどうかを判定
 * ダークモードは動画視聴ページでのみ有効化されます
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * ダークモードを有効化する
 * HTML要素に .bn-dark-mode クラスを追加
 * 動画視聴ページでのみ有効化されます
 */
function enableDarkMode(): void {
  // 動画視聴ページ以外では何もしない
  if (!isWatchPage()) {
    return;
  }

  const html = document.documentElement;

  // すでに有効な場合は何もしない（冪等性）
  if (html.classList.contains(DARK_MODE_CLASS)) {
    return;
  }

  html.classList.add(DARK_MODE_CLASS);
  console.log('[Better Niconico] ダークモードを有効化しました (動画視聴ページ)');
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
 * 注意: 動画視聴ページ以外では、設定に関わらずダークモードは無効化されます
 */
export function apply(enabled: boolean): void {
  // 動画視聴ページ以外では、設定に関わらず強制的に無効化
  if (!isWatchPage()) {
    disableDarkMode();
    return;
  }

  // 動画視聴ページでは、設定に従って有効化/無効化
  if (enabled) {
    enableDarkMode();
  } else {
    disableDarkMode();
  }
}
