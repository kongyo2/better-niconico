/**
 * ニコニコ大百科の記事存在確認（Background Service Worker 側）
 *
 * Content Script は CORS の制約で dic.nicovideo.jp を直接 fetch できないため、
 * host_permissions を持つ Background 経由で確認する。
 *
 * == 設計方針（堅牢性・軽量性。2026-06 に実機調査で確認）==
 * - HEAD リクエスト + HTTP ステータスコードで判定する。
 *   実機調査で、存在しない記事は 404、存在する記事は 200（VOCALOID 等の一部は
 *   リダイレクト経由で 200）を返すことを確認済み。
 *   旧実装は GET で HTML 全文（記事により数百KB。例: 初音ミクは約 286KB）を取得し
 *   「まだ記事が書かれていません」を文字列マッチしていたが、通信量が大きく、文言変更に脆い。
 *   HEAD + ステータスコードは本文を取得しないため軽量かつ確実。
 * - 2xx → 存在(exists) / 404・410 → 非存在(missing)。
 *   それ以外（403/429/5xx/ネットワークエラー）→ 不明(error)。
 *   「非存在」と断定せず、呼び出し側がリンクを誤って隠さないようにする（＝障害時の誤キャッシュを防ぐ）。
 * - HEAD を許可しないサーバ応答（405/501）に備え、GET + ステータス（+ 旧文字列判定）へフォールバック。
 * - 同一記事への同時問い合わせを結合（in-flight dedup）し、確定結果のみ TTL 付きでメモリキャッシュ。
 *   正: 7日 / 負: 1日（記事は後から作成されうるため負キャッシュは短め）。
 *   Service Worker が停止するとキャッシュは失われるが、HEAD が軽量なため許容する。
 */

export type ArticleExistence = 'exists' | 'missing' | 'error';

const ARTICLE_BASE_URL = 'https://dic.nicovideo.jp/a/';
const NO_ARTICLE_TEXT = 'まだ記事が書かれていません';

const POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  result: 'exists' | 'missing';
  expiresAt: number;
}

// 確定結果のメモリキャッシュ（Service Worker のライフタイム中のみ有効）
const cache = new Map<string, CacheEntry>();
// 同一記事への問い合わせ結合用（実行中の Promise を共有）
const inflight = new Map<string, Promise<ArticleExistence>>();

/**
 * HTTP ステータスコードを存在状態へ分類する。
 * 2xx は存在、404/410 は非存在、それ以外は不明（"非存在" とは断定しない）。
 */
export function classifyStatus(status: number): ArticleExistence {
  if (status >= 200 && status < 300) {
    return 'exists';
  }
  if (status === 404 || status === 410) {
    return 'missing';
  }
  return 'error';
}

/**
 * GET フォールバック（HEAD 非対応サーバ応答時など）。
 * ステータスコードで判定し、2xx の場合のみ旧来の文字列判定を最後の砦として併用する。
 */
async function checkViaGet(encodedTagName: string): Promise<ArticleExistence> {
  try {
    const res = await fetch(`${ARTICLE_BASE_URL}${encodedTagName}`, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
    });
    if (res.status === 404 || res.status === 410) {
      return 'missing';
    }
    if (res.status < 200 || res.status >= 300) {
      return 'error';
    }
    const html = await res.text();
    return html.includes(NO_ARTICLE_TEXT) ? 'missing' : 'exists';
  } catch {
    return 'error';
  }
}

/**
 * HEAD リクエストで記事の存在を確認する（キャッシュ・dedup なしの実処理）。
 * HEAD 非対応（405/501）の場合のみ GET へフォールバックする。
 */
export async function fetchArticleExistence(encodedTagName: string): Promise<ArticleExistence> {
  let res: Response;
  try {
    res = await fetch(`${ARTICLE_BASE_URL}${encodedTagName}`, {
      method: 'HEAD',
      credentials: 'omit',
      redirect: 'follow',
    });
  } catch {
    // ネットワークエラー → 不明（"非存在" としてキャッシュさせない）
    return 'error';
  }

  if (res.status === 405 || res.status === 501) {
    return checkViaGet(encodedTagName);
  }
  return classifyStatus(res.status);
}

/**
 * キャッシュ + in-flight 結合付きの存在確認。
 * 確定結果（exists/missing）のみ TTL 付きでキャッシュし、error はキャッシュしない。
 */
export async function resolveArticleExistence(encodedTagName: string): Promise<ArticleExistence> {
  const cached = cache.get(encodedTagName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const pending = inflight.get(encodedTagName);
  if (pending) {
    return pending;
  }

  const promise = fetchArticleExistence(encodedTagName)
    .then((result) => {
      if (result === 'exists' || result === 'missing') {
        const ttl = result === 'exists' ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
        cache.set(encodedTagName, { result, expiresAt: Date.now() + ttl });
      }
      return result;
    })
    .finally(() => {
      inflight.delete(encodedTagName);
    });

  inflight.set(encodedTagName, promise);
  return promise;
}

/** テスト用: 内部キャッシュ・in-flight 状態をクリアする */
export function __resetNicopediaCheckState(): void {
  cache.clear();
  inflight.clear();
}
