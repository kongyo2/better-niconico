// Better Niconico Settings Type Definitions

export interface BetterNiconicoSettings {
  // プレミアム会員セクションを非表示
  hidePremiumSection: boolean;
  // TV放送中のアニメセクションを非表示
  hideOnAirAnime: boolean;
  // 動画情報を従来のレイアウト（上部）に戻す
  restoreClassicVideoLayout: boolean;
  // ダークモードを有効化
  enableDarkMode: boolean;
  // 今後追加する機能のための拡張性
}

export const DEFAULT_SETTINGS: BetterNiconicoSettings = {
  hidePremiumSection: true,
  hideOnAirAnime: true,
  restoreClassicVideoLayout: false,
  enableDarkMode: false,
};

export const STORAGE_KEY = 'betterNiconicoSettings';
