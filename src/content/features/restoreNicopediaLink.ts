/**
 * 動画タグの横に大百科リンクを復元する
 *
 * ニコニコ動画の動画視聴ページで、タグの横に表示されていた大百科リンクを復元します。
 * 2023年以前のニコニコ動画で使用されていたスタイル（暗い赤の円形アイコン）を再現。
 * 動画情報エリアのタグ（自分の動画に付いたタグ）のみを対象とし、
 * 関連動画やサイドバーのタグには影響しません。
 *
 * 記事が存在しないタグにはリンクを表示しません（Background 経由の HEAD で存在確認）。
 *
 * == 設計方針（堅牢性。2026-06 に実機調査で確認）==
 * - タグの特定は、Panda CSS の生成クラス（`flex-wrap_wrap` 等。デプロイで変わりうる）ではなく、
 *   ニコニコの計測用属性 `a[data-anchor-area="tags"]` を主シグナルにする。
 *   これは「その動画に付いたタグ」だけを指すため、関連動画やサイドバーを自然に除外でき、
 *   かつクラス名の変更に強い。属性が失われた将来に備え、コンテナ走査のフォールアウトも用意する。
 * - クラシックレイアウト復元機能（restoreClassicVideoLayout）はタグを
 *   `.grid-area_[bottom]` の外（`#bn-top-sections`）へ移動させる。属性ベースの探索なら
 *   移動後も追従できる（コンテナ位置に依存しない）。フォールバックも両コンテナを探索する。
 * - 「処理済み」を要素のマーカー属性で覚えると、React が再描画でリンクを消したとき
 *   再注入できず永久に消える。そこで冪等性は「タグ内に実リンクが在るか」で判定し、
 *   存在確認の結果はタグ名で session キャッシュして再 fetch を避ける。
 * - 通信エラーは「非存在」と区別し（null 扱い）、確定結果のみキャッシュする。
 *   さらに連続する DOM 変化（コメント流れ等）でのエラー再送を抑えるためクールダウンを設ける。
 */

/** 注入したリンクであることを示す属性（冪等判定・除去対象の特定に使用） */
const LINK_MARKER = 'data-bn-nicopedia-link';

/** クラシックレイアウト復元機能がタイトル・タグを退避する上部コンテナの id */
const TOP_CONTAINER_ID = 'bn-top-sections';

/** タグ名 → 記事の存在（確定結果のみ）。SPA 遷移をまたいで再利用される */
const articleExistsCache = new Map<string, boolean>();
/** 同一タグ名への問い合わせ結合（実行中の Promise を共有し、重複メッセージを防ぐ） */
const pendingChecks = new Map<string, Promise<boolean | null>>();
/** 通信エラー時の再問い合わせ抑制（タグ名 → この時刻まで再問い合わせしない） */
const errorCooldownUntil = new Map<string, number>();
/** エラー後に再問い合わせを控える時間（連続 DOM 変化での過剰リクエスト防止） */
const ERROR_COOLDOWN_MS = 60_000;

/**
 * ニコニコ大百科のSVGアイコン（元のデザインを再現）
 * 本を模したシンボルで、大百科の記事があることを示す
 */
