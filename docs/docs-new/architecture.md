# アーキテクチャ

このドキュメントは、`better-niconico` の **現行 main 相当実装** を、保守・改修・レビュー向けに整理したものです。
「どのコンポーネントが何を担当し、どう連携し、どこが壊れやすいか」を説明します。

## 1. システム概要

`better-niconico` は **Manifest V3 の Chrome 拡張**です。主に以下の 3 実行面で構成されます。

1. **Background Service Worker** — 外部 fetch と拡張ライフサイクル処理
2. **Content Script** — ニコニコ各ページの DOM 変更と機能適用
3. **Popup UI** — ユーザー設定の表示・保存・定型文管理

### 1.1 実運用上の対象

- `www.nicovideo.jp`
- `garage.nicovideo.jp`
- そのほか `*.nicovideo.jp` 配下の一部ページ

`manifest.json` 上の `host_permissions` は `*://*.nicovideo.jp/*` のみで、権限は最小限です。
Chrome Web Store listing 上でも「データ収集なし」として公開されています（2026-04-15 確認）。

## 2. トップレベル構成

| パス | 役割 |
| --- | --- |
| `src/background/index.ts` | install/update 処理、ニコニコ大百科記事存在確認 API |
| `src/content/index.ts` | 設定ロード、14 機能の適用順序制御、DOM 監視、メッセージ応答 |
| `src/content/features/*` | 個別機能実装 |
| `src/popup/*` | 設定 UI / 定型文管理 UI |
| `src/types/settings.ts` | Zod ベースの設定スキーマ、デフォルト値 |
| `src/utils/storage.ts` | `chrome.storage.sync` の型安全ラッパ |
| `manifest.json` | 拡張メタデータと権限 |
| `vite.config.ts` | CRXJS + Vite ビルド設定 |
| `scripts/post-build.mjs` | `ffmpeg-core2.js` の manifest 挿入 |
| `public/ffmpeg/*` | Content Script から読む FFmpeg ランタイム |
| `public/icons/*` | ストア / 拡張アイコン |

## 3. 実行フロー

### 3.1 起動から機能適用まで

```text
ページ読込
  ↓
content script 注入 (`document_end`)
  ↓
`initialize()`
  ↓
`loadSettings()`
  ├─ 成功: 保存済み設定を使う
  └─ 失敗: `DEFAULT_SETTINGS` にフォールバック
  ↓
14 機能を決まった順序で `apply()`
  ↓
`chrome.storage.onChanged` 監視開始
  ↓
`MutationObserver(document.body)` 監視開始
  ↓
新規 DOM 追加や設定変更のたびに再適用
```

#### 3.1.1 適用順序

`src/content/index.ts` の現在の順序です。

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

この順序は相互作用に影響します。特に次の関係が重要です。

- `pictureInPicture` は `videoUpscaling` が生成した `#bn-upscaled-canvas` を優先利用する
- `videoScreenshot` はアップスケール canvas ではなく元動画フレームを使う
- `videoDownload` / `restoreNicopediaLink` は DOM 装飾後段で独立して動く

### 3.2 Background Service Worker

ファイル: `src/background/index.ts`

#### 主な責務

- install 時に `initialized` と `installedAt` を保存
- update 時に旧版→新版をログ出力
- `nicovideo.jp` タブ更新時にログ出力
- `CHECK_NICOPEDIA_ARTICLE` を受けて `dic.nicovideo.jp` を fetch

#### メッセージ契約

| メッセージ | 呼び出し元 | 返却値 | 用途 |
| --- | --- | --- | --- |
| `CHECK_NICOPEDIA_ARTICLE` | `restoreNicopediaLink` | `{ exists: boolean }` | タグに大百科記事があるか確認 |

#### 大百科存在判定の仕組み

- `https://dic.nicovideo.jp/a/{tag}` を取得
- HTML に `まだ記事が書かれていません` が含まれるかで存在判定
- fetch エラーや non-OK は `exists: false`

##### 壊れやすい点

- 判定が **固定日本語文言** に依存している
- 大百科側の文面変更やリダイレクト仕様変更で誤判定しうる

### 3.3 Content Script オーケストレータ

ファイル: `src/content/index.ts`

#### 主な責務

- `loadSettings()` の結果を受けて全機能を適用
- 設定取得失敗時でも `DEFAULT_SETTINGS` で継続
- `chrome.storage.onChanged` でホットリロード的に再適用
- `MutationObserver` で SPA/遅延描画に追従
- 互換用メッセージ API (`getSettings`, `updateSettings`) を提供

#### 重要な実装特性

1. **全体再適用型**
   - DOM 追加を検知すると対象機能だけでなく全機能を再適用する
2. **機能の冪等性が前提**
   - 追加ボタン、追加コンテナ、イベントリスナ、MutationObserver は各機能側で重複防止する必要がある
3. **設定取得失敗時も止めない**
   - 壊れたストレージがあっても、ページ改変自体は継続する

