/**
 * サポーターボタンを非表示にする機能
 * 視聴ページに表示される「サポート」ボタンとサポーター勧誘を非表示にします
 *
 * 実装参考: https://github.com/castella-cake/niconico-peppermint-extension
 */

const HIDE_SUPPORTER_CLASS = 'bn-hide-supporter';

/**
 * サポーターボタンを非表示にする
 */
function enableHideSupporterButton(): void {
  if (document.body.classList.contains(HIDE_SUPPORTER_CLASS)) {
    return; // 既に適用済み
  }

  document.body.classList.add(HIDE_SUPPORTER_CLASS);
  console.log('[Better Niconico] サポーターボタンを非表示にしました');
}

/**
 * サポーターボタンを表示する
 */
function disableHideSupporterButton(): void {
  if (!document.body.classList.contains(HIDE_SUPPORTER_CLASS)) {
    return; // 既に解除済み
  }

  document.body.classList.remove(HIDE_SUPPORTER_CLASS);
  console.log('[Better Niconico] サポーターボタンを表示しました');
}

/**
 * 設定を適用する
 * @param enabled - true: 非表示, false: 表示
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    enableHideSupporterButton();
  } else {
    disableHideSupporterButton();
  }
}
