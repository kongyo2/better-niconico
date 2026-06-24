/**
 * TV放送中のアニメセクションを非表示にする機能
 * video_top の "TV放送中のアニメ" セクションを、区切り線（.Separator）ごと非表示にします。
 *
 * 非表示は body へのクラス付与 + index.css の CSS ルールで行います
 * （hideSupporterButton / hideShortsButton と同方式）。
 *
 * 旧実装は「JSで対象 .BaseLayout-block に inline の style="display:none" と
 * マーカー属性を直接付与」していたが、以下の理由から CSS 方式へ移行して堅牢化した:
 *   - ニコニコ側はこのセクションをクライアントサイドで描画する（初期HTMLはスケルトン +
 *     Handlebars風テンプレート）。フレームワークが再レンダリング／DOM再構築すると、
 *     外部から付与した inline style やマーカー属性は剥がされ、セクションが再表示されうる。
 *   - SPA的なナビゲーションやノード差し替えのたびに、再表示→再非表示のちらつき（FOUC）が出る。
 *   - 旧方式は MutationObserver 経由の再適用に依存して非表示を維持していた。
 * body クラス + CSS なら、差し替えられた新ノードにも即座に適用され、ちらつかず、
 * MutationObserver に依存せず、冪等。
 *
 * 対象ブロックの特定は index.css 側の :has() セレクタが担う。class（OnTvAnimeVideosContainer）と
 * 「もっと見る」リンクの href（ch.nicovideo.jp/portal/anime）の2系統で多重特定しており、
 * 片方のDOM仕様変更には耐える（実機 video_top で、いずれのセレクタも対象1ブロックのみに
 * 一致することを確認済み）。
 */

const HIDE_ONAIR_ANIME_CLASS = 'bn-hide-onair-anime';

/**
 * TV放送中のアニメセクションを非表示にする
 */
function enableHideOnAirAnime(): void {
  if (document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)) {
    return; // 既に適用済み
  }

  document.body.classList.add(HIDE_ONAIR_ANIME_CLASS);
  console.log('[Better Niconico] TV放送中のアニメセクションを非表示にしました');
}

/**
 * TV放送中のアニメセクションを表示する
 */
function disableHideOnAirAnime(): void {
  if (!document.body.classList.contains(HIDE_ONAIR_ANIME_CLASS)) {
    return; // 既に解除済み
  }

  document.body.classList.remove(HIDE_ONAIR_ANIME_CLASS);
  console.log('[Better Niconico] TV放送中のアニメセクションを表示しました');
}

/**
 * 設定を適用する
 * @param enabled - true: 非表示, false: 表示
 */
export function apply(enabled: boolean): void {
  if (enabled) {
    enableHideOnAirAnime();
  } else {
    disableHideOnAirAnime();
  }
}
