/**
 * サイドバーにnico-rank.comへのボタンを追加する機能
 * video_topページの左サイドバーに「ニコラン」ボタンを追加します
 */

const BUTTON_MARKER = 'data-bn-nico-rank-button';
const CONTAINER_MARKER = 'data-bn-nico-rank-container';
const NICO_RANK_URL = 'https://nico-rank.com/';

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
  return window.location.pathname === '/video_top' || window.location.pathname.startsWith('/video_top');
}

/**
 * サイドバーのコンテナを取得
 */
function getSidebarContainer(): HTMLElement | null {
  return document.querySelector('.simplebar-content');
}

/**
 * ランキングリンクを探す
 */
function findRankingLink(): HTMLAnchorElement | null {
  const links = document.querySelectorAll<HTMLAnchorElement>('a.css-1i9dz1a');
  for (const link of links) {
    if (link.textContent?.trim() === 'ランキング' && link.href.includes('/ranking')) {
      return link;
    }
  }
  return null;
}

/**
 * 既存のボタンが追加されているかチェック
 * 展開時と折りたたみ時の両方をチェック
 */
function hasButtonBeenAdded(): boolean {
  const existingButtons = document.querySelectorAll(`[${BUTTON_MARKER}]`);
  return existingButtons.length > 0;
}

/**
 * ランキングの親要素の次の兄弟要素にボタンが追加されているかチェック
 */
function hasButtonAfterRanking(rankingParent: HTMLElement): boolean {
  // 次の兄弟要素をチェック
  const nextSibling = rankingParent.nextElementSibling as HTMLElement;
  if (!nextSibling) {
    return false;
  }
  
  // 次の兄弟要素がニコランボタンのコンテナかどうかをチェック
  return nextSibling.hasAttribute(CONTAINER_MARKER) || nextSibling.querySelector(`[${BUTTON_MARKER}]`) !== null;
}

/**
 * nico-rank.comボタンを作成
 */
function createNicoRankButton(): HTMLElement {
  // ランキングリンクの構造を正確に再現
  const link = document.createElement('a');
  link.href = NICO_RANK_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'css-1i9dz1a';
  link.setAttribute(BUTTON_MARKER, 'true');
  
  // ランキングリンクと同じ内部構造を作成
  const containerDiv = document.createElement('div');
  containerDiv.className = 'css-54sd46';
  
  // アイコン用のDIV（表彰台アイコンを追加）
  const iconDiv = document.createElement('div');
  iconDiv.className = 'css-14y3bdu';
  iconDiv.innerHTML = createPodiumIcon();
  
  // テキスト用のDIV
  const textDiv = document.createElement('div');
  const textParagraph = document.createElement('p');
  textParagraph.className = 'css-ium6yj';
  textParagraph.textContent = 'ニコラン';
  textDiv.appendChild(textParagraph);
  
  containerDiv.appendChild(iconDiv);
  containerDiv.appendChild(textDiv);
  link.appendChild(containerDiv);
  
  return link;
}

/**
 * ランキングリンクの親要素を探す（展開時と折りたたみ時の両方に対応）
 */
function findRankingParent(): HTMLElement | null {
  const rankingLink = findRankingLink();
  if (!rankingLink) {
    return null;
  }
  
  // 展開時と折りたたみ時の両方のクラス名をチェック
  const parent = rankingLink.closest('.css-1i3qj3a, .css-gzpr6t') as HTMLElement;
  return parent;
}

/**
 * ボタンを追加する（展開時と折りたたみ時の両方に対応）
 */
function addNicoRankButton(): void {
  // video_topページでない場合は何もしない
  if (!isVideoTopPage()) {
    return;
  }
  
  // サイドバーコンテナを取得
  const sidebarContainer = getSidebarContainer();
  if (!sidebarContainer) {
    return;
  }
  
  // ランキングリンクの親要素を探す
  const rankingParent = findRankingParent();
  if (!rankingParent) {
    return;
  }
  
  // ランキングの親要素の後にすでにボタンが追加されている場合はスキップ
  if (hasButtonAfterRanking(rankingParent)) {
    return;
  }
  
  // ランキングの親要素の後に新しいメニュー項目コンテナを作成
  // 展開時と折りたたみ時の両方のクラス名に対応
  const menuContainer = document.createElement('div');
  // 現在のランキングの親要素のクラス名をコピー（展開時と折りたたみ時の両方に対応）
  menuContainer.className = rankingParent.className;
  menuContainer.setAttribute(CONTAINER_MARKER, 'true');
  
  // ボタンを作成
  const button = createNicoRankButton();
  menuContainer.appendChild(button);
  
  // ランキングの親要素の後に挿入
  const nextSibling = rankingParent.nextElementSibling;
  if (nextSibling) {
    rankingParent.parentElement?.insertBefore(menuContainer, nextSibling);
  } else {
    rankingParent.parentElement?.appendChild(menuContainer);
  }
  
  console.log('[Better Niconico] ニコランボタンを追加しました');
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
  const rankingLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.css-1i9dz1a')).filter(
    link => link.textContent?.trim() === 'ランキング' && link.href.includes('/ranking')
  );
  
  for (const rankingLink of rankingLinks) {
    // 各ランキングリンクの親要素を取得
    const rankingParent = rankingLink.closest('.css-1i3qj3a, .css-gzpr6t') as HTMLElement;
    if (!rankingParent) {
      continue;
    }
    
    // ランキングの親要素の後にすでにボタンが追加されている場合はスキップ
    if (hasButtonAfterRanking(rankingParent)) {
      continue;
    }
    
    // ランキングの親要素の後に新しいメニュー項目コンテナを作成
    const menuContainer = document.createElement('div');
    menuContainer.className = rankingParent.className;
    menuContainer.setAttribute(CONTAINER_MARKER, 'true');
    
    // ボタンを作成
    const button = createNicoRankButton();
    menuContainer.appendChild(button);
    
    // ランキングの親要素の後に挿入
    const nextSibling = rankingParent.nextElementSibling;
    if (nextSibling) {
      rankingParent.parentElement?.insertBefore(menuContainer, nextSibling);
    } else {
      rankingParent.parentElement?.appendChild(menuContainer);
    }
  }
  
  if (rankingLinks.length > 0) {
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
  
  containers.forEach(container => container.remove());
  buttons.forEach(button => button.remove());
  
  if (containers.length > 0 || buttons.length > 0) {
    console.log('[Better Niconico] ニコランボタンを削除しました');
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
  } else {
    removeNicoRankButton();
  }
}

