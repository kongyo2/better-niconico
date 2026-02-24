# アーキテクチャ

このドキュメントは、`better-niconico` の現行実装（`main`ブランチ相当）を基準に、構成・責務・データフローを整理したものです。

## 1. 全体像

`better-niconico` は Manifest V3 の Chrome 拡張です。主な実行単位は以下の3つです。

1. Background Service Worker（`src/background/index.ts`）
2. Content Script（`src/content/index.ts`）
3. Popup UI（`src/popup/*`）

対象ドメインは `*://*.nicovideo.jp/*` です。

## 2. 実行コンポーネント

### 2.1 Background Service Worker

- ファイル: `src/background/index.ts`
- 主な責務:
  - インストール時の初期メタデータ保存（`initialized`, `installedAt`）
  - 更新時ログ出力
  - `nicovideo.jp` タブ更新ログ出力
  - `CHECK_NICOPEDIA_ARTICLE` メッセージ処理
- `CHECK_NICOPEDIA_ARTICLE` 処理:
  - `https://dic.nicovideo.jp/a/{tag}` を `fetch`
  - HTML に `まだ記事が書かれていません` を含むかで存在判定
  - Content Script 側へ `{ exists: boolean }` を返却

### 2.2 Content Script

- ファイル: `src/content/index.ts`
- 注入タイミング: `document_end`
- 主な責務:
  - 設定ロードと全機能の適用
  - `chrome.storage.onChanged` 監視による再適用
  - DOM追加時の再適用（`MutationObserver`）
  - Popup とのメッセージ連携（`getSettings`, `updateSettings`）
- 適用順序（現行実装）:
  1. `hidePremiumSection`
  2. `hideOnAirAnime`
  3. `restoreClassicVideoLayout`
  4. `videoUpscaling`
  5. `addNicoRankButton`
  6. `squareProfileIcons`
  7. `hideSupporterButton`
  8. `hideNicoAds`
  9. `pictureInPicture`
  10. `videoScreenshot`
  11. `allegationAssist`
  12. `cinematicLighting`
  13. `videoDownload`
  14. `restoreNicopediaLink`

### 2.3 Popup UI

- ファイル: `src/popup/popup.html`, `src/popup/popup.ts`, `src/popup/popup.css`, `src/popup/popup-editor.css`
- 主な責務:
  - 設定の表示・切り替え
  - カテゴリタブ切り替え（`video` / `ui` / `system`）
  - 設定保存（`saveSettings`）
  - 通報テンプレート CRUD UI（`enableAllegationAssist` の action）
- 画面仕様:
  - 固定サイズ: `360 x 520`
  - ステータスメッセージ表示
  - バージョン表示（`chrome.runtime.getManifest().version`）

## 3. 設定モデル

- 定義: `src/types/settings.ts`
- 保存キー: `betterNiconicoSettings`
- バリデーション: Zod (`BetterNiconicoSettingsSchema`)
- 実行時型安全化: `loadSettings` / `saveSettings` で `safeParse`

### 3.1 設定項目（現行）

| キー | 型 | デフォルト |
|---|---|---|
| `hidePremiumSection` | boolean | `true` |
| `hideOnAirAnime` | boolean | `true` |
| `restoreClassicVideoLayout` | boolean | `false` |
| `enableVideoUpscaling` | boolean | `false` |
| `showNicoRankButton` | boolean | `true` |
| `squareProfileIcons` | boolean | `false` |
| `hideSupporterButton` | boolean | `false` |
| `hideNicoAds` | boolean | `false` |
| `enablePictureInPicture` | boolean | `false` |
| `enableVideoScreenshot` | boolean | `false` |
| `enableAllegationAssist` | boolean | `false` |
| `allegationTemplates` | `AllegationTemplate[]` | 4件の既定テンプレート |
| `enableCinematicLighting` | boolean | `false` |
| `enableVideoDownload` | boolean | `false` |
| `restoreNicopediaLink` | boolean | `false` |

### 3.2 設定ロード失敗時の扱い

`src/content/index.ts` では `loadSettings()` がエラーの場合でも処理を継続し、`DEFAULT_SETTINGS` を適用します。これにより、保存データ破損時でも機能停止を避けます。

## 4. エラーハンドリング方針

- 共通エラー型: `src/types/errors.ts`
- 非同期エラー表現:
  - `neverthrow` の `Result` / `ResultAsync` を利用
- 主な適用箇所:
  - Storage API ラッパ（`src/utils/storage.ts`）
  - PiP / スクリーンショット（動画要素検出の失敗を型で扱う）
  - 動画ダウンロード（ダウンロード・FFmpeg処理失敗を型で扱う）

## 5. マニフェストとビルド

### 5.1 Manifest（`manifest.json`）

- `manifest_version`: 3
- `permissions`: `storage`
- `host_permissions`: `*://*.nicovideo.jp/*`
- `background.service_worker`: `src/background/index.ts`
- `content_scripts.js`: `src/content/index.ts`
- `action.default_popup`: `src/popup/popup.html`
- `web_accessible_resources`:
  - `assets/*`
  - `icons/*`
  - `ffmpeg/*`

### 5.2 Vite 構成（`vite.config.ts`）

- `@crxjs/vite-plugin` を利用
- `manifest.json` + `manifest.dev.json` をマージ
- `version` は `package.json` から注入
- `contentScripts.injectCss: true` のため、manifest に CSS を手書きしない

### 5.3 Post Build（`scripts/post-build.mjs`）

ビルド後に `dist/manifest.json` を書き換え、`ffmpeg/ffmpeg-core2.js` を content scripts へ先頭挿入します。動画ダウンロード機能の FFmpeg 実行に必須です。

## 6. テスト基盤

- テストフレームワーク: Vitest
- DOM環境: `happy-dom`
- セットアップ: `src/test/setup.ts`
  - `chrome.*` API のモックを定義
- テスト配置: `src/**/*.test.ts`
- カバレッジ対象: `src/**/*.ts`（`types`, `test`, `*.test.ts` など除外）

## 7. 実ページ整合確認（2026-02-24 実施）

実装で依存する主要セレクタについて、実ページで存在確認を行いました。

### `/watch/sm9`

- 確認できたセレクタ:
  - `.grid-area_\[player\]`
  - `.grid-area_\[bottom\]`
  - `.grid-area_\[sidebar\]`
  - `[data-name="comment"] canvas`
  - `[data-name="supporter-content"] canvas`
  - `#nv_watch_VideoAdContainer`
  - `button[aria-label="全画面表示する"]`

### `/video_top`

- 確認できたセレクタ:
  - `.simplebar-content`
  - `.TagPushVideosContainer`
  - `.OnTvAnimeVideosContainer`
  - `.BaseLayout-block`
  - `a.css-1i9dz1a[href*="/ranking?ref=video_sidemenu"]`
  - 折りたたみ時コンテナ `.css-1i3qj3a`

上記は、`hidePremiumSection` / `hideOnAirAnime` / `addNicoRankButton` / watchページ系機能の現行実装と一致しています。
