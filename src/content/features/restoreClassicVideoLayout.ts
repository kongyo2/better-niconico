/**
 * 動画再生画面のレイアウトを従来の形式に戻す機能
 * タグ・動画名などの情報を動画プレイヤーの上部に移動します
 * ただし、「この動画の親作品・子作品」と「ニコニ広告」のセクションは下部に残します
 */

// 処理済みマーカー属性
const LAYOUT_MARKER = 'data-bn-layout';
const LAYOUT_CLASSIC = 'classic';
const LAYOUT_DEFAULT = 'default';
const BOTTOM_CONTAINER_ID = 'bn-bottom-sections';
const BOTTOM_CONTAINER_MARKER = 'data-bn-bottom-container';

// 動画視聴ページかどうかを判定
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * 親作品・子作品セクションを取得
 */
function getParentChildWorksSection(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll('h1'));
  const heading = headings.find(h => h.textContent?.includes('この動画の親作品・子作品'));
  if (!heading) return null;

  // セクション全体を取得（祖父母要素が該当セクションのコンテナ）
  return heading.parentElement?.parentElement as HTMLElement | null;
}

/**
 * ニコニ広告セクションを取得
 */
function getNicoAdSection(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll('h1'));
  const heading = headings.find(h => h.textContent?.includes('ニコニ広告'));
  if (!heading) return null;

  // セクション全体を取得（祖父母要素が該当セクションのコンテナ）
  return heading.parentElement?.parentElement as HTMLElement | null;
}

/**
 * 下部に残すセクション用のコンテナを作成または取得
 */
function getOrCreateBottomContainer(gridParent: HTMLElement): HTMLElement {
  let container = document.getElementById(BOTTOM_CONTAINER_ID);

  if (!container) {
    container = document.createElement('div');
    container.id = BOTTOM_CONTAINER_ID;
    container.setAttribute(BOTTOM_CONTAINER_MARKER, 'true');
    container.style.gridArea = 'bn-bottom';
    container.className = 'd_flex flex-d_column gap_x2';
    gridParent.appendChild(container);
  }

  return container;
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
  if (playerArea.getAttribute(LAYOUT_MARKER) === LAYOUT_CLASSIC) {
    return;
  }

  const parent = playerArea.parentElement as HTMLElement;

  // 下部に残すセクションを取得
  const parentChildWorks = getParentChildWorksSection();
  const nicoAd = getNicoAdSection();

  // 下部セクション用のコンテナを作成
  const bottomContainer = getOrCreateBottomContainer(parent);

  // セクションを下部コンテナに移動
  if (parentChildWorks && parentChildWorks.parentElement === bottomArea) {
    bottomContainer.appendChild(parentChildWorks);
  }
  if (nicoAd && nicoAd.parentElement === bottomArea) {
    bottomContainer.appendChild(nicoAd);
  }

  // CSS Gridのレイアウトを変更
  // 新しいグリッドエリア "bn-bottom" を追加し、プレイヤーの下に配置
  parent.style.gridTemplateAreas = '"bottom sidebar" "player sidebar" "bn-bottom sidebar"';
  parent.style.gridTemplateRows = 'min-content min-content min-content';

  // マーカーを設定
  playerArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);
  bottomArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);

  console.log('[Better Niconico] 動画情報を上部に移動しました（親作品・広告セクションは下部に保持）');
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
  if (playerArea.getAttribute(LAYOUT_MARKER) === LAYOUT_DEFAULT ||
      playerArea.getAttribute(LAYOUT_MARKER) === null) {
    return;
  }

  const parent = playerArea.parentElement as HTMLElement;

  // 下部コンテナから要素を元に戻す
  const bottomContainer = document.getElementById(BOTTOM_CONTAINER_ID);
  if (bottomContainer) {
    // 全ての子要素をbottomAreaに戻す
    while (bottomContainer.firstChild) {
      bottomArea.appendChild(bottomContainer.firstChild);
    }
    // コンテナを削除
    bottomContainer.remove();
  }

  // CSS Gridのレイアウトを元に戻す
  parent.style.gridTemplateAreas = '';
  parent.style.gridTemplateRows = '';

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
