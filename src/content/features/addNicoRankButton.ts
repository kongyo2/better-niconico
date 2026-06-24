/**
 * サイドバーにnico-rank.comへのボタンを追加する機能
 * サイドメニューの「ランキング」リンクの直後に「ニコラン」ボタンを追加します。
 *
 * 両サイドメニュー実装(Emotion / PandaCSS)・折りたたみ/展開への追従といった
 * 共通ロジックは sidebarRankButton.ts のファクトリに集約しています。
 */
import { createSidebarRankButton } from './sidebarRankButton';

/**
 * 表彰台アイコン(nico-rank.comのシンボル)のSVG中身。
 * 複製元アイコンの色指定を引き継げるよう fill は currentColor を使う。
 */
const PODIUM_ICON_INNER =
  '<rect x="1" y="11" width="4.5" height="7" fill="currentColor" rx="0.5"/>' +
  '<rect x="7.5" y="6" width="4.5" height="12" fill="currentColor" rx="0.5"/>' +
  '<rect x="14" y="14" width="4.5" height="4" fill="currentColor" rx="0.5"/>' +
  '<rect x="0.5" y="17.5" width="21" height="1" fill="currentColor" rx="0.5"/>';

const feature = createSidebarRankButton({
  marker: 'data-bn-nico-rank-button',
  url: 'https://nico-rank.com/',
  label: 'ニコラン',
  iconViewBox: '0 0 22 19',
  iconInner: PODIUM_ICON_INNER,
});

/**
 * 設定を適用する
 * @param enabled - true: ボタンを追加, false: ボタンを削除
 */
export function apply(enabled: boolean): void {
  feature.apply(enabled);
}
