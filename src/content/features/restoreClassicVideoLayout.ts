/**
 * 動画再生画面のレイアウトを従来の形式に戻す機能
 * タグ・動画名などの情報を動画プレイヤーの上部に移動します
 */

// 処理済みマーカー属性
const LAYOUT_MARKER = 'data-bn-layout';
const LAYOUT_CLASSIC = 'classic';
const LAYOUT_DEFAULT = 'default';

// 動画視聴ページかどうかを判定
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * 現在のレイアウト状態を確認
 */
function getCurrentLayout(): 'classic' | 'default' | null {
  const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
  const bottomArea = document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;

  if (!playerArea || !bottomArea || !playerArea.parentElement) {
    return null;
  }

  // DOM上の順序を確認
  const parent = playerArea.parentElement;
  const children = Array.from(parent.children);
  const playerIndex = children.indexOf(playerArea);
  const bottomIndex = children.indexOf(bottomArea);

  // bottomがplayerより前にある場合はクラシックレイアウト
  return bottomIndex < playerIndex ? 'classic' : 'default';
}

/**
 * 動画情報を上部に移動する
 */
function restoreClassicLayout(): void {
  if (!isWatchPage()) {
    return;
  }

  // 動画プレイヤーのエリア
  const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;

  // 動画情報のエリア（タイトル、タグ、投稿者情報など）
  const bottomArea = document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;

  if (!playerArea || !bottomArea || !playerArea.parentElement) {
    return;
  }

  // すでにクラシックレイアウトの場合は何もしない
  const currentLayout = getCurrentLayout();
  if (currentLayout === 'classic') {
    // マーカーを設定（すでに設定済みでも問題ない）
    playerArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);
    bottomArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);
    return;
  }

  // bottomAreaをplayerAreaの前に移動
  playerArea.parentElement.insertBefore(bottomArea, playerArea);

  // マーカーを設定
  playerArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);
  bottomArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);

  console.log('[Better Niconico] 動画情報を上部に移動しました');
}

/**
 * レイアウトを元に戻す（デフォルトの位置に戻す）
 */
function restoreDefaultLayout(): void {
  if (!isWatchPage()) {
    return;
  }

  const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;
  const bottomArea = document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;

  if (!playerArea || !bottomArea || !playerArea.parentElement) {
    return;
  }

  // すでにデフォルトレイアウトの場合は何もしない
  const currentLayout = getCurrentLayout();
  if (currentLayout === 'default') {
    // マーカーを設定（すでに設定済みでも問題ない）
    playerArea.setAttribute(LAYOUT_MARKER, LAYOUT_DEFAULT);
    bottomArea.setAttribute(LAYOUT_MARKER, LAYOUT_DEFAULT);
    return;
  }

  // bottomAreaをplayerAreaの後に移動
  // playerAreaの次の兄弟要素（通常はsidebar）の前に挿入
  const nextElement = playerArea.nextElementSibling;
  if (nextElement && nextElement !== bottomArea) {
    playerArea.parentElement.insertBefore(bottomArea, nextElement);
  } else {
    // sidebarが見つからない場合は末尾に追加
    playerArea.parentElement.appendChild(bottomArea);
  }

  // マーカーを設定
  playerArea.setAttribute(LAYOUT_MARKER, LAYOUT_DEFAULT);
  bottomArea.setAttribute(LAYOUT_MARKER, LAYOUT_DEFAULT);

  console.log('[Better Niconico] レイアウトを元に戻しました');
}

/**
 * 設定を適用する
 * @param enabled - true: クラシックレイアウト, false: デフォルトレイアウト
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    restoreClassicLayout();
  } else {
    restoreDefaultLayout();
  }
}
