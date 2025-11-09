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

// 現在の設定状態を保持（全画面表示から抜けた後の再適用に使用）
let currentEnabled = false;

// 全画面表示イベントリスナーのセットアップ状態
let listenerSetup = false;

// 動画視聴ページかどうかを判定
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * 全画面表示中かどうかを判定
 * Fullscreen APIを使用した確実な検出 + フォールバック
 */
function isFullscreenMode(): boolean {
  // Fullscreen APIを使った検出（最も確実）
  if (document.fullscreenElement) {
    return true;
  }

  // フォールバック: DOM要素ベースの検出
  // 全画面表示時には .grid-area_[player] の直下に .w_[100dvw].h_[100dvh] という要素が出現する
  // 参考: https://github.com/Bymnet1845/niconico-classic
  const fullscreenElement = document.querySelector('.grid-area_\\[player\\] > .w_\\[100dvw\\].h_\\[100dvh\\]');
  return fullscreenElement !== null;
}

/**
 * 動画の詳細情報セクションを取得
 */
function getDetailInfoSection(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll('h1'));
  const heading = headings.find(h => h.textContent?.includes('動画の詳細情報'));
  if (!heading) return null;

  // セクション全体を取得（最も近いSECTION要素を探す）
  return heading.closest('section') as HTMLElement | null;
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

  // 全画面表示中の場合は、レイアウト変更をスキップ
  // 全画面表示中にグリッドレイアウトを変更すると画面が真っ暗になるため
  if (isFullscreenMode()) {
    console.log('[Better Niconico] 全画面表示中のため、クラシックレイアウトの適用をスキップします');
    return;
  }

  // 動画プレイヤーのエリア
  const playerArea = document.querySelector('.grid-area_\\[player\\]') as HTMLElement;

  // 動画情報のエリア（タイトル、タグ、投稿者情報など）
  const bottomArea = document.querySelector('.grid-area_\\[bottom\\]') as HTMLElement;

  // サイドバーエリア
  const sidebar = document.querySelector('.grid-area_\\[sidebar\\]') as HTMLElement;

  if (!playerArea || !bottomArea || !sidebar || !playerArea.parentElement) {
    return;
  }

  // すでにクラシックレイアウトの場合は何もしない
  if (playerArea.getAttribute(LAYOUT_MARKER) === LAYOUT_CLASSIC) {
    return;
  }

  const parent = playerArea.parentElement as HTMLElement;

  // 動画の詳細情報セクションを取得（これより上の要素は上部に表示）
  const detailInfoSection = getDetailInfoSection();
  if (!detailInfoSection) {
    // 詳細情報セクションが見つからない場合は何もしない
    return;
  }

  // 下部に移動するセクションを収集
  // 詳細情報セクションより後ろにある全ての要素を取得
  const elementsToMove: HTMLElement[] = [];
  let foundDetailInfo = false;

  Array.from(bottomArea.children).forEach((child) => {
    if (child === detailInfoSection) {
      foundDetailInfo = true;
      // 詳細情報セクション自体も下部に移動
      elementsToMove.push(child as HTMLElement);
    } else if (foundDetailInfo) {
      // 詳細情報セクション以降の全ての要素を移動対象に
      elementsToMove.push(child as HTMLElement);
    }
  });

  if (elementsToMove.length === 0) {
    return;
  }

  // 下部セクション用のコンテナを作成
  const bottomContainer = getOrCreateBottomContainer(parent);

  // 要素を下部コンテナに移動
  elementsToMove.forEach((element) => {
    if (element.parentElement === bottomArea) {
      bottomContainer.appendChild(element);
    }
  });

  // Tailwindの grid-tr_ クラスを削除（行の高さが固定されるのを防ぐ）
  const classesArray = Array.from(parent.classList);
  const gridTrClass = classesArray.find((c) => c.includes('grid-tr_'));
  if (gridTrClass) {
    parent.classList.remove(gridTrClass);
  }

  // grid-template-areas_ クラスも削除（インラインスタイルで上書き）
  const gridTemplateAreasClass = classesArray.find((c) => c.includes('grid-template-areas_'));
  if (gridTemplateAreasClass) {
    parent.classList.remove(gridTemplateAreasClass);
  }

  // grid-tc_ クラスも削除（インラインスタイルで上書き）
  const gridTcClass = classesArray.find((c) => c.includes('grid-tc_'));
  if (gridTcClass) {
    parent.classList.remove(gridTcClass);
  }

  // サイドバーの高さを制限して、グリッド行の高さが巨大にならないようにする
  sidebar.style.maxHeight = 'calc(100vh - 80px)'; // ヘッダー分を引く
  sidebar.style.overflowY = 'auto';
  sidebar.style.position = 'sticky';
  sidebar.style.top = '80px';

  // CSS Gridのレイアウトを変更
  // 新しいグリッドエリア "bn-bottom" を追加し、プレイヤーの下に配置
  parent.style.gridTemplateAreas = '"bottom sidebar" "player sidebar" "bn-bottom sidebar"';
  parent.style.gridTemplateRows = 'auto auto auto';
  parent.style.gridTemplateColumns = 'var(--watch-player-width) var(--watch-sidebar-width)';
  parent.style.alignItems = 'start';

  // 各グリッドアイテムに align-self: start を設定
  bottomArea.style.alignSelf = 'start';
  playerArea.style.alignSelf = 'start';
  bottomContainer.style.alignSelf = 'start';

  // マーカーを設定
  playerArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);
  bottomArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);

  console.log('[Better Niconico] 動画情報を上部に移動しました（詳細情報以下は下部に保持）');
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
  const sidebar = document.querySelector('.grid-area_\\[sidebar\\]') as HTMLElement;

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

  // 削除したTailwindクラスを復元
  if (!parent.className.includes('grid-tr_')) {
    parent.classList.add('grid-tr_[min-content_min-content_1fr]');
  }
  if (!parent.className.includes('grid-template-areas_')) {
    parent.classList.add('grid-template-areas_[_"player_sidebar"_"bottom_sidebar"_"bottom_sidebar"_]');
  }
  if (!parent.className.includes('grid-tc_')) {
    parent.classList.add('grid-tc_[var(--watch-player-width)_var(--watch-sidebar-width)]');
  }

  // CSS Gridのインラインスタイルを削除
  parent.style.gridTemplateAreas = '';
  parent.style.gridTemplateRows = '';
  parent.style.gridTemplateColumns = '';
  parent.style.alignItems = '';

  // グリッドアイテムのスタイルをリセット
  bottomArea.style.alignSelf = '';
  playerArea.style.alignSelf = '';

  // サイドバーのスタイルをリセット
  if (sidebar) {
    sidebar.style.maxHeight = '';
    sidebar.style.overflowY = '';
    sidebar.style.position = '';
    sidebar.style.top = '';
  }

  // マーカーを設定
  playerArea.setAttribute(LAYOUT_MARKER, LAYOUT_DEFAULT);
  bottomArea.setAttribute(LAYOUT_MARKER, LAYOUT_DEFAULT);

  console.log('[Better Niconico] レイアウトを元に戻しました');
}