const NICODIC_ICON_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="1.4"><path d="M4 12a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4h92a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H62L50 24h38a4 4 0 0 1 4 4v68a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V28a4 4 0 0 1 4-4h18l12-12H4Zm26 52a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h40a2 2 0 0 0 2-2V66a2 2 0 0 0-2-2H30Zm0-28a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h40a2 2 0 0 0 2-2V38a2 2 0 0 0-2-2H30Z" fill="currentColor"/></svg>`;

/** Background からのレスポンス形 */
interface NicopediaCheckResponse {
  exists?: boolean;
  error?: boolean;
}

/**
 * タグ（アンカー）側のクリックハンドラ（React の SPA 遷移等）への伝播を止める。
 * 大百科アイコンのクリック/中クリックでタグページへ遷移しないようにする。
 */
function stopPropagation(event: Event): void {
  event.stopPropagation();
}

/**
 * ニコニコ大百科の記事が存在するかを Background 経由で確認する。
 * @returns 記事が存在すれば true、存在しなければ false、通信エラー等の不明時は null
 */
async function requestArticleExists(encodedTagName: string): Promise<boolean | null> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'CHECK_NICOPEDIA_ARTICLE',
      tagName: encodedTagName,
    })) as NicopediaCheckResponse | undefined;

    // レスポンス不正・エラーは「不明(null)」として扱い、リンクを誤って隠さない
    if (!response || response.error) {
      return null;
    }
    return response.exists === true;
  } catch {
    // sendMessage 自体の失敗（Background 未起動等）も不明扱い
    return null;
  }
}

/**
 * 記事の存在を解決する（session キャッシュ + 問い合わせ結合 + エラークールダウン）。
 * @returns true: 存在 / false: 非存在 / null: 不明（後で再試行可能）
 */
async function resolveArticleExists(encodedTagName: string): Promise<boolean | null> {
  // 確定済みならキャッシュを返す
  const cached = articleExistsCache.get(encodedTagName);
  if (cached !== undefined) {
    return cached;
  }

  // 直近にエラーが起きたタグはクールダウン中は問い合わせない
  const cooldownUntil = errorCooldownUntil.get(encodedTagName);
  if (cooldownUntil !== undefined && Date.now() < cooldownUntil) {
    return null;
  }

  // 実行中の問い合わせがあれば結合する
  const pending = pendingChecks.get(encodedTagName);
  if (pending) {
    return pending;
  }

  const promise = requestArticleExists(encodedTagName)
    .then((result) => {
      if (result === null) {
        // 不明: 一定時間は再問い合わせを控える（確定結果はキャッシュしない）
        errorCooldownUntil.set(encodedTagName, Date.now() + ERROR_COOLDOWN_MS);
      } else {
        articleExistsCache.set(encodedTagName, result);
        errorCooldownUntil.delete(encodedTagName);
      }
      return result;
    })
    .finally(() => {
      pendingChecks.delete(encodedTagName);
    });

  pendingChecks.set(encodedTagName, promise);
  return promise;
}

/**
 * 動画視聴ページかどうかを判定
 */
function isWatchPage(): boolean {
  return window.location.pathname.startsWith('/watch/');
}

/**
 * 動画情報エリアのタグリンク（その動画に付いたタグ）を取得する。
 *
 * 主シグナルは計測用属性 `data-anchor-area="tags"`。これはその動画のタグだけを指すため、
 * 関連動画・サイドバーを除外でき、クラス名変更やレイアウト移動にも強い。
 * 属性が見つからない将来に備え、コンテナ走査によるフォールバックを併用する。
 */
function getTagAnchors(): HTMLAnchorElement[] {
  // 1) 最も安定: 計測属性で動画タグを直接特定
  const byAnchor = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[data-anchor-area="tags"][href*="/tag/"]'),
  );
  if (byAnchor.length > 0) {
    return byAnchor;
  }

  // 2) フォールバック: タグが置かれうるコンテナ内の、タグリンクを直接子に持つ flex コンテナを走査。
  //    クラシックレイアウト時は #bn-top-sections、通常時は .grid-area_[bottom] にタグがある。
  const roots: Element[] = [];
  const topContainer = document.getElementById(TOP_CONTAINER_ID);
  if (topContainer) {
    roots.push(topContainer);
  }
  // grid-area_[bottom] は属性セレクタで取得（CSS エスケープ不要で安全）
  const bottomArea = document.querySelector('[class*="grid-area_[bottom]"]');
  if (bottomArea) {
    roots.push(bottomArea);
  }

  const anchors: HTMLAnchorElement[] = [];
  const seen = new Set<HTMLAnchorElement>();
  for (const root of roots) {
    const containers = Array.from(root.querySelectorAll<HTMLElement>('div[class*="flex-wrap"]'));
    for (const container of containers) {
      // タグリンクを「直接の子」に持つコンテナのみ採用（説明文中の /tag/ 等を誤検出しない）
      const directTagLinks = container.querySelectorAll<HTMLAnchorElement>(
        ':scope > a[href*="/tag/"]',
      );
      for (const a of directTagLinks) {
        if (!seen.has(a)) {
          seen.add(a);
          anchors.push(a);
        }
      }
    }
  }
  return anchors;
}

/**
 * タグリンクの href からエンコード済みタグ名を取り出す。
 * 相対・絶対 URL のどちらにも対応し、クエリ・ハッシュを除去する。
 */
function extractEncodedTagName(tag: HTMLAnchorElement): string | null {
  const href = tag.getAttribute('href') || tag.getAttribute('data-anchor-href') || '';
  if (!href) {
    return null;
  }

  // 絶対 URL 化して pathname を得る（base 固定で location スタブに依存しない）
  let pathname = href;
  try {
    pathname = new URL(href, 'https://www.nicovideo.jp').pathname;
  } catch {
    // URL 解析に失敗した場合は素の href から抽出を試みる
  }

  const match = pathname.match(/\/tag\/([^/?#]+)/);
  if (!match || !match[1]) {
    return null;
  }
  return match[1];
}

/**
 * 大百科リンク要素を作成（元のニコニコ動画のスタイルを再現）。
 * タグ（アンカー）内部に配置するため、クリックがタグ側の遷移を誘発しないよう伝播を遮断する。
 */
function createNicopediaLink(encodedTagName: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `https://dic.nicovideo.jp/a/${encodedTagName}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'bn-nicopedia-link';
  link.setAttribute(LINK_MARKER, 'true');

  // 不正な % エンコードでも decodeURIComponent が throw しないようガードする
  let decodedName = encodedTagName;
  try {
    decodedName = decodeURIComponent(encodedTagName);
  } catch {
    // デコード不能ならエンコード済みのまま表示に用いる
  }
  const label = `ニコニコ大百科で「${decodedName}」を見る`;
  link.setAttribute('title', label);
  link.setAttribute('aria-label', label);

  // アイコン用のspan要素（元のNicoDicIconクラスの構造を再現）
  const iconSpan = document.createElement('span');
  iconSpan.className = 'bn-nicopedia-icon';
  iconSpan.setAttribute('aria-hidden', 'true');
  iconSpan.innerHTML = NICODIC_ICON_SVG;
  link.appendChild(iconSpan);

  // タグ側のクリックハンドラ（React の SPA 遷移等）への伝播を止め、
  // 大百科アイコンのクリック/中クリックでタグページへ遷移しないようにする。
  link.addEventListener('click', stopPropagation);
  link.addEventListener('auxclick', stopPropagation);
  link.addEventListener('mousedown', stopPropagation);

  return link;
}

