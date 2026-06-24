/**
 * 動画再生画面のレイアウトを従来の形式に戻す機能。
 * タイトル・タグなどの情報を動画プレイヤーの上部に移動します。
 * 「動画の詳細情報」以降のセクション（親作品・子作品、ニコニ広告など）はプレイヤー下部に残します。
 *
 * == 設計方針（堅牢性）==
 * ニコニコ動画はReactベースのSPAで、動画間の遷移（おすすめクリック等）では
 * ページ全体を再読み込みせず、`.grid-area_[player]` / `.grid-area_[bottom]` などの
 * DOM要素を「再利用」し、中身（子要素）だけをReactが差し替える（実機調査で確認済み）。
 *
 * そのため本機能は、構造が動画ごとに変わる「動画の詳細情報」以降のセクション
 * （シリーズ・親子作品・ニコニ広告などは有無や数が変動する）には極力触れず、
 * Reactの管理下のまま `.grid-area_[bottom]` に残しておく。
 * 拡張側がDOM移動するのは、構造が安定している「タイトル・タグ」（＝詳細情報より前の要素）
 * だけに限定し、Reactのreconciliationとの干渉を最小化する。
 *
 * また「適用済みかどうか」はマーカー属性ではなく、
 * 「bottomArea内に未処理のタイトル・タグ（＝詳細情報セクションより前の要素）が残っているか」
 * という実DOMの状態で判定し、冪等に再適用する。
 * これにより、SPA遷移でマーカーが残っても、新しい動画へ確実に追従できる。
 */

// 処理状態を記録するマーカー属性（判定そのものには使わず、状態の可視化・他機能との競合検出用）
const LAYOUT_MARKER = 'data-bn-layout';
const LAYOUT_CLASSIC = 'classic';
const LAYOUT_DEFAULT = 'default';

// タイトル・タグを退避させる上部コンテナ
const TOP_CONTAINER_ID = 'bn-top-sections';
const TOP_CONTAINER_MARKER = 'data-bn-top-container';

// 「動画の詳細情報」セクションの見出しテキスト（この要素より前を上部へ移動する境界）
const DETAIL_INFO_HEADING = '動画の詳細情報';

// 旧実装（下部コンテナ方式）が生成していたコンテナ。アップグレード時のクリーンアップに使用。
const LEGACY_BOTTOM_CONTAINER_ID = 'bn-bottom-sections';

// クラシックレイアウトのグリッドエリア定義（上からタイトル/タグ・プレイヤー・詳細情報以降）
const CLASSIC_GRID_AREAS = '"bn-top sidebar" "player sidebar" "bottom sidebar"';

// デフォルト（ニコニコ標準）へ戻す際に復元するTailwind(Panda CSS)クラス
const DEFAULT_GRID_CLASSES = {
  rows: 'grid-tr_[min-content_min-content_1fr]',
  areas: 'grid-template-areas_[_"player_sidebar"_"bottom_sidebar"_"bottom_sidebar"_]',
  cols: 'grid-tc_[var(--watch-player-width)_var(--watch-sidebar-width)]',
};

// サイドバーのsticky位置・高さ。ニコニコがプレイヤー領域の親に定義しているヘッダー高さCSS変数を利用し、
// 変数が無い環境では実測値にフォールバックする（共通ヘッダー36px + Webヘッダー56px = 92px を実機調査で確認）。
// 各項を個別に加減算する「フラットなcalc」にしている（ネストしたcalc/括弧は一部環境でパースされないため）。
const SIDEBAR_STICKY_TOP =
  'calc(var(--common-header-height, 36px) + var(--web-header-height, 56px) + 8px)';
const SIDEBAR_MAX_HEIGHT =
  'calc(100vh - var(--common-header-height, 36px) - var(--web-header-height, 56px) - 16px)';

// 現在の設定状態（全画面から復帰した際の再適用判定に使用）
let currentEnabled = false;

// 全画面表示イベントリスナーのセットアップ済みフラグ
let listenerSetup = false;

/** 動画視聴ページかどうかを判定 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * 全画面表示中かどうかを判定。
 * 全画面表示中にグリッドレイアウトを変更すると画面が真っ暗になるため、適用をスキップする目的で使用する。
 */
function isFullscreenMode(): boolean {
  // Fullscreen APIによる検出（最も確実）
  if (document.fullscreenElement) {
    return true;
  }
  // フォールバック: 全画面表示時に出現するDOM要素を検出
  // 参考: https://github.com/Bymnet1845/niconico-classic
  const fullscreenElement = document.querySelector(
    '.grid-area_\\[player\\] > .w_\\[100dvw\\].h_\\[100dvh\\]',
  );
  return fullscreenElement !== null;
}