/**
 * 全画面表示イベントのリスナーをセットアップ
 * 全画面表示への遷移を確実に捕捉し、レイアウトを適切に切り替える
 */
function setupFullscreenListener(): void {
  if (!isWatchPage()) {
    return;
  }

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      // 全画面表示に入った - 強制的にデフォルトレイアウトに戻す
      console.log('[Better Niconico] 全画面表示に入りました。レイアウトをデフォルトに戻します。');
      restoreDefaultLayout();
    } else {
      // 全画面表示から抜けた - 設定がONなら自動的にクラシックレイアウトを再適用
      console.log('[Better Niconico] 全画面表示から抜けました。');
      if (currentEnabled) {
        // DOM更新を待つために少し遅延させる
        setTimeout(() => {
          console.log('[Better Niconico] クラシックレイアウトを再適用します。');
          restoreClassicLayout();
        }, 100);
      }
    }
  });

  console.log('[Better Niconico] 全画面表示イベントリスナーをセットアップしました');
}

/**
 * 設定を適用する
 * @param enabled - true: クラシックレイアウト, false: デフォルトレイアウト
 */
export function apply(enabled: boolean): void {
  // 現在の設定状態を保存
  currentEnabled = enabled;

  // 初回のみ全画面表示イベントリスナーをセットアップ
  if (!listenerSetup && isWatchPage()) {
    setupFullscreenListener();
    listenerSetup = true;
  }

  if (enabled) {
    // 全画面表示中は適用しない（fullscreenchangeイベントで処理）
    if (isFullscreenMode()) {
      console.log('[Better Niconico] 全画面表示中のため、クラシックレイアウトの適用をスキップします');
      return;
    }

    // 通常時はクラシックレイアウトを適用
    restoreClassicLayout();
  } else {
    restoreDefaultLayout();
  }
}
