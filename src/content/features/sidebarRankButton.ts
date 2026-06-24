/**
 * サイドメニューの「ランキング」リンクの近くに、外部ランキングサイトへの
 * ボタンを追加する汎用機能のファクトリ。
 *
 * ニコニコ動画はページによってサイドメニューの実装が異なります:
 * - 旧実装(video_top等): Emotion生成クラス(css-XXXX)、a > div > div > svg/p 構造
 * - 新実装(tag等): PandaCSSユーティリティクラス、ul > li > a > svg + span 構造
 *
 * どちらの実装にも、また折りたたみ/展開のどちらの状態にも追従するため、
 * ビルド毎に変わるハッシュクラスには一切依存せず以下の方針で実装します:
 * - ランキングリンクは href("/ranking") とテキスト("ランキング") で特定する
 * - ボタンはその場のランキングリンクを cloneNode で複製して生成する
 *   (クラス・内部構造・現在の表示状態をそのまま引き継げる)
 *
 * このファクトリを nico-rank.com 用と nicoranweb.com 用で共有します。
 */

export interface SidebarRankButtonConfig {
  /** ボタンを識別するためのマーカー属性名 (data-bn-xxx) */
  marker: string;
  /** リンク先URL */
  url: string;
  /** 表示ラベル */
  label: string;
  /** アイコンSVGの viewBox */
  iconViewBox: string;
  /** アイコンSVGの中身(子要素のマークアップ) */
  iconInner: string;
  /**
   * 指定すると、このマーカーを持つボタンの直後に挿入します(なければランキング直後)。
   * 複数のランキングボタンを決まった順序で並べるために使います。
   */
  insertAfterMarker?: string;
}

export interface SidebarRankButtonFeature {
  apply(enabled: boolean): void;
}

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
 * 設定に基づいてサイドバーボタン機能を生成する
 */
export function createSidebarRankButton(config: SidebarRankButtonConfig): SidebarRankButtonFeature {
  const { marker, url, label, iconViewBox, iconInner, insertAfterMarker } = config;

  /**
   * ランキングリンク(の項目単位)を複製してボタンを生成する
   */
  function createButtonItem(rankingItem: HTMLElement): HTMLElement {
    const clone = rankingItem.cloneNode(true) as HTMLElement;
    const link = (clone.tagName === 'A' ? clone : clone.querySelector('a')) as HTMLAnchorElement;

    link.href = url;
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute(marker, 'true');

    // ニコニコの計測用属性は引き継がない(誤計測の防止)
    for (const attr of [
      'data-anchor',
      'data-anchor-page',
      'data-anchor-area',
      'data-anchor-href',
    ]) {
      link.removeAttribute(attr);
    }

    // テキストを差し替え(差し替え前の「ランキング」を持つ要素を優先)
    const textElement =
      Array.from(link.querySelectorAll<HTMLElement>('span, p')).find((el) =>
        el.textContent?.includes('ランキング'),
      ) || link.querySelector<HTMLElement>('span, p');
    if (textElement) {
      textElement.textContent = label;
    }

    // アイコンを差し替え(複製元svgのサイズ・色指定クラスは維持したまま中身だけ置換)
    const svg = link.querySelector('svg');
    if (svg) {
      svg.setAttribute('viewBox', iconViewBox);
      svg.innerHTML = iconInner;
    }

    return clone;
  }

  /**
   * ボタンを追加
   * insertAfterMarker のボタンがあればその直後、なければランキングリンクの直後に挿入する
   */
  function addButton(): void {
    const sidebar = getSidebarContainer();
    if (!sidebar) {
      return;
    }

    // 既にボタンが存在する場合は何もしない
    if (sidebar.querySelector(`[${marker}]`)) {
      return;
    }

    const rankingLink = findRankingLink(sidebar);
    if (!rankingLink) {
      return;
    }

    const rankingItem = getMenuItem(rankingLink);
    const buttonItem = createButtonItem(rankingItem);

    // 挿入の基準: 先行ボタン(例: ニコラン)があればその直後、なければランキング直後
    let anchorItem = rankingItem;
    if (insertAfterMarker) {
      const precedingButton = sidebar.querySelector<HTMLElement>(`[${insertAfterMarker}]`);
      if (precedingButton) {
        anchorItem = getMenuItem(precedingButton);
      }
    }
    anchorItem.insertAdjacentElement('afterend', buttonItem);

    console.log(`[Better Niconico] ${label}ボタンを追加しました`);
  }

  /**
   * ボタンを削除する
   */
  function removeButton(): void {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>(`[${marker}]`));
    buttons.forEach((button) => {
      getMenuItem(button).remove();
    });

    if (buttons.length > 0) {
      console.log(`[Better Niconico] ${label}ボタンを削除しました`);
    }
  }

  /**
   * サイドバーの状態変更を監視するMutationObserver
   * ハンバーガーメニュー等で展開/折りたたみが切り替わると、ニコニコ動画のJSが
   * ランキングリンクのクラスや構造を作り替える。その変化を検知してボタンを
   * 作り直すことで、複製元の最新の見た目に常に追従させる。
   */
  let sidebarObserver: MutationObserver | null = null;

  function startObserver(): void {
    if (sidebarObserver) {
      return;
    }

    const sidebar = getSidebarContainer();
    if (!sidebar) {
      return;
    }

    sidebarObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // 自分のボタン由来のクラス変更は無視(無限ループ防止)
        const target = mutation.target as HTMLElement;
        if (target.closest(`[${marker}]`)) {
          continue;
        }
        // ランキングリンク等の状態が変化 → 作り直して最新の見た目に揃える
        removeButton();
        addButton();
        break;
      }
    });

    sidebarObserver.observe(sidebar, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
  }

  function stopObserver(): void {
    if (sidebarObserver) {
      sidebarObserver.disconnect();
      sidebarObserver = null;
    }
  }

  return {
    /**
     * 設定を適用する
     * @param enabled - true: ボタンを追加, false: ボタンを削除
     */
    apply(enabled: boolean): void {
      if (enabled) {
        addButton();
        startObserver();
      } else {
        stopObserver();
        removeButton();
      }
    },
  };
}