/** 視聴ページの主要グリッド要素をまとめて取得 */
function getLayoutElements(): {
  playerArea: HTMLElement;
  bottomArea: HTMLElement;
  sidebar: HTMLElement | null;
  parent: HTMLElement;
} | null {
  const playerArea = document.querySelector<HTMLElement>('.grid-area_\\[player\\]');
  const bottomArea = document.querySelector<HTMLElement>('.grid-area_\\[bottom\\]');
  const sidebar = document.querySelector<HTMLElement>('.grid-area_\\[sidebar\\]');
  if (!playerArea || !bottomArea || !playerArea.parentElement) {
    return null;
  }
  return { playerArea, bottomArea, sidebar, parent: playerArea.parentElement };
}

/**
 * bottomArea直下の「動画の詳細情報」セクションを取得。
 * ページ全体ではなくbottomArea内に限定することで、サイドバー等の同名見出しによる誤検出を防ぐ。
 */
function getDetailInfoSection(bottomArea: HTMLElement): HTMLElement | null {
  const headings = Array.from(bottomArea.querySelectorAll('h1'));
  const heading = headings.find((h) => h.textContent?.includes(DETAIL_INFO_HEADING));
  if (!heading) return null;
  const section = heading.closest('section');
  // bottomAreaの直接の子セクションであることを保証（移動境界として安全に扱える形のみ採用）
  if (section && section.parentElement === bottomArea) {
    return section as HTMLElement;
  }
  return null;
}

/** タイトル・タグを退避する上部コンテナを作成または取得 */
function getOrCreateTopContainer(gridParent: HTMLElement): HTMLElement {
  let container = document.getElementById(TOP_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = TOP_CONTAINER_ID;
    container.setAttribute(TOP_CONTAINER_MARKER, 'true');
    container.style.gridArea = 'bn-top';
    container.style.alignSelf = 'start';
    container.className = 'd_flex flex-d_column gap_x2';
    // 視覚順（上＝タイトル/タグ）に合わせDOM上も先頭へ。配置自体はgrid-areaで決まる。
    gridParent.insertBefore(container, gridParent.firstChild);
  }
  return container;
}

/**
 * 親要素のクラスのうち、指定prefixで「始まる」ものをすべて除去。
 * Panda CSSのグリッドクラス（`grid-tr_[...]` 等）は実機上いずれもprefixが先頭にある（実機調査で確認済み）。
 * `includes`（部分一致）ではなく`startsWith`（前方一致）にすることで、
 * 万一prefixを途中に含む無関係クラス（例: `[&_.grid-tr_x]:...`）を巻き込まないようにする。
 */
function removeClassesByPrefix(el: HTMLElement, prefixes: readonly string[]): void {
  for (const cls of Array.from(el.classList)) {
    if (prefixes.some((p) => cls.startsWith(p))) {
      el.classList.remove(cls);
    }
  }
}

/** 親要素のクラスに、指定prefixで始まるものが1つでも存在するか */
function hasClassWithPrefix(el: HTMLElement, prefix: string): boolean {
  return Array.from(el.classList).some((cls) => cls.startsWith(prefix));
}

/** クラシックレイアウト用のグリッド・サイドバースタイルを冪等に適用 */
function applyClassicGridStyles(
  parent: HTMLElement,
  playerArea: HTMLElement,
  bottomArea: HTMLElement,
  sidebar: HTMLElement | null,
): void {
  // 行高さ・エリア・列を指定するTailwindクラスを外し、インラインスタイルで上書きする
  removeClassesByPrefix(parent, ['grid-tr_', 'grid-template-areas_', 'grid-tc_']);

  parent.style.gridTemplateAreas = CLASSIC_GRID_AREAS;
  parent.style.gridTemplateRows = 'auto auto auto';
  parent.style.gridTemplateColumns = 'var(--watch-player-width) var(--watch-sidebar-width)';
  parent.style.alignItems = 'start';

  playerArea.style.alignSelf = 'start';
  bottomArea.style.alignSelf = 'start';

  // サイドバーの高さをヘッダー分を考慮して制限し、stickyで追従させる
  if (sidebar) {
    sidebar.style.maxHeight = SIDEBAR_MAX_HEIGHT;
    sidebar.style.overflowY = 'auto';
    sidebar.style.position = 'sticky';
    sidebar.style.top = SIDEBAR_STICKY_TOP;
  }
}

/**
 * タイトル・タグをプレイヤー上部へ移動し、クラシックレイアウトを適用する。
 * 実DOMの状態を見て冪等に動作するため、初回適用・再適用・SPA遷移後のいずれでも安全。
 */
