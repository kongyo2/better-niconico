/**
 * サイドメニューの「ランキング」リンクの近くに、外部ランキングサイトへの
 * ボタンを追加する汎用機能のファクトリ。
 *
 * ニコニコ動画はページによってサイドメニューの実装が異なります:
 * - 旧実装(video_top等): Emotion生成クラス(css-XXXX)、a > div > div > svg/p 構造
 * - 新実装(watch/tag等): PandaCSSユーティリティクラス、ul > li > a > svg + span 構造
 *
 * さらに「開閉(展開/折りたたみ)」の挙動も実装ごとに大きく異なります(実機調査結果):
 * - 旧実装(video_top): サイドメニューは常設。ハンバーガーで展開/折りたたみすると
 *   "同じDOMノードのまま" Emotionクラスだけが差し替わる。
 *   折りたたみ時は内側divが css-54sd46 (flex-direction:column / アイコン上+文字下)、
 *   展開時は css-1xvl3dk (flex-direction:row / アイコン左+文字右) になる。
 *   → クローンしたボタンはこのクラスを引き継ぐため、状態が変わるたびに
 *     作り直さないと「展開したのに文字が縦のまま」というレイアウト崩れになる。
 * - 新実装(watch/tag): サイドメニューはオーバーレイのドロワー。閉じると
 *   .simplebar-content ごとDOMから削除され、開くと "別ノード" として作り直される。
 *   → 一度張ったオブザーバーは古いノードに残り続けるため、新ノードへ
 *     張り直さないと追従できない。
 *
 * これらに堅牢に追従するため、ビルド毎に変わるハッシュクラスには一切依存せず
 * 以下の方針で実装します:
 * - ランキングリンクは href("/ranking") とテキスト("ランキング") で特定する
 *   (完全一致「ランキング」を優先し、「もっと見る」等の別リンク誤検出を避ける)
 * - 複数の .simplebar-content があっても、ランキングリンクを含むものを選ぶ
 * - ボタンはその場のランキングリンクを cloneNode で複製して生成する
 *   (クラス・内部構造・現在の表示状態をそのまま引き継げる)
 * - サイドメニューの状態(=ランキング項目のクラス構成)が変わったら作り直し、
 *   常に最新の見た目(展開/折りたたみのレイアウト)に追従させる
 * - 監視対象ノードが作り直された場合はオブザーバーを張り直す
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

/** ニコニコの計測用属性(複製先には引き継がない) */
const TRACKING_ATTRS = ['data-anchor', 'data-anchor-page', 'data-anchor-area', 'data-anchor-href'];

/**
 * サイドメニュー(ナビ)のコンテナ候補をすべて取得する。
 * ニコニコは .simplebar-content を様々な場所で使うため、最初の1つに決め打ちせず
 * 「ランキングリンクを含むもの」を後段で選別する。
 */
function getSidebarContainers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.simplebar-content'));
}

/**
 * 指定スコープ内からナビのランキングリンクを選ぶ(クラス非依存)。
 * href に "/ranking" を含み、テキストに「ランキング」を含むものを候補とし、
 * テキストが完全に「ランキング」のものを優先する(「ランキング もっと見る」等を除外)。
 */
function pickRankingLink(scope: HTMLElement): HTMLAnchorElement | null {
  const candidates = Array.from(scope.querySelectorAll<HTMLAnchorElement>('a')).filter((link) => {
    const href = link.getAttribute('href') || '';
    return href.includes('/ranking') && Boolean(link.textContent?.includes('ランキング'));
  });
  if (candidates.length === 0) {
    return null;
  }
  return candidates.find((link) => (link.textContent || '').trim() === 'ランキング') || candidates[0];
}

/**
 * ページ全体のサイドメニューから、ランキングリンクとそれを含むコンテナを探す。
 * 複数の .simplebar-content がある場合でもナビ(ランキングを持つもの)を選ぶ。
 */
function findRanking(): { link: HTMLAnchorElement; container: HTMLElement } | null {
  for (const container of getSidebarContainers()) {
    const link = pickRankingLink(container);
    if (link) {
      return { link, container };
    }
  }
  return null;
}

/**
 * リンクのメニュー項目単位を取得する。
 * 新実装(PandaCSS)では <li> が項目の単位、旧実装(Emotion)では <a> 自身が項目。
 * これを単位に複製・挿入・削除することで、両実装で構造を崩さずに扱える。
 */
function getMenuItem(link: HTMLElement): HTMLElement {
  return link.closest('li') ?? link;
}

/**
 * メニュー項目の「見た目を決めるクラス構成」の指紋を作る。
 * 展開/折りたたみで内側divのクラス(css-54sd46 ↔ css-1xvl3dk 等)が変わるため、
 * 項目とその子孫の class を連結したものを指紋とし、変化を検知して作り直す。
 * (自前ボタンはランキング項目の "兄弟" であって子孫ではないので、指紋には含まれない)
 */
function computeSignature(item: HTMLElement): string {
  let signature = item.getAttribute('class') || '';
  for (const el of item.querySelectorAll('*')) {
    signature += '|' + (el.getAttribute('class') || '');
  }
  return signature;
}

/**
 * 設定に基づいてサイドバーボタン機能を生成する
 */
