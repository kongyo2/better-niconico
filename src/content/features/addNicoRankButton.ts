/**
 * サイドバーにnico-rank.comへのボタンを追加する機能
 * サイドメニューの「ランキング」リンクの直後に「ニコラン」ボタンを追加します。
 *
 * ニコニコ動画はページによってサイドメニューの実装が異なります:
 * - 旧実装(video_top等): Emotion生成クラス(css-XXXX)、a > div > div > svg/p 構造
 * - 新実装(tag等): PandaCSSユーティリティクラス、ul > li > a > svg + span 構造
 *
 * どちらの実装にも、また折りたたみ/展開のどちらの状態にも追従するため、
 * ビルド毎に変わるハッシュクラスには一切依存せず以下の方針で実装します:
 * - ランキングリンクは href("/ranking") とテキスト("ランキング") で特定する
 * - ニコランボタンはその場のランキングリンクを cloneNode で複製して生成する
 *   (クラス・内部構造・現在の表示状態をそのまま引き継げる)
 */

const BUTTON_MARKER = 'data-bn-nico-rank-button';
const NICO_RANK_URL = 'https://nico-rank.com/';

/**
 * 表彰台アイコン(nico-rank.comのシンボル)のSVG中身。
 * 複製元アイコンの色指定を引き継げるよう fill は currentColor を使う。
 */
const PODIUM_ICON_INNER =
  '<rect x="1" y="11" width="4.5" height="7" fill="currentColor" rx="0.5"/>' +
  '<rect x="7.5" y="6" width="4.5" height="12" fill="currentColor" rx="0.5"/>' +
  '<rect x="14" y="14" width="4.5" height="4" fill="currentColor" rx="0.5"/>' +
  '<rect x="0.5" y="17.5" width="21" height="1" fill="currentColor" rx="0.5"/>';

/**
 * サイドバーのコンテナを取得
 */
function getSidebarContainer(): HTMLElement | null {
  return document.querySelector('.simplebar-content');
}

/**
 * サイドメニュー内のランキングリンクを探す(クラス非依存)
 */
function findRankingLink(sidebar: HTMLElement): HTMLAnchorElement | null {
  return (
    Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('a')).find((link) => {
      const href = link.getAttribute('href') || '';
      return href.includes('/ranking') && Boolean(link.textContent?.includes('ランキング'));
    }) || null
  );
}

/**
 * リンクのメニュー項目単位を取得する。
 * 新実装(PandaCSS)では <li> が項目の単位、旧実装(Emotion)では <a> 自身が項目。
 * これを単位に複製・挿入・削除することで、両実装で構造を崩さずに扱える。
 */
function getMenuItem(link: HTMLElement): HTMLElement {
  const parent = link.parentElement;
  return parent && parent.tagName === 'LI' ? parent : link;
}

/**
 * ランキングリンク(の項目単位)を複製してニコランボタンを生成する
 */
function createNicoRankItem(rankingItem: HTMLElement): HTMLElement {
  const clone = rankingItem.cloneNode(true) as HTMLElement;
  const link = (clone.tagName === 'A' ? clone : clone.querySelector('a')) as HTMLAnchorElement;

  link.href = NICO_RANK_URL;
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
  link.setAttribute(BUTTON_MARKER, 'true');

  // ニコニコの計測用属性は引き継がない(誤計測の防止)
  for (const attr of ['data-anchor', 'data-anchor-page', 'data-anchor-area', 'data-anchor-href']) {
    link.removeAttribute(attr);
  }

  // テキストを「ニコラン」に差し替え(差し替え前の「ランキング」を持つ要素を優先)
  const textElement =
    Array.from(link.querySelectorAll<HTMLElement>('span, p')).find((el) =>
      el.textContent?.includes('ランキング'),
    ) || link.querySelector<HTMLElement>('span, p');
  if (textElement) {
    textElement.textContent = 'ニコラン';
  }

  // アイコンを表彰台に差し替え(複製元svgのサイズ・色指定クラスは維持したまま中身だけ置換)
  const svg = link.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', '0 0 22 19');
    svg.innerHTML = PODIUM_ICON_INNER;
  }

  return clone;
}

/**
 * ニコランボタンを追加
 * ランキングリンクの直後(同じメニューグループ内)に挿入する
 */
function addNicoRankButton(): void {
  const sidebar = getSidebarContainer();
  if (!sidebar) {
    return;
  }

  // 既にボタンが存在する場合は何もしない
  if (sidebar.querySelector(`[${BUTTON_MARKER}]`)) {
    return;
  }

  const rankingLink = findRankingLink(sidebar);
  if (!rankingLink) {
    return;
  }

  const rankingItem = getMenuItem(rankingLink);
  const nicoRankItem = createNicoRankItem(rankingItem);
  rankingItem.insertAdjacentElement('afterend', nicoRankItem);

  console.log('[Better Niconico] ニコランボタンを追加しました');
}

/**
 * ボタンを削除する
 */
function removeNicoRankButton(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>(`[${BUTTON_MARKER}]`));
  buttons.forEach((button) => {
    getMenuItem(button).remove();
  });

  if (buttons.length > 0) {
    console.log('[Better Niconico] ニコランボタンを削除しました');
  }
}

/**
 * サイドバーの状態変更を監視するMutationObserver
 * ハンバーガーメニュー等で展開/折りたたみが切り替わると、ニコニコ動画のJSが
 * ランキングリンクのクラスや構造を作り替える。その変化を検知してニコランボタンを
 * 作り直すことで、複製元の最新の見た目に常に追従させる。
 */
let sidebarObserver: MutationObserver | null = null;

function startSidebarObserver(): void {
  if (sidebarObserver) {
    return;
  }

  const sidebar = getSidebarContainer();
  if (!sidebar) {
    return;
  }

  sidebarObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // ニコランボタン自身のクラス変更は無視(無限ループ防止)
      const target = mutation.target as HTMLElement;
      if (target.closest(`[${BUTTON_MARKER}]`)) {
        continue;
      }
      // ランキングリンク等の状態が変化 → 作り直して最新の見た目に揃える
      removeNicoRankButton();
      addNicoRankButton();
      break;
    }
  });

  sidebarObserver.observe(sidebar, {
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
