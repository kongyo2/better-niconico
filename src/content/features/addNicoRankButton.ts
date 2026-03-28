/**
 * サイドバーにnico-rank.comへのボタンを追加する機能
 * video_topページの左サイドバーに「ニコラン」ボタンを追加します
 *
 * サイドバーは折りたたみ時と展開時で異なるCSSクラスを使用します:
 * - 折りたたみ時: css-1i3qj3a (グループ), css-54sd46 (flex-column), css-ium6yj (テキスト)
 * - 展開時: css-gzpr6t (グループ), css-1xvl3dk (flex-row), css-xzkfql (テキスト)
 *
 * ニコランリンクはランキングリンクと同じグループコンテナ内に追加します。
 */

const BUTTON_MARKER = 'data-bn-nico-rank-button';
const NICO_RANK_URL = 'https://nico-rank.com/';

/**
 * サイドバーのCSSクラス定義
 */
const SIDEBAR_CLASSES = {
  /** 折りたたみ時 */
  collapsed: {
    group: 'css-1i3qj3a', // グループコンテナ
    innerDiv: 'css-54sd46', // 内部コンテナ（flex-column）
    text: 'css-ium6yj', // テキストのクラス
  },
  /** 展開時 */
  expanded: {
    group: 'css-gzpr6t', // グループコンテナ
    innerDiv: 'css-1xvl3dk', // 内部コンテナ（flex-row）
    text: 'css-xzkfql', // テキストのクラス
  },
  /** 共通 */
  common: {
    link: 'css-1i9dz1a', // リンクのクラス
    iconContainer: 'css-14y3bdu', // アイコンコンテナ
  },
} as const;

const GROUP_SELECTOR = `.${SIDEBAR_CLASSES.collapsed.group}, .${SIDEBAR_CLASSES.expanded.group}`;

/**
 * 表彰台のSVGアイコンを生成
 * nico-rank.comのシンボルである表彰台（1位、2位、3位）を表現
 */
function createPodiumIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="19" fill="none" viewBox="0 0 22 19">
    <rect x="1" y="11" width="4.5" height="7" fill="#3B3B3B" rx="0.5"/>
    <rect x="7.5" y="6" width="4.5" height="12" fill="#3B3B3B" rx="0.5"/>
    <rect x="14" y="14" width="4.5" height="4" fill="#3B3B3B" rx="0.5"/>
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
 * ランキングリンクのグループが展開状態かどうかを判定
 */
function isExpandedGroup(group: HTMLElement): boolean {
  return group.classList.contains(SIDEBAR_CLASSES.expanded.group);
}

/**
 * nico-rank.comリンクを作成
 * ランキングリンクの現在の状態に合わせた内部構造を再現
 */
function createNicoRankLink(isExpanded: boolean): HTMLElement {
  const classes = isExpanded ? SIDEBAR_CLASSES.expanded : SIDEBAR_CLASSES.collapsed;

  const link = document.createElement('a');
  link.href = NICO_RANK_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = SIDEBAR_CLASSES.common.link;
  link.setAttribute(BUTTON_MARKER, 'true');

  const containerDiv = document.createElement('div');
  containerDiv.className = classes.innerDiv;

  const iconDiv = document.createElement('div');
  iconDiv.className = SIDEBAR_CLASSES.common.iconContainer;
  iconDiv.innerHTML = createPodiumIcon();

  const textDiv = document.createElement('div');
  const textParagraph = document.createElement('p');
  textParagraph.className = classes.text;
  textParagraph.textContent = 'ニコラン';
  textDiv.appendChild(textParagraph);

  containerDiv.appendChild(iconDiv);
  containerDiv.appendChild(textDiv);
  link.appendChild(containerDiv);

  return link;
}

/**
 * ニコランボタンを追加
 * ランキングリンクと同じグループコンテナ内に挿入する
 */
function addNicoRankButton(): void {
  if (!isVideoTopPage()) {
    return;
  }

  const sidebarContainer = getSidebarContainer();
  if (!sidebarContainer) {
    return;
  }

  // 既にボタンが存在する場合は何もしない
  if (document.querySelector(`[${BUTTON_MARKER}]`)) {
    return;
  }

  // サイドバー内のランキングリンクを探す
  const rankingLink = Array.from(
    sidebarContainer.querySelectorAll<HTMLAnchorElement>(`a.${SIDEBAR_CLASSES.common.link}`),
  ).find((link) => link.textContent?.trim() === 'ランキング' && link.href.includes('/ranking'));

  if (!rankingLink) {
    return;
  }

  // ランキングリンクのグループコンテナを取得
  const rankingGroup = rankingLink.closest(GROUP_SELECTOR) as HTMLElement;
  if (!rankingGroup) {
    return;
  }

  // 状態に応じたニコランリンクを作成し、ランキングリンクの直後に挿入
  const isExpanded = isExpandedGroup(rankingGroup);
  const nicoRankLink = createNicoRankLink(isExpanded);
  rankingLink.insertAdjacentElement('afterend', nicoRankLink);

  console.log('[Better Niconico] ニコランボタンを追加しました');
}

/**
 * 既存のニコランボタンのクラスを現在のサイドバー状態に同期する
 */
function syncNicoRankClasses(): void {
  const button = document.querySelector(`[${BUTTON_MARKER}]`) as HTMLElement;
  if (!button) {
    return;
  }

  const group = button.closest(GROUP_SELECTOR) as HTMLElement;
  if (!group) {
    return;
  }

  const isExpanded = isExpandedGroup(group);
  const classes = isExpanded ? SIDEBAR_CLASSES.expanded : SIDEBAR_CLASSES.collapsed;

  const innerDiv = button.querySelector('div');
  if (innerDiv) {
    innerDiv.className = classes.innerDiv;
  }
  const textP = button.querySelector('p');
  if (textP) {
    textP.className = classes.text;
  }
}

/**
 * ボタンを削除する
 */
function removeNicoRankButton(): void {
  const buttons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
  buttons.forEach((button) => button.remove());

  if (buttons.length > 0) {
    console.log('[Better Niconico] ニコランボタンを削除しました');
  }
}

/**
 * サイドバーの状態変更を監視するMutationObserver
 * ハンバーガーメニュー等でサイドバーの展開/折りたたみが切り替わった際に
 * ニコランボタンのクラスを同期する
 */
let sidebarObserver: MutationObserver | null = null;

function startSidebarObserver(): void {
  if (sidebarObserver) {
    return;
  }

  const sidebarContainer = getSidebarContainer();
  if (!sidebarContainer) {
    return;
  }

  sidebarObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // ニコランボタン自身やその子要素のクラス変更は無視（無限ループ防止）
      const target = mutation.target as HTMLElement;
      if (target.closest(`[${BUTTON_MARKER}]`)) {
        continue;
      }
      syncNicoRankClasses();
      break;
    }
  });

  sidebarObserver.observe(sidebarContainer, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true,
  });
}

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
    addNicoRankButton();
    startSidebarObserver();
  } else {
    stopSidebarObserver();
    removeNicoRankButton();
  }
}
