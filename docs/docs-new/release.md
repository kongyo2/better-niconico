# リリースガイド

このドキュメントは、`better-niconico` を **ローカルで配布可能な状態に仕上げる** ための手順と確認項目をまとめたものです。
Chrome Web Store 反映前に、技術的な整合性と手動 smoke を漏らさないことを目的にしています。

## 1. リリース対象の把握

2026-04-15 時点の公開スナップショット:

- Chrome Web Store 名称: `Better Niconico`
- 公開版: `1.0.14`
- ストア更新日: 2026年3月28日
- 利用者数表示: 60

> これは履歴用メモです。実際に出す版では、ストア画面を再確認してください。

## 2. バージョンの流れ

このリポジトリでは、**`package.json` の `version` が単一ソース** です。

反映先:

- `vite.config.ts` で manifest に注入
- Popup のバージョン表示 (`chrome.runtime.getManifest().version`)
- Chrome Web Store にアップロードされる manifest version

つまり、版上げ時にまず触るのは `package.json` です。

## 3. リリース前チェックリスト

### 3.1 コード品質

```bash
npm run lint:strict
npx tsc --noEmit
npm run test
npm run build
```

確認ポイント:

- lint / typecheck / test が通る
- `dist/` が生成される
- `dist/manifest.json` が妥当

### 3.2 ビルド成果物

`npm run build` 後に確認するもの:

| パス | 何を確認するか |
| --- | --- |
| `dist/manifest.json` | version、content_scripts、popup、permissions |
| `dist/icons/*` 相当 | アイコンが壊れていないか |
| `dist/ffmpeg/*` | FFmpeg 資産が含まれるか |

特に重要:

- `content_scripts[].js` の先頭に `ffmpeg/ffmpeg-core2.js` が入っているか
- `permissions` に不要な `scripting` が残っていないか

### 3.3 ローカル読込 smoke

1. `chrome://extensions/` で `dist/` を再読込
2. Popup を開いて version を確認
3. 対象ページで主要機能を確認

## 4. リリース前 smoke matrix

### 4.1 Popup

- バージョン表示が新しい版番号になっている
- トグル切替が保存される
- 通報テンプレートの CRUD が壊れていない

### 4.2 `/video_top`

- プレミアム誘導を消せる
- TV 放送中アニメを消せる
- ニコランボタンが 1 つだけ出る
- サイドバーの状態変更後も見た目が破綻しない

### 4.3 `/watch/*`

最低でも以下を確認:

- クラシックレイアウト ON/OFF
- fullscreen 往復後の復帰
- サポーターボタン非表示
- ニコニ広告非表示
- PiP ボタン表示と開始 / 停止
- スクリーンショット保存
- シネマティックライティングの表示と cleanup
- 大百科リンク復元
- 動画ダウンロードボタン表示

### 4.4 メディア機能の重点確認

#### アップスケーリング

- WebGPU 対応環境で有効化できるか
- 元動画が非表示になり、canvas 側で視聴できるか
- 全画面終了後に戻るか

#### 動画ダウンロード

- master playlist URL を検出できるか
- audio / video 取得に失敗しないか
- FFmpeg で mux できるか
- MP4 が保存されるか

#### PiP

- コメント込みで表示されるか
- 終了後に元の player 表示が復元されるか

### 4.5 通報フォーム

- `garage.nicovideo.jp/allegation/...` で dropdown が出る
- テンプレート選択で各欄が埋まる

## 5. ストア反映前の確認

### 5.1 メタデータ

ストアで確認 / 更新したいもの:

- 版番号
- 概要文
- スクリーンショット
- プライバシー申告
- 公開範囲や配布チャネル

### 5.2 権限とプライバシー

現行 manifest の権限は非常に小さいので、変更時は特に注意してください。

- `storage`
- `*://*.nicovideo.jp/*`

新しい権限を追加した場合:

1. manifest だけでなく docs も更新する
2. ストアの権限説明も見直す
3. privacy 申告との整合を確認する

## 6. 版上げ後に docs で直すもの

- `docs/README.md` の snapshot（必要なら）
- `docs/release.md` の公開版メモ
- 新機能があるなら `docs/features.md`
- 構造が変わったなら `docs/architecture.md`
- 手順が変わったなら `docs/development.md` / `docs/implementation.md`

## 7. 失敗したときの切り戻し観点

### 7.1 ストア公開前

- `package.json` の version を戻す
- 問題の feature を disable するか revert する
- `dist/` を作り直す

### 7.2 ストア公開後

優先順位:

1. 影響範囲の大きい機能を特定
2. `video_top` / `watch` / allegation のどこで壊れているか切り分け
3. selector drift か build artifact 問題かを分ける
4. 必要なら hotfix 版を作る

特に hotfix 候補になりやすいもの:

- `addNicoRankButton`
- `restoreClassicVideoLayout`
- `videoUpscaling`
- `pictureInPicture`
- `videoDownload`
- `restoreNicopediaLink`

## 8. リリース時に忘れやすいこと

1. `package.json` しか見ておらず、Popup の版表示確認を忘れる
2. `dist/manifest.json` を見ずに FFmpeg 注入漏れを見逃す
3. 自動テストだけ通してメディア機能の手動確認を省く
4. ストアの説明文やスクリーンショットを更新しない
5. docs を更新せず、次回の自分が困る
