/**
 * サイドバーにnico-rank.comへのボタンを追加する機能
 * video_topページの左サイドバーに「ニコラン」ボタンを追加します
 *
 * サイドバーは展開時と折りたたみ時で異なるCSSクラスを使用します:
 * - 折りたたみ時 (幅80px): css-1i3qj3a, css-54sd46, css-ium6yj
 * - 展開時 (幅226px): css-gzpr6t, css-1xvl3dk, css-xzkfql
 */

const BUTTON_MARKER = 'data-bn-nico-rank-button';
const CONTAINER_MARKER = 'data-bn-nico-rank-container';
const NICO_RANK_URL = 'https://nico-rank.com/';

/**
 * サイドバーのCSSクラス定義
 * 実際のページでは折りたたみ時と展開時でクラス名が異なる
 */
const SIDEBAR_CLASSES = {
  /** 折りたたみ時 */
  collapsed: {
    container: 'css-1i3qj3a', // メニューアイテムコンテナ
    innerDiv: 'css-54sd46', // 内部コンテナ
    textClass: 'css-ium6yj', // テキストのクラス
  },
  /** 展開時 */
  expanded: {
    container: 'css-gzpr6t', // メニューアイテムコンテナ
    innerDiv: 'css-1xvl3dk', // 内部コンテナ
    textClass: 'css-xzkfql', // テキストのクラス
  },
  /** 共通 */
  common: {
    link: 'css-1i9dz1a', // リンクのクラス
    iconContainer: 'css-14y3bdu', // アイコンコンテナ
  },
} as const;

/**
 * 表彰台のSVGアイコンを生成
 * nico-rank.comのシンボルである表彰台（1位、2位、3位）を表現
 */
