/**
 * 動画タグの横に大百科リンクを復元する
 *
 * ニコニコ動画の動画視聴ページで、タグの横に表示されていた大百科リンクを復元します。
 * 2023年以前のニコニコ動画で使用されていたスタイル（暗い赤の円形アイコン）を再現。
 * 動画情報エリア（grid-area_[bottom]）内のタグのみを対象とし、
 * 関連動画やサイドバーのタグには影響しません。
 */

const MARKER = 'data-bn-nicopedia-processed';
const LINK_MARKER = 'data-bn-nicopedia-link';

/**
 * ニコニコ大百科のSVGアイコン（元のデザインを再現）
 * 本を模したシンボルで、大百科の記事があることを示す
 */
const NICODIC_ICON_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="1.4"><path d="M4 12a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4h92a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H62L50 24h38a4 4 0 0 1 4 4v68a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V28a4 4 0 0 1 4-4h18l12-12H4Zm26 52a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h40a2 2 0 0 0 2-2V66a2 2 0 0 0-2-2H30Zm0-28a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h40a2 2 0 0 0 2-2V38a2 2 0 0 0-2-2H30Z" fill="currentColor"/></svg>`;

/**
 * 動画視聴ページかどうかを判定
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * 動画情報エリア内のタグコンテナを取得
 * 関連動画やサイドバーのタグを除外するため、特定のエリア内のみを対象とする
 */
function getTagContainer(): HTMLElement | null {
  // 動画情報エリア（grid-area_[bottom]）内のタグコンテナを探す
  const bottomArea = document.querySelector('.grid-area_\\[bottom\\]');
  if (!bottomArea) {
    return null;
  }

  // タグコンテナは flex-wrap を持つ div
  // 構造: div.d_flex.flex-wrap_wrap.gap_base > a[href*="/tag/"]
  const tagContainer = bottomArea.querySelector(
    'div[class*="flex-wrap_wrap"]',
  ) as HTMLElement | null;

  return tagContainer;
}

/**
 * 大百科リンク要素を作成（元のニコニコ動画のスタイルを再現）
 */
function createNicopediaLink(encodedTagName: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `https://dic.nicovideo.jp/a/${encodedTagName}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'bn-nicopedia-link';
  link.setAttribute('title', 'ニコニコ大百科で「' + decodeURIComponent(encodedTagName) + '」を見る');
  link.setAttribute(LINK_MARKER, 'true');

  // アイコン用のspan要素（元のNicoDicIconクラスの構造を再現）
  const iconSpan = document.createElement('span');
  iconSpan.className = 'bn-nicopedia-icon';
  iconSpan.innerHTML = NICODIC_ICON_SVG;

  link.appendChild(iconSpan);
  return link;
}

/**
 * タグに大百科リンクを追加
 */
function addNicopediaLinks(): void {
  const tagContainer = getTagContainer();
  if (!tagContainer) {
    return;
  }

  // タグコンテナ内のタグリンクのみを取得
  const tags = tagContainer.querySelectorAll<HTMLAnchorElement>('a[href*="/tag/"]');

  tags.forEach((tag) => {
    // 既に処理済みの場合はスキップ
    if (tag.hasAttribute(MARKER)) {
      return;
    }

    // タグ名の取得（hrefから抽出）
    const match = tag.getAttribute('href')?.match(/\/tag\/([^?]+)/);
    if (!match) {
      return;
    }

    const encodedTagName = match[1];

    // 大百科リンクを作成して挿入
    const link = createNicopediaLink(encodedTagName);
    tag.insertAdjacentElement('afterend', link);

    // 処理済みマーカーを付与
    tag.setAttribute(MARKER, 'true');
  });
}

/**
 * 追加した大百科リンクを削除
 */
function removeNicopediaLinks(): void {
  // 追加したリンクを全て削除
  const links = document.querySelectorAll(`[${LINK_MARKER}]`);
  links.forEach((link) => link.remove());

  // マーカーを削除（次回有効化時に再処理できるように）
  const tags = document.querySelectorAll<HTMLAnchorElement>(`[${MARKER}]`);
  tags.forEach((tag) => tag.removeAttribute(MARKER));
}

/**
 * 設定を適用する
 * @param enabled - true: 大百科リンクを表示, false: 大百科リンクを非表示
 */
export function apply(enabled: boolean): void {
  if (!isWatchPage()) {
    return;
  }

  if (enabled) {
    addNicopediaLinks();
  } else {
    removeNicopediaLinks();
  }
}