#### メッセージ API

| action | 現状の主用途 | 備考 |
| --- | --- | --- |
| `getSettings` | 互換用 / 将来拡張用 | Popup は現在この API を使わず、storage を直接読む |
| `updateSettings` | 互換用 / 将来拡張用 | 同上 |

> 現在の Popup は `loadSettings()` / `saveSettings()` を直接使うため、runtime message API は「残っている互換レイヤー」と理解すると把握しやすいです。

### 3.4 Popup UI

ファイル: `src/popup/popup.ts`, `popup.html`, `popup.css`, `popup-editor.css`

#### 役割

- 設定の一覧表示とトグル操作
- カテゴリ切替（`video` / `ui` / `system`）
- `enableAllegationAssist` 用テンプレート CRUD
- バージョン表示（`chrome.runtime.getManifest().version`）

#### UI 構成

| 要素 | 説明 |
| --- | --- |
| Header | ロゴ、タイトル、バージョンバッジ |
| Tabs | 動画 / UI/表示 / システム |
| Setting Card | ラベル、説明、任意の action button、トグル |
| Template Editor | 定型文の一覧 / 追加 / 編集 / 削除 |
| Footer | ステータスメッセージ、GitHub リンク |

#### 設定カテゴリ数（現行）

- `video`: 6 項目
- `ui`: 7 項目
- `system`: 1 項目（+ 定型文管理 UI）

## 4. 設定モデル

ファイル: `src/types/settings.ts`

### 保存先

- ユーザー設定キー: `betterNiconicoSettings`
- install 時メタデータ: `initialized`, `installedAt`

### 設定一覧

| キー | カテゴリ | 既定値 | 主担当 |
| --- | --- | --- | --- |
| `hidePremiumSection` | UI | `true` | `hidePremiumSection.ts` |
| `hideOnAirAnime` | UI | `true` | `hideOnAirAnime.ts` |
| `restoreClassicVideoLayout` | 動画 | `false` | `restoreClassicVideoLayout.ts` |
| `enableVideoUpscaling` | 動画 | `false` | `videoUpscaling.ts` |
| `showNicoRankButton` | UI | `true` | `addNicoRankButton.ts` |
| `squareProfileIcons` | UI | `false` | `squareProfileIcons.ts` + `index.css` |
| `hideSupporterButton` | UI | `false` | `hideSupporterButton.ts` + `index.css` |
| `hideNicoAds` | UI | `false` | `hideNicoAds.ts` |
| `enablePictureInPicture` | 動画 | `false` | `pictureInPicture.ts` |
| `enableVideoScreenshot` | 動画 | `false` | `videoScreenshot.ts` |
| `enableAllegationAssist` | システム | `false` | `allegationAssist.ts` |
| `allegationTemplates` | システム内部 | 4 件 | Popup Editor + `allegationAssist.ts` |
| `enableCinematicLighting` | 動画 | `false` | `cinematicLighting.ts` |
| `enableVideoDownload` | 動画 | `false` | `videoDownload/*` |
| `restoreNicopediaLink` | UI | `false` | `restoreNicopediaLink.ts` |

### バリデーション方針

- Zod schema を単一の真実源にする
- `loadSettings()` では `safeParse`
- 壊れたデータは ValidationError として扱う
- Content Script はそのエラーを受けても `DEFAULT_SETTINGS` で動く
- Popup / save 側は invalid settings の保存を拒否する

## 5. 個別コンポーネントの設計パターン

### 5.1 CSS トグル型

例:

- `squareProfileIcons`
- `hideSupporterButton`

特徴:

- JS 側は `body` にクラスを付け外しするだけ
- 表示差分は `src/content/index.css` に寄せる
- 多サービス横断のスタイル調整に向く

### 5.2 DOM 非表示 / DOM 挿入型

例:

- `hidePremiumSection`
- `hideOnAirAnime`
- `hideNicoAds`
- `addNicoRankButton`
- `restoreNicopediaLink`

特徴:

- 既存 DOM に直接作用する
- `data-bn-*` マーカーで再適用時の重複を防ぐ
- 外部サイトの class 名 drift に弱い

### 5.3 非同期 / メディア処理型

例:

- `videoUpscaling`
- `pictureInPicture`
- `videoScreenshot`
- `videoDownload`
- `allegationAssist`
- `cinematicLighting`

特徴:

- 事前条件（動画要素、comment canvas、WebGPU、HLS、フォーム要素）が多い
- `neverthrow` による局所エラー化を多用
- Observer / frame callback / fullscreen event / timer の後始末が重要

## 6. ビルドとパッケージング

### 6.1 マニフェスト

`manifest.json` の要点:

- `manifest_version: 3`
- `permissions: ["storage"]`
- `host_permissions: ["*://*.nicovideo.jp/*"]`
- `background.service_worker: src/background/index.ts`
- `content_scripts.js: src/content/index.ts`
- `action.default_popup: src/popup/popup.html`
- `web_accessible_resources` に `assets/*`, `icons/*`, `ffmpeg/*`