export function createSidebarRankButton(config: SidebarRankButtonConfig): SidebarRankButtonFeature {
  const { marker, url, label, iconViewBox, iconInner, insertAfterMarker } = config;

  let enabled = false;
  /** 直近に作り直した時のランキング項目の指紋。null は未生成。 */
  let lastSignature: string | null = null;
  /** サイドメニューの状態変化を監視するオブザーバー */
  let sidebarObserver: MutationObserver | null = null;
  /** 現在オブザーバーを張っているコンテナ(作り直し検知用) */
  let observedContainer: HTMLElement | null = null;

  /**
   * ランキングリンク(の項目単位)を複製してボタンを生成する。
   * 複製元の現在のクラス・内部構造(=展開/折りたたみのレイアウト)をそのまま引き継ぐ。
   */
  function createButtonItem(rankingItem: HTMLElement): HTMLElement {
    const clone = rankingItem.cloneNode(true) as HTMLElement;
    const link = (clone.tagName === 'A' ? clone : clone.querySelector('a')) as HTMLAnchorElement;

    link.href = url;
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute(marker, 'true');

    // ニコニコの計測用属性は引き継がない(誤計測の防止)
    for (const attr of TRACKING_ATTRS) {
      link.removeAttribute(attr);
    }

    // id の重複を避ける(複製元が id を持つ場合の保険)
    clone.removeAttribute('id');
    for (const el of clone.querySelectorAll('[id]')) {
      el.removeAttribute('id');
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
   * 既存のボタンをすべて削除する(メニュー項目単位で取り除く)
   */
  function removeButton(): boolean {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>(`[${marker}]`));
    for (const button of buttons) {
      getMenuItem(button).remove();
    }
    return buttons.length > 0;
  }

  /**
   * 現在のサイドメニューの状態にボタンを一致させる(中核ロジック)。
   * - 無効/ランキング無し → ボタンを消す
   * - 既に正しい場所にあり、見た目(指紋)も最新 → 何もしない
   * - それ以外 → 作り直して最新のレイアウト・正しい並び順に揃える
   */
  function reconcile(): void {
    if (!enabled) {
      removeButton();
      lastSignature = null;
      return;
    }

    const found = findRanking();
    if (!found) {
      // サイドメニューが無い(ドロワーが閉じている等)。残骸があれば掃除する。
      removeButton();
      lastSignature = null;
      return;
    }

    const rankingItem = getMenuItem(found.link);
    const signature = computeSignature(rankingItem);

    const existing = document.querySelector<HTMLElement>(`[${marker}]`);
    const placedCorrectly = existing !== null && found.container.contains(existing);
    if (placedCorrectly && signature === lastSignature) {
      return; // 既に最新。作り直し不要(ホバー等の無関係な変化では作り直さない)
    }

    // 作り直し: 古いボタン(別コンテナの残骸含む)を消してから挿入し直す
    const hadButton = removeButton();
    const buttonItem = createButtonItem(rankingItem);

    // 挿入の基準: 先行ボタン(例: ニコラン)があればその直後、なければランキング直後
    let anchorItem = rankingItem;
    if (insertAfterMarker) {
      const precedingButton = found.container.querySelector<HTMLElement>(`[${insertAfterMarker}]`);
      if (precedingButton) {
        anchorItem = getMenuItem(precedingButton);
      }
    }
    anchorItem.insertAdjacentElement('afterend', buttonItem);
    lastSignature = signature;

    if (!hadButton) {
      console.log(`[Better Niconico] ${label}ボタンを追加しました`);
    }
  }

  /**
   * サイドメニューの状態変更を監視するオブザーバーを、現在のコンテナに張る。
   * コンテナが作り直された(ドロワー再生成等)場合は張り直す。
   *
   * ハンバーガー等で展開/折りたたみが切り替わると、ニコニコ動画のJSが
   * ランキングリンクのクラスや構造を作り替える。その変化を検知してボタンを
   * 作り直すことで、複製元の最新の見た目(展開/折りたたみのレイアウト)に追従させる。
   */
  function ensureObserver(): void {
    const container = findRanking()?.container ?? null;
    if (!container) {
      return;
    }
    if (sidebarObserver && observedContainer === container) {
      return; // 既に正しいノードを監視中
    }

    // 別ノードを監視していた(作り直された)→ 張り直す
    if (sidebarObserver) {
      sidebarObserver.disconnect();
    }
    observedContainer = container;
    sidebarObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // 自分のボタン由来のクラス変更は無視(無限ループ防止)
        const target = mutation.target as HTMLElement;
        if (target.closest?.(`[${marker}]`)) {
          continue;
        }
        // ランキングリンク等の状態が変化 → 指紋を見て必要なら作り直す
        reconcile();
        break;
      }
    });
    sidebarObserver.observe(container, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
  }

  function stopObserver(): void {
    if (sidebarObserver) {
      sidebarObserver.disconnect();
      sidebarObserver = null;
      observedContainer = null;
    }
  }

  return {
    /**
     * 設定を適用する
     * @param enabled - true: ボタンを追加, false: ボタンを削除
     */
    apply(nextEnabled: boolean): void {
      enabled = nextEnabled;
      if (enabled) {
        reconcile();
        ensureObserver();
      } else {
        stopObserver();
        const removed = removeButton();
        lastSignature = null;
        if (removed) {
          console.log(`[Better Niconico] ${label}ボタンを削除しました`);
        }
      }
    },
  };
}
