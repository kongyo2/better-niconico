// Better Niconico Settings Type Definitions

export interface BetterNiconicoSettings {
  // プレミアム会員セクションを非表示
  hidePremiumSection: boolean;
  // 今後追加する機能のための拡張性
}

export const DEFAULT_SETTINGS: BetterNiconicoSettings = {
  hidePremiumSection: true,
};

export const STORAGE_KEY = 'betterNiconicoSettings';
