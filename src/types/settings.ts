// Better Niconico Settings Type Definitions

import { z } from 'zod';

/**
 * Zod schema for Better Niconico settings
 * Provides runtime validation for settings loaded from chrome.storage
 */
export const BetterNiconicoSettingsSchema = z.object({
  // プレミアム会員セクションを非表示
  hidePremiumSection: z.boolean().default(true),
  // TV放送中のアニメセクションを非表示
  hideOnAirAnime: z.boolean().default(true),
  // 動画情報を従来のレイアウト（上部）に戻す
  restoreClassicVideoLayout: z.boolean().default(false),
  // 動画アップスケーリング（Anime4K-WebGPU）を有効化
  enableVideoUpscaling: z.boolean().default(false),
  // サイドバーにnico-rank.comへのボタンを追加
  showNicoRankButton: z.boolean().default(true),
  // プロフィールアイコンを丸型から四角型に変更
  squareProfileIcons: z.boolean().default(false),
  // サポーターボタンを非表示
  hideSupporterButton: z.boolean().default(false),
  // ニコニ広告セクションを非表示
  hideNicoAds: z.boolean().default(false),
  // Picture-in-Picture機能を有効化
  enablePictureInPicture: z.boolean().default(false),
  // 動画スクリーンショット機能を有効化
  enableVideoScreenshot: z.boolean().default(false),
  // 動画ダウンロード機能を有効化
  enableVideoDownload: z.boolean().default(false),
});

/**
 * TypeScript type inferred from Zod schema
 * Ensures type and schema are always in sync
 */
export type BetterNiconicoSettings = z.infer<typeof BetterNiconicoSettingsSchema>;

/**
 * Default settings object
 * Uses schema defaults to ensure consistency
 */
export const DEFAULT_SETTINGS: BetterNiconicoSettings = {
  hidePremiumSection: true,
  hideOnAirAnime: true,
  restoreClassicVideoLayout: false,
  enableVideoUpscaling: false,
  showNicoRankButton: true,
  squareProfileIcons: false,
  hideSupporterButton: false,
  hideNicoAds: false,
  enablePictureInPicture: false,
  enableVideoScreenshot: false,
  enableVideoDownload: false,
};

export const STORAGE_KEY = 'betterNiconicoSettings';