/** タグが既に大百科リンクを持っているか（直接の子に限定して判定） */
function hasNicopediaLink(tag: HTMLAnchorElement): boolean {
  return tag.querySelector(`:scope > a[${LINK_MARKER}]`) !== null;
}

/**
 * 1つのタグに対して、記事が存在すれば大百科リンクを注入する。
 * 冪等: 既にリンクがあれば何もせず、無ければ（React が消した場合も）再注入する。
 */
async function processTag(tag: HTMLAnchorElement): Promise<void> {
  if (hasNicopediaLink(tag)) {
    return;
  }

  const encodedTagName = extractEncodedTagName(tag);
  if (!encodedTagName) {
    return;
  }

  const exists = await resolveArticleExists(encodedTagName);
  // 非存在(false)・不明(null) のときはリンクを出さない
  if (exists !== true) {
    return;
  }

  // await 中に状況が変わっている可能性に備えた最終チェック
  if (!tag.isConnected || hasNicopediaLink(tag)) {
    return;
  }
  tag.appendChild(createNicopediaLink(encodedTagName));
}

/**
 * タグに大百科リンクを追加（記事が存在するタグのみ）。
 */
async function addNicopediaLinks(): Promise<void> {
  // まだリンクが無いタグのみを対象にして無駄な非同期処理を減らす
  const tags = getTagAnchors().filter((tag) => !hasNicopediaLink(tag));
  if (tags.length === 0) {
    return;
  }
  // 1つのタグの失敗が他へ波及しないよう個別に握りつぶす
  await Promise.all(tags.map((tag) => processTag(tag).catch(() => undefined)));
}

/**
 * 追加した大百科リンクを削除（どのページでも確実に除去できるよう document 全体を対象にする）
 */
function removeNicopediaLinks(): void {
  const links = document.querySelectorAll(`a[${LINK_MARKER}]`);
  links.forEach((link) => link.remove());
}

/**
 * 設定を適用する
 * @param enabled - true: 大百科リンクを表示, false: 大百科リンクを非表示
 */
export function apply(enabled: boolean): void {
  if (!enabled) {
    // 無効化時はページ種別を問わず、注入済みリンクを確実に除去する
    removeNicopediaLinks();
    return;
  }

  if (!isWatchPage()) {
    return;
  }
  void addNicopediaLinks();
}

/** テスト用: session キャッシュ・問い合わせ結合・クールダウンの状態をクリアする */
export function __resetNicopediaLinkState(): void {
  articleExistsCache.clear();
  pendingChecks.clear();
  errorCooldownUntil.clear();
}
