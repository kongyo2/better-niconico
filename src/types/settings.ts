// Better Niconico Settings Type Definitions

import { z } from 'zod';

/**
 * Allegation template for auto-fill assistance
 */
export const AllegationTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  reasonId: z.string(), // 違反項目のvalue
  contentType: z.string(), // 種別のvalue (1=映像, 2=音声, 3=映像+音声)
  comment: z.string(), // 詳細コメント
});

export type AllegationTemplate = z.infer<typeof AllegationTemplateSchema>;

/**
 * Default allegation templates (汎用的な内容)
 * Defined before schema so it can be used as Zod default
 */
export const DEFAULT_ALLEGATION_TEMPLATES: AllegationTemplate[] = [
  {
    id: 'template-1',
    name: '無断転載と思われる動画の通報',
    reasonId: '91', // その他
    contentType: '3', // 映像+音声
    comment:
      '無断転載と思われる動画が多数氾濫しており、正規のコンテンツが探しにくくなるなど利用体験を大きく損なっています。\n\n私は権利者ではないため権利侵害の主張は行いませんが、スパム的投稿として規約違反の可能性があると考えています。\n\n調査と対応をご検討いただければ幸いです。',
  },
  {
    id: 'template-2',
    name: '一般的な違反報告',
    reasonId: '91', // その他
    contentType: '3', // 映像+音声
    comment: 'この動画には利用規約に違反する内容が含まれています。\n適切な対応をお願いいたします。',
  },
  {
    id: 'template-3',
    name: '詳細な違反報告',
    reasonId: '91', // その他
    contentType: '3', // 映像+音声
    comment:
      'この動画には利用規約に違反する内容が含まれています。\n\n違反内容：\n- \n\n該当箇所：\n- \n\nご確認のほど、よろしくお願いいたします。',
  },
  {
    id: 'template-4',
    name: 'カスタムテンプレート',
    reasonId: '91', // その他
    contentType: '3', // 映像+音声
    comment: '（ここに詳細を記入してください）',
  },
];

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
  // PiP高パフォーマンスモード（niconicommentsを使用）
  pipHighPerformanceMode: z.boolean().default(false),
  // 動画スクリーンショット機能を有効化
  enableVideoScreenshot: z.boolean().default(false),
  // 通報フォーム定型文入力補助機能を有効化
  enableAllegationAssist: z.boolean().default(false),
  // 通報フォーム定型文テンプレート
  allegationTemplates: z.array(AllegationTemplateSchema).default(DEFAULT_ALLEGATION_TEMPLATES),
  // シネマティックライティング（アンビエントモード）を有効化
  enableCinematicLighting: z.boolean().default(false),
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
  pipHighPerformanceMode: false,
  enableVideoScreenshot: false,
  enableAllegationAssist: false,
  allegationTemplates: DEFAULT_ALLEGATION_TEMPLATES,
  enableCinematicLighting: false,
};

export const STORAGE_KEY = 'betterNiconicoSettings';
