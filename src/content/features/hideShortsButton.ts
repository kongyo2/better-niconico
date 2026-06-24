/**
 * ショートボタンを非表示にする機能
 * サイドメニューに表示される「ショート」ボタン（/shorts へのリンク）を非表示にします
 *
 * セレクタはビルド毎に変わるEmotionのハッシュクラス（css-XXXX）ではなく、
 * 安定したhref属性（/shorts で始まるリンク）でターゲットします。
 */

const HIDE_SHORTS_CLASS = 'bn-hide-shorts-button';

/**
 * ショートボタンを非表示にする
 */
function enableHideShortsButton(): void {
  if (document.body.classList.contains(HIDE_SHORTS_CLASS)) {
    return; // 既に適用済み
  }

  document.body.classList.add(HIDE_SHORTS_CLASS);
  console.log('[Better Niconico] ショートボタンを非表示にしました');
}

/**
 * ショートボタンを表示する
 */
function disableHideShortsButton(): void {
  if (!document.body.classList.contains(HIDE_SHORTS_CLASS)) {
    return; // 既に解除済み
  }

  document.body.classList.remove(HIDE_SHORTS_CLASS);
  console.log('[Better Niconico] ショートボタンを表示しました');
}

/**
 * 設定を適用する
 * @param enabled - true: 非表示, false: 表示
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    enableHideShortsButton();
  } else {
    disableHideShortsButton();
  }
}
