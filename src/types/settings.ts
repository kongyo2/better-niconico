// Better Niconico Settings Type Definitions

export interface BetterNiconicoSettings {
  // プレミアム会員セクションを非表示
  hidePremiumSection: boolean;
  // TV放送中のアニメセクションを非表示
  hideOnAirAnime: boolean;
  // 動画情報を従来のレイアウト（上部）に戻す
  restoreClassicVideoLayout: boolean;
  // 動画アップスケーリング（Anime4K-WebGPU）を有効化
  enableVideoUpscaling: boolean;
  // サイドバーにnico-rank.comへのボタンを追加
  showNicoRankButton: boolean;
  // プロフィールアイコンを丸型から四角型に変更
  squareProfileIcons: boolean;
  // サポーターボタンを非表示
  hideSupporterButton: boolean;
  // 今後追加する機能のための拡張性
}

export const DEFAULT_SETTINGS: BetterNiconicoSettings = {
  hidePremiumSection: true,
  hideOnAirAnime: true,
  restoreClassicVideoLayout: false,
  enableVideoUpscaling: false,
  showNicoRankButton: true,
  squareProfileIcons: false,
  hideSupporterButton: false,
};

export const STORAGE_KEY = 'betterNiconicoSettings';