function createPodiumIcon(): string {
  // 表彰台のSVG（1位、2位、3位の段階的なデザイン）
  // ランキングアイコンと同じサイズ（22x19）に合わせる
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="19" fill="none" viewBox="0 0 22 19">
    <!-- 2位（左、中程度の高さ） -->
    <rect x="1" y="11" width="4.5" height="7" fill="#3B3B3B" rx="0.5"/>
    <!-- 1位（中央、最も高い） -->
    <rect x="7.5" y="6" width="4.5" height="12" fill="#3B3B3B" rx="0.5"/>
    <!-- 3位（右、最も低い） -->
    <rect x="14" y="14" width="4.5" height="4" fill="#3B3B3B" rx="0.5"/>
    <!-- 台座のベース（統一感のため） -->
    <rect x="0.5" y="17.5" width="21" height="1" fill="#3B3B3B" rx="0.5"/>
  </svg>`;
}

/**
 * video_topページかどうかを判定
 */
function isVideoTopPage(): boolean {
  return (
    window.location.pathname === '/video_top' || window.location.pathname.startsWith('/video_top')
  );
}

/**
 * サイドバーのコンテナを取得
 */
function getSidebarContainer(): HTMLElement | null {
  return document.querySelector('.simplebar-content');
}

/**
 * 親コンテナから展開状態かどうかを判定
 * @param container - ランキングリンクの親コンテナ
 * @returns true: 展開時, false: 折りたたみ時
 */
function isExpandedState(container: HTMLElement): boolean {
  return container.classList.contains(SIDEBAR_CLASSES.expanded.container);
}

/**
 * ランキングの親要素の次の兄弟要素にボタンが追加されているかチェック
 * @returns オブジェクト { exists: ボタンが存在するか, needsUpdate: クラス更新が必要か }
 */
function checkExistingButton(rankingParent: HTMLElement): { exists: boolean; needsUpdate: boolean } {
  // 次の兄弟要素をチェック
  const nextSibling = rankingParent.nextElementSibling as HTMLElement;
  if (!nextSibling) {
    return { exists: false, needsUpdate: false };
  }

  // 次の兄弟要素がニコランボタンのコンテナかどうかをチェック
  const isNicoRankContainer =
    nextSibling.hasAttribute(CONTAINER_MARKER) ||
    nextSibling.querySelector(`[${BUTTON_MARKER}]`) !== null;

  if (!isNicoRankContainer) {
    return { exists: false, needsUpdate: false };
  }

  // ボタンは存在する。クラスが現在のサイドバー状態と一致するか確認
  const isExpanded = isExpandedState(rankingParent);
  const expectedContainerClass = isExpanded
    ? SIDEBAR_CLASSES.expanded.container
    : SIDEBAR_CLASSES.collapsed.container;

  // コンテナのクラスが期待するクラスと一致するか
  const needsUpdate = nextSibling.className !== expectedContainerClass;

  return { exists: true, needsUpdate };
}

/**
 * 既存のニコランボタンを更新する
 * サイドバーの状態が変わった場合、ボタンのクラスを更新する
 */
function updateExistingButton(nicoRankContainer: HTMLElement, isExpanded: boolean): void {
  const classes = isExpanded ? SIDEBAR_CLASSES.expanded : SIDEBAR_CLASSES.collapsed;

  // コンテナのクラスを更新
  nicoRankContainer.className = classes.container;
  nicoRankContainer.setAttribute(CONTAINER_MARKER, 'true');

  // ボタン内部のクラスを更新
  const button = nicoRankContainer.querySelector(`[${BUTTON_MARKER}]`);
  if (button) {
    // 内部divのクラスを更新
    const innerDiv = button.querySelector('div');
    if (innerDiv) {
      innerDiv.className = classes.innerDiv;
    }
    // テキストのクラスを更新
    const textP = button.querySelector('p');
    if (textP) {
      textP.className = classes.textClass;
    }
  }
}

/**
 * nico-rank.comボタンを作成
 * @param isExpanded - サイドバーが展開状態かどうか
 */
function createNicoRankButton(isExpanded: boolean): HTMLElement {
  // 状態に応じたクラスを選択
  const classes = isExpanded ? SIDEBAR_CLASSES.expanded : SIDEBAR_CLASSES.collapsed;

  // ランキングリンクの構造を正確に再現
  const link = document.createElement('a');
  link.href = NICO_RANK_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = SIDEBAR_CLASSES.common.link;
  link.setAttribute(BUTTON_MARKER, 'true');

  // ランキングリンクと同じ内部構造を作成
  const containerDiv = document.createElement('div');
  containerDiv.className = classes.innerDiv;

  // アイコン用のDIV（表彰台アイコンを追加）
  const iconDiv = document.createElement('div');
  iconDiv.className = SIDEBAR_CLASSES.common.iconContainer;
  iconDiv.innerHTML = createPodiumIcon();

  // テキスト用のDIV
  const textDiv = document.createElement('div');
  const textParagraph = document.createElement('p');
  textParagraph.className = classes.textClass;
  textParagraph.textContent = 'ニコラン';
  textDiv.appendChild(textParagraph);

  containerDiv.appendChild(iconDiv);
  containerDiv.appendChild(textDiv);
  link.appendChild(containerDiv);

  return link;
}

/**
 * すべてのボタンを追加（展開時と折りたたみ時の両方に対応）
 */
function addAllNicoRankButtons(): void {
  // video_topページでない場合は何もしない
  if (!isVideoTopPage()) {
    return;
  }

  // サイドバーコンテナを取得
  const sidebarContainer = getSidebarContainer();
  if (!sidebarContainer) {
    return;
  }

  // すべてのランキングリンクを探す（展開時と折りたたみ時の両方）
  const rankingLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(`a.${SIDEBAR_CLASSES.common.link}`),
  ).filter((link) => link.textContent?.trim() === 'ランキング' && link.href.includes('/ranking'));

  let addedOrUpdated = false;

  for (const rankingLink of rankingLinks) {
    // 各ランキングリンクの親要素を取得（展開時または折りたたみ時のコンテナ）
    const rankingParent = rankingLink.closest(
      `.${SIDEBAR_CLASSES.collapsed.container}, .${SIDEBAR_CLASSES.expanded.container}`,
    ) as HTMLElement;
    if (!rankingParent) {
      continue;
    }

    // 展開状態かどうかを判定
    const isExpanded = isExpandedState(rankingParent);

    // 既存のボタンをチェック
    const { exists, needsUpdate } = checkExistingButton(rankingParent);

    if (exists) {
      if (needsUpdate) {
        // 既存のボタンのクラスを更新
        const nextSibling = rankingParent.nextElementSibling as HTMLElement;
        if (nextSibling) {
          updateExistingButton(nextSibling, isExpanded);
          addedOrUpdated = true;
        }
      }
      // 既に正しいクラスで存在する場合は何もしない
      continue;
    }

    // ランキングの親要素の後に新しいメニュー項目コンテナを作成
    const menuContainer = document.createElement('div');
    menuContainer.className = rankingParent.className;
    menuContainer.setAttribute(CONTAINER_MARKER, 'true');

    // 状態に応じたボタンを作成
    const button = createNicoRankButton(isExpanded);
    menuContainer.appendChild(button);

    // ランキングの親要素の後に挿入
    const nextSibling = rankingParent.nextElementSibling;
    if (nextSibling) {
      rankingParent.parentElement?.insertBefore(menuContainer, nextSibling);
    } else {
      rankingParent.parentElement?.appendChild(menuContainer);
    }
    addedOrUpdated = true;
  }

  if (addedOrUpdated) {
    console.log('[Better Niconico] ニコランボタンを追加しました');
  }
}

/**
 * ボタンを削除する（すべてのボタンを削除）
 */
function removeNicoRankButton(): void {
  // コンテナマーカーとボタンマーカーの両方を削除
  const containers = document.querySelectorAll(`[${CONTAINER_MARKER}]`);
  const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);

  containers.forEach((container) => container.remove());
  buttons.forEach((button) => button.remove());

  if (containers.length > 0 || buttons.length > 0) {
    console.log('[Better Niconico] ニコランボタンを削除しました');
  }
}

/**
 * サイドバーのクラス属性変更を監視するMutationObserver
 * サイドバーの展開/折りたたみ時にボタンのクラスを自動更新する
 */
let sidebarObserver: MutationObserver | null = null;

/**
 * サイドバーの監視を開始
 * ランキングリンクの親要素のclass属性変更を監視し、
 * 変更があればニコランボタンのクラスを更新する
 */
function startSidebarObserver(): void {
  // 既にオブザーバーが存在する場合は何もしない
  if (sidebarObserver) {
    return;
  }

  // サイドバーコンテナを取得
  const sidebarContainer = getSidebarContainer();
  if (!sidebarContainer) {
    return;
  }

  // MutationObserverを作成
  sidebarObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // class属性の変更を検知
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target as HTMLElement;

        // ランキングリンクの親要素のクラス変更か確認
        const isRankingContainer =
          target.classList.contains(SIDEBAR_CLASSES.collapsed.container) ||
          target.classList.contains(SIDEBAR_CLASSES.expanded.container);

        if (isRankingContainer) {
          // ランキングリンクが含まれているか確認
          const rankingLink = target.querySelector(
            `a.${SIDEBAR_CLASSES.common.link}[href*="/ranking"]`,
          );
          if (rankingLink && rankingLink.textContent?.trim() === 'ランキング') {
            // ニコランボタンのクラスを更新
            addAllNicoRankButtons();
            break;
          }
        }
      }
    }
  });

  // サイドバー内の全要素のclass属性変更を監視
  sidebarObserver.observe(sidebarContainer, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true,
  });
}

/**
 * サイドバーの監視を停止
 */
function stopSidebarObserver(): void {
  if (sidebarObserver) {
    sidebarObserver.disconnect();
    sidebarObserver = null;
  }
}

/**
 * 設定を適用する
 * @param enabled - true: ボタンを追加, false: ボタンを削除
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    // 展開時と折りたたみ時の両方に対応するため、すべてのランキングリンクに対してボタンを追加
    addAllNicoRankButtons();
    // サイドバーのクラス変更監視を開始
    startSidebarObserver();
  } else {
    // 監視を停止
    stopSidebarObserver();
    removeNicoRankButton();
  }
}

