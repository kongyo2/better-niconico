# 開発ガイド

このドキュメントは、`better-niconico` の実装・スクリプト定義に合わせた開発手順をまとめたものです。

## 1. 前提環境

- Node.js: `24+` 推奨（ローカル運用方針）
- パッケージマネージャ: `npm`
- 対象ブラウザ: Chrome (Manifest V3)

補足:
- CI（`.github/workflows/ci.yml`）は現在 Node `20` で実行されています。

## 2. セットアップ

```bash
npm install
```

## 3. 主要コマンド

### 3.1 開発・ビルド

```bash
# 変更監視しつつ開発ビルド（nodemon経由）
npm run dev

# 本番ビルド（アイコン生成 + vite build + post-build）
npm run build

# 開発モードでwatchビルド
npm run preview

# dist削除
npm run clean
```

### 3.2 品質チェック

```bash
# lint（silent）
npm run lint

# lint（warningも失敗扱い）
npm run lint:strict

# lint自動修正
npm run lint:fix

# prettier整形
npm run format

# prettier検査
npm run format:check
```

### 3.3 テスト

```bash
# 単体テスト一括
npm run test

# 監視モード
npm run test:watch

# カバレッジ付き
npm run test:cov
```

## 4. Chrome での読み込み

1. `npm run build`（または `npm run dev`）
2. `chrome://extensions/` を開く
3. デベロッパーモードを ON
4. 「パッケージ化されていない拡張機能を読み込む」から `dist/` を選択
5. コード更新後は拡張機能をリロードし、対象ページも再読み込みする

## 5. 推奨開発フロー（t_wada式TDD）

本リポジトリでは以下の順序を基本とします。

1. 探索
2. Red
3. Green
4. Refactor

### 5.1 探索

- 対象機能の既存実装を確認（`src/content/features/*`）
- セレクタ依存がある場合は実ページDOMも確認
- 既存テスト（`*.test.ts`）から期待挙動・境界条件を確認

### 5.2 Red

- 先に失敗するテストを書く
- 既存仕様を壊さないよう、失敗範囲を明確化する

### 5.3 Green

- 最小変更でテストを通す
- まずは正しさ優先（最適化は後）

### 5.4 Refactor

- 冗長コード整理
- 命名・責務分離の改善
- 冪等性（`apply()` の多重呼び出し耐性）を維持

## 6. テスト構成

- フレームワーク: Vitest
- DOM環境: `happy-dom`
- セットアップ: `src/test/setup.ts`
  - `chrome.storage`, `chrome.runtime`, `chrome.tabs` をモック
- 対象: `src/**/*.test.ts`

重点確認ポイント:

1. `apply(true)` / `apply(false)` の往復
2. 同じ `apply(true)` を複数回呼んだ時の冪等性
3. 動的DOM変化（MutationObserver前提）
4. 関連機能との共存（例: PiP × Upscaling）

## 7. デバッグの実務ポイント

- コンソール接頭辞: `[Better Niconico]` / `[BetterNiconico]`
- 設定不整合時は `loadSettings()` が `Result` エラーを返す
- Content Script は設定取得失敗時に `DEFAULT_SETTINGS` で継続する
- watchページでは `fullscreenchange` 由来の分岐が多いため、全画面遷移を必ず確認する

## 8. 実ページ確認チェックリスト

### 8.1 watchページ (`/watch/*`)

1. `.grid-area_\[player\]` が存在する
2. `button[aria-label="全画面表示する"]` が存在する
3. コメントキャンバス `[data-name="comment"] canvas` を取得できる
4. サポーターキャンバス `[data-name="supporter-content"] canvas` を取得できる

### 8.2 video_top (`/video_top`)

1. `.simplebar-content` が存在する
2. `a[href*="/ranking?ref=video_sidemenu"]` が存在する
3. `.TagPushVideosContainer` / `.OnTvAnimeVideosContainer` を検出できる
4. 非表示機能が `.BaseLayout-block` 単位で効くことを確認する

## 9. よくある不具合と対処

### 9.1 ボタンが増殖する

- 原因: 既存マーカー未確認で要素を重複追加
- 対処: `data-bn-*` マーカー確認を追加

### 9.2 全画面で表示が崩れる

- 原因: 全画面中にグリッドやCanvas状態を強制変更
- 対処: `fullscreenchange` を基準に一時停止/再開を実装

### 9.3 動画ダウンロードが失敗する

- 原因候補:
  - master URL 抽出失敗
  - セグメント取得失敗
  - FFmpeg初期化失敗
- 対処:
  - `console` の `FFMPEG_*` / `FETCH_ERROR` を確認
  - `post-build` で `ffmpeg-core2.js` が manifest に挿入されているか確認

### 9.4 変更が反映されない

- 拡張機能のリロード漏れ
- ページ側キャッシュ（ハードリロードで確認）

## 10. 参照ドキュメント

- [architecture.md](./architecture.md)
- [features.md](./features.md)
- [implementation.md](./implementation.md)
