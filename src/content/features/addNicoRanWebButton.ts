/**
 * サイドバーにnicoranweb.comへのボタンを追加する機能
 * サイドメニューの「ニコラン」ボタン(なければ「ランキング」リンク)の直後に
 * 「ニコランWEB」ボタンを追加します。
 *
 * ニコランWEB(https://nicoranweb.com/)は週刊ニコニコランキングや過去ランキング、
 * 動画のランクイン履歴、タグ・キーワード検索などを提供する非公式データサイト。
 *
 * 両サイドメニュー実装(Emotion / PandaCSS)・折りたたみ/展開への追従といった
 * 共通ロジックは sidebarRankButton.ts のファクトリに集約しています。
 */
import { createSidebarRankButton } from './sidebarRankButton';

/**
 * 虫眼鏡(検索)アイコンのSVG中身。ニコランWEBの主機能である
 * 「過去データ検索」を象徴し、表彰台アイコンのニコランと視覚的に区別する。
 * 複製元svg(viewBox 0 0 22 19)の座標系に合わせ、色はリンク文字色を継承できるよう
 * currentColor を使う。
 */
const SEARCH_ICON_INNER =
  '<circle cx="9" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
  '<line x1="13.2" y1="12.2" x2="20.5" y2="18.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';

const feature = createSidebarRankButton({
  marker: 'data-bn-nico-ran-web-button',
  url: 'https://nicoranweb.com/',
  label: 'ニコランWEB',
  iconViewBox: '0 0 22 19',
  iconInner: SEARCH_ICON_INNER,
  // 既存のニコランボタンがあればその直後に並べる
  insertAfterMarker: 'data-bn-nico-rank-button',
});

/**
 * 設定を適用する
 * @param enabled - true: ボタンを追加, false: ボタンを削除
 */
export function apply(enabled: boolean): void {
  feature.apply(enabled);
}