### 6.2 Vite / CRXJS

`vite.config.ts` では以下を行います。

- `@crxjs/vite-plugin` で Chrome 拡張ビルド
- `manifest.json` と `manifest.dev.json` を開発時のみマージ
- `package.json.version` を manifest に注入
- `contentScripts.injectCss: true` で CSS 注入を CRXJS に任せる
- 本番時は `stripDevIcons()` で dev アイコンを削除

### 6.3 アイコン生成

`npm run build` の先頭で `generate-icons.js` が実行されます。

- 入力: `public/icons/icon.svg`
- 出力: `public/icons/icon16.png`, `32`, `48`, `128`
- ラスタライズには `@resvg/resvg-js` を使用

### 6.4 Post-build で FFmpeg を差し込む理由

`scripts/post-build.mjs` は `dist/manifest.json` を直接書き換えます。

理由:

- `videoDownload` は `public/ffmpeg/ffmpeg-core2.js` を **content script の先頭** に入れておく必要がある
- CRXJS 側だけではこの静的 JS の挿入順制御が足りないため、後処理で補う

副作用:

- FFmpeg 系の構成を変えるときは `post-build` も必ず確認する
- `dist/manifest.json` を手で読む検証が重要になる

## 7. 外部依存関係

| パッケージ | 現在の役割 |
| --- | --- |
| `neverthrow` | Storage / メディア処理の Result 型 |
| `zod` | 設定バリデーションとデフォルト適用 |
| `anime4k-webgpu` | 動画アップスケーリング |
| `@ffmpeg/core`, `@ffmpeg/ffmpeg`, `@ffmpeg/util` | 動画ダウンロード後の mux |
| `@resvg/resvg-js` | SVG → PNG アイコン生成 |
| `@xpadev-net/niconicomments` | **2026-04-15 時点では `src/` から import なし**。将来用途か、整理候補 |

## 8. テスト構成

- フレームワーク: Vitest
- DOM 環境: `happy-dom`
- 共通モック: `src/test/setup.ts`
- 現在のテスト対象数: `19` ファイル（2026-04-15 集計）

### 自動テストだけでは拾いにくい領域

- `pictureInPicture.ts`（MediaStream / PiP 実ブラウザ依存）
- `videoDownload/muxer.ts`（FFmpeg content-script 実行）
- `videoUpscaling.ts`（WebGPU 実機依存）

これらは **手動 smoke test が必須** です。

## 9. 2026-04-15 ライブ DOM 確認（Chrome DevTools MCP）

### 9.1 `/watch/sm9`

確認できたもの:

- `.grid-area_\\[player\\]`
- `.grid-area_\\[bottom\\]`
- `.grid-area_\\[sidebar\\]`
- `[data-name="comment"] canvas`
- `[data-name="supporter-content"] canvas`
- `#nv_watch_VideoAdContainer`
- `button[aria-label="全画面表示する"]`
- `a[href*="creator-support.nicovideo.jp"]`

追加で確認したこと:

- タグリンクは複数存在する
- `dic.nicovideo.jp/a/...` へのリンクは 0 件
- `restoreNicopediaLink` は現行ページでも意味がある

### 9.2 `/video_top`

確認できたもの:

- `.simplebar-content`
- `.TagPushVideosContainer`
- `.OnTvAnimeVideosContainer`
- `.BaseLayout-block`
- `a.css-1i9dz1a[href*="/ranking?ref=video_sidemenu"]`
- 折りたたみグループ `.css-1i3qj3a`
- 内部クラス `.css-54sd46`
- テキストクラス `.css-ium6yj`

未確認:

- 展開時クラス `.css-gzpr6t` は当日 snapshot では 0 件
  - つまり `addNicoRankButton` の展開状態分岐は **コードとテストで守りつつ、実ページでは追加確認が必要**

## 10. 壊れやすいポイント / 保守上の注意

1. **ハッシュ化 CSS クラス依存**
   - `video_top` のサイドバーや一部 watch ページは class 名 drift に弱い
2. **全体再適用アーキテクチャ**
   - Content Script が全機能を何度も再適用する前提なので、重複挿入とイベントリークが最大リスク
3. **メディア機能のブラウザ依存**
   - WebGPU / PiP / FFmpeg は headless テストだけでは保証しきれない
4. **大百科の文言依存判定**
   - 背景 fetch 側の存在確認はページ文面に依存する
5. **Popup と Content の二重設定導線**
   - Popup は storage 直読、Content は message API も持つ。変更時は双方を意識する

## 11. このドキュメントを更新すべき変更

- 新しい設定キー追加 / 既定値変更
- Feature の適用順序変更
- 新しい message contract 追加
- FFmpeg まわりの組み込み方式変更
- セレクタ変更や新しい live-site 検証結果取得
