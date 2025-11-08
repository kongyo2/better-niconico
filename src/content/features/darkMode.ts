/**
 * ダークモード機能
 * HTML要素に .bn-dark-mode クラスを追加して、ニコニコ動画をダークモード化します
 * CSS変数を上書きすることで、サイト全体のカラースキームを変更します
 */

const DARK_MODE_CLASS = 'bn-dark-mode';

/**
 * ダークモードを有効化する
 * HTML要素に .bn-dark-mode クラスを追加
 */
function enableDarkMode(): void {
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
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    enableDarkMode();
  } else {
    disableDarkMode();
  }
}