function restoreClassicLayout(): void {
  if (!isWatchPage()) {
    return;
  }
  // 全画面表示中はグリッド変更で画面が暗転するためスキップ（fullscreenchangeイベント側で処理）
  if (isFullscreenMode()) {
    return;
  }

  const elements = getLayoutElements();
  if (!elements) {
    return;
  }
  const { playerArea, bottomArea, sidebar, parent } = elements;

  // bottomArea内に「動画の詳細情報」セクションがある場合のみ、その前（タイトル・タグ）を上部へ退避する。
  // 退避済み（再適用・SPA遷移後で構造が同じ）なら詳細情報の前に要素が無く、移動は発生しない（冪等）。
  const detailSection = getDetailInfoSection(bottomArea);
  if (detailSection) {
    const elementsToMove: HTMLElement[] = [];
    for (const child of Array.from(bottomArea.children)) {
      if (child === detailSection) break;
      elementsToMove.push(child as HTMLElement);
    }
    if (elementsToMove.length > 0) {
      const topContainer = getOrCreateTopContainer(parent);
      // SPA遷移でReactが要素を作り直した場合に備え、退避コンテナに残る
      // 「今回移動する要素に含まれない古い残骸」を除去して重複表示を防ぐ。
      for (const existing of Array.from(topContainer.children)) {
        if (!elementsToMove.includes(existing as HTMLElement)) {
          existing.remove();
        }
      }
      for (const el of elementsToMove) {
        if (el.parentElement === bottomArea) {
          topContainer.appendChild(el);
        }
      }
    }
  }

  applyClassicGridStyles(parent, playerArea, bottomArea, sidebar);

  playerArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);
  bottomArea.setAttribute(LAYOUT_MARKER, LAYOUT_CLASSIC);
}

/** レイアウトをニコニコ標準（デフォルト）の位置に戻す */
function restoreDefaultLayout(): void {
  if (!isWatchPage()) {
    return;
  }

  const elements = getLayoutElements();
  if (!elements) {
    return;
  }
  const { playerArea, bottomArea, sidebar, parent } = elements;

  const topContainer = document.getElementById(TOP_CONTAINER_ID);
  const legacyBottom = document.getElementById(LEGACY_BOTTOM_CONTAINER_ID);

  // 既にデフォルト状態（退避コンテナが無くマーカーもclassicでない）なら何もしない
  if (!topContainer && !legacyBottom && playerArea.getAttribute(LAYOUT_MARKER) !== LAYOUT_CLASSIC) {
    return;
  }

  // 上部コンテナのタイトル・タグをbottomAreaの先頭へ戻す（末尾から挿入して元の順序を維持）
  if (topContainer) {
    const children = Array.from(topContainer.children);
    for (let i = children.length - 1; i >= 0; i--) {
      bottomArea.insertBefore(children[i], bottomArea.firstChild);
    }
    topContainer.remove();
  }

  // 旧実装（下部コンテナ方式）の名残があれば、中身をbottomAreaへ戻してから除去
  if (legacyBottom) {
    while (legacyBottom.firstChild) {
      bottomArea.appendChild(legacyBottom.firstChild);
    }
    legacyBottom.remove();
  }

  // 削除したTailwindクラスを復元（前方一致で既存判定し、重複追加を防ぐ）
  if (!hasClassWithPrefix(parent, 'grid-tr_')) {
    parent.classList.add(DEFAULT_GRID_CLASSES.rows);
  }
  if (!hasClassWithPrefix(parent, 'grid-template-areas_')) {
    parent.classList.add(DEFAULT_GRID_CLASSES.areas);
  }
  if (!hasClassWithPrefix(parent, 'grid-tc_')) {
    parent.classList.add(DEFAULT_GRID_CLASSES.cols);
  }

  // インラインスタイルをクリア
  parent.style.gridTemplateAreas = '';
  parent.style.gridTemplateRows = '';
  parent.style.gridTemplateColumns = '';
  parent.style.alignItems = '';
  bottomArea.style.alignSelf = '';
  playerArea.style.alignSelf = '';

  if (sidebar) {
    sidebar.style.maxHeight = '';
    sidebar.style.overflowY = '';
    sidebar.style.position = '';
    sidebar.style.top = '';
  }

  playerArea.setAttribute(LAYOUT_MARKER, LAYOUT_DEFAULT);
  bottomArea.setAttribute(LAYOUT_MARKER, LAYOUT_DEFAULT);
}

/**
 * 全画面表示イベントのリスナーをセットアップ。
 * 全画面表示への遷移時はデフォルトに戻し、復帰時に設定がONなら再適用する。
 */
function setupFullscreenListener(): void {
  if (!isWatchPage()) {
    return;
  }
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      // 全画面表示に入った場合は強制的にデフォルトへ戻す（暗転防止）
      restoreDefaultLayout();
    } else if (currentEnabled) {
      // 全画面表示から抜け、設定がONならDOM更新を待ってから再適用
      setTimeout(() => {
        restoreClassicLayout();
      }, 100);
    }
  });
}

/**
 * 設定を適用する。
 * @param enabled true: クラシックレイアウト / false: デフォルトレイアウト
 */
export function apply(enabled: boolean): void {
  currentEnabled = enabled;

  // 初回のみ全画面表示イベントリスナーをセットアップ
  if (!listenerSetup && isWatchPage()) {
    setupFullscreenListener();
    listenerSetup = true;
  }

  if (enabled) {
    // 全画面表示中は適用しない（fullscreenchangeイベントで処理）
    if (isFullscreenMode()) {
      return;
    }
    restoreClassicLayout();
  } else {
    restoreDefaultLayout();
  }
}
