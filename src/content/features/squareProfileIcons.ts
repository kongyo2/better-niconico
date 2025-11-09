/**
 * プロフィールアイコンを丸型から四角型に変更する機能
 * ヘッダーアイコンやユーザーアイコンのborder-radiusを変更します
 *
 * 実装参考: https://github.com/Bymnet1845/niconico-classic
 */

const SQUARE_ICONS_CLASS = 'bn-square-icons';

/**
 * プロフィールアイコンを四角型にする
 */
function enableSquareIcons(): void {
  if (document.body.classList.contains(SQUARE_ICONS_CLASS)) {
    return; // 既に適用済み
  }

  document.body.classList.add(SQUARE_ICONS_CLASS);
  console.log('[Better Niconico] プロフィールアイコンを四角型に変更しました');
}

/**
 * プロフィールアイコンを丸型に戻す
 */
function disableSquareIcons(): void {
  if (!document.body.classList.contains(SQUARE_ICONS_CLASS)) {
    return; // 既に解除済み
  }

  document.body.classList.remove(SQUARE_ICONS_CLASS);
  console.log('[Better Niconico] プロフィールアイコンを丸型に戻しました');
}

/**
 * 設定を適用する
 * @param enabled - true: 四角型, false: 丸型
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    enableSquareIcons();
  } else {
    disableSquareIcons();
  }
}
