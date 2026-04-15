# 開発ガイド

このドキュメントは、`better-niconico` の日常開発・調査・手動検証を進めるための実務メモです。
単なるコマンド一覧ではなく、**Chrome 拡張としてどこを見れば原因が分かるか** まで含めます。

## 1. 前提環境

### 1.1 Node / npm

- **CI 基準**: Node `20`
- **ローカル確認**: Node `v25.9.0`, npm `11.12.1` で `npm install` 済み（2026-04-15）
- **推奨方針**: 少なくとも Node `20+` で確認する

> `package.json` に `engines` 指定はありません。CI と合わせて Node 20 系でも壊れないことを最低ラインにしてください。

### 1.2 必要ツール

- Chrome（Manifest V3 拡張を手動読込できること）
- npm
- 実ページ確認用の DevTools

### 1.3 セットアップ

```bash
git clone https://github.com/kongyo2/better-niconico
cd better-niconico
npm install
```

CI 再現を優先したい場合:

```bash
npm ci
```

## 2. 主要コマンド

| コマンド | 用途 | 補足 |
| --- | --- | --- |
| `npm run dev` | 開発 watch build | `nodemon` が `vite build --mode development` を再実行する。HMR サーバではない |
| `npm run preview` | 開発モードの watch build | 名前は preview だが、実態は `vite build --watch --mode development` |
| `npm run build` | 本番ビルド | アイコン生成 → Vite build → post-build |
| `npm run clean` | `dist/` 削除 | リビルド前の掃除用 |
| `npm run lint` | oxlint | silent モード |
| `npm run lint:strict` | oxlint（warning も失敗扱い） | CI と合わせるならこれ |
| `npm run lint:fix` | oxlint 自動修正 | 大量変更時は差分確認必須 |
| `npm run format` | Prettier 整形 | docs 更新後にも有効 |
| `npm run format:check` | Prettier 検査 | CI 追加時に使いやすい |
| `npm run test` | Vitest 一括実行 | headless DOM テスト |
| `npm run test:watch` | テスト watch | feature 単位の開発向け |
| `npm run test:cov` | カバレッジ付きテスト | 変更範囲の把握用 |
| `npx tsc --noEmit` | TypeScript 型検査 | **typecheck script は未定義** なので手動実行 |

## 3. ビルドの実態

`npm run build` は次の順に動きます。

1. `generate-icons.js`
   - `public/icons/icon.svg` から PNG を再生成
2. `vite build`
   - CRXJS で拡張として bundle
3. `scripts/post-build.mjs`
   - `dist/manifest.json` に `ffmpeg/ffmpeg-core2.js` を差し込む

### 開発時の注意

- `dist/` のみ更新しても、Chrome に読ませている拡張は **手動リロード** が必要
- FFmpeg まわりを触ったら、`dist/manifest.json` の `content_scripts[].js` 先頭に `ffmpeg/ffmpeg-core2.js` があるか必ず見る

## 4. Chrome でのローカル読込

1. `npm run build`
2. `chrome://extensions/` を開く
3. デベロッパーモードを ON
4. 「パッケージ化されていない拡張機能を読み込む」から `dist/` を選択
5. ソース変更後は
   - 拡張機能をリロード
   - 対象ページも再読み込み

## 5. デバッグ対象の見分け方

| 事象 | まず見る場所 | 理由 |
| --- | --- | --- |
| 設定が保存されない | Popup DevTools + `chrome.storage.sync` | Popup が storage を直接使うため |
| DOM が二重に挿入される | Content Script Console | 全体再適用アーキテクチャの影響が大きい |
| 大百科リンクが出ない | Background Service Worker + Network | `CHECK_NICOPEDIA_ARTICLE` の fetch 失敗かも |
| ダウンロードが失敗する | Content Script Console + `dist/manifest.json` | HLS URL 抽出 / FFmpeg 注入のどちらかが多い |
| アップスケーリングしない | Console + `navigator.gpu` 可否 | WebGPU 非対応の可能性 |
| PiP が壊れる | Console + 実ページでの再現 | headless テストでは追いにくい |

## 6. Chrome DevTools での確認レシピ

以下は 2026-04-15 に **Chrome DevTools MCP** でも実行した確認レシピです。

### 6.1 watch ページ前提確認 (`/watch/sm9` など)

```js
[
  '.grid-area_\\[player\\]',
  '.grid-area_\\[bottom\\]',
  '.grid-area_\\[sidebar\\]',
  '[data-name="comment"] canvas',
  '[data-name="supporter-content"] canvas',
  '#nv_watch_VideoAdContainer',
  'button[aria-label="全画面表示する"]'
].map((s) => ({ selector: s, count: document.querySelectorAll(s).length }));
```

見るポイント:

- player / bottom / sidebar が 1 件ずつあるか
- コメント canvas / supporter canvas が取れるか
- fullscreen ボタンの `aria-label` が変わっていないか

### 6.2 video_top 前提確認

```js
[
  '.simplebar-content',
  '.TagPushVideosContainer',
  '.OnTvAnimeVideosContainer',
  '.BaseLayout-block',
  'a.css-1i9dz1a[href*="/ranking?ref=video_sidemenu"]'
].map((s) => ({ selector: s, count: document.querySelectorAll(s).length }));
```

追加確認:

```js
const ranking = document.querySelector('a.css-1i9dz1a[href*="/ranking?ref=video_sidemenu"]');
({
  groupClass: ranking?.closest('.css-1i3qj3a, .css-gzpr6t')?.className,
  innerClass: ranking?.firstElementChild?.className,
  textClass: ranking?.querySelector('p')?.className,
});
```

### 6.3 動画ダウンロードの master URL 抽出確認

```js
performance
  .getEntriesByType('resource')
  .filter((r) => r.name.includes('.m3u8'))
  .map((r) => r.name);
```

これで何も出ない場合:

- 再生開始前でまだ HLS 取得されていない
- Performance entries が残っていない
- `stream.ts` の fallback DOM 探索に頼る必要がある

### 6.4 大百科リンクの必要性確認

```js
{
  tagLinks: document.querySelectorAll('a[href*="/tag/"]').length,
  dicLinks: document.querySelectorAll('a[href*="dic.nicovideo.jp/a/"]').length,
}
```

`dicLinks === 0` なら `restoreNicopediaLink` の価値がまだあると判断しやすいです。

## 7. 推奨開発フロー

### 7.1 基本ループ

1. 対象機能の既存実装とテストを読む
2. 失敗するテストを書く（または現状挙動を固定する）
3. 最小変更で通す
4. `npm run lint:strict`
5. `npx tsc --noEmit`
6. `npm run test`
7. 必要なら `npm run build`
8. Chrome で手動 smoke test
9. docs を同期更新

### 7.2 DOM 依存機能の流れ

1. live page で selector を再確認
2. 既存の `data-bn-*` マーカー命名と cleanup を確認
3. `apply(true)` / `apply(false)` の往復をテスト
4. 再読み込みなし再適用でも壊れないか見る

### 7.3 メディア機能の流れ

対象:

- `videoUpscaling`
- `pictureInPicture`
- `videoScreenshot`
- `videoDownload`
- `cinematicLighting`

追加で見ること:

- fullscreen の前後
- コメント canvas が再生成された後
- 動画切替 / SPA 的遷移後
- コンソールにエラーが残っていないか

## 8. 手動 smoke test チェックリスト

### 8.1 Popup

- バージョン表示が `package.json` と一致する
- 各カテゴリの項目数が崩れていない
- トグルの ON/OFF が再オープン後も保持される
- 定型文の追加 / 編集 / 削除ができる

### 8.2 `/video_top`

- プレミアム誘導の表示 / 非表示
- TV 放送中アニメの表示 / 非表示
- ニコランボタンがランキングの近くに 1 つだけ出る
- サイドバーの開閉でニコランの class が破綻しない

### 8.3 `/watch/*`

- クラシックレイアウトの ON/OFF と fullscreen 往復
- サポーターボタン / ニコニ広告の非表示
- PiP ボタン追加、開始、終了、コメント付き合成
- スクリーンショット保存
- シネマティックライティングの開始 / cleanup
- ダウンロードボタン追加、失敗時エラー文言、成功時保存
- タグ横に「百」リンクが追加されるか

### 8.4 通報フォーム

- `garage.nicovideo.jp/allegation/...` で dropdown が 1 回だけ挿入される
- テンプレート選択で `reason_id`, `content_type`, `comment` が埋まる

## 9. よくある不具合と対処

### 9.1 ボタンが増殖する

原因候補:

- `MutationObserver` 再適用時に既存ボタン検知が足りない
- `document.contains(existingButton)` チェック漏れ

対処:

- 既存 ID / `data-bn-*` マーカー確認を先に入れる
- `apply(false)` で確実に remove する

### 9.2 全画面遷移で崩れる

原因候補:

- レイアウト変更系が fullscreen を考慮していない
- PiP / ライティング / アップスケールが停止・復帰条件を満たしていない

対処:

- `fullscreenchange` を明示的に扱う
- 全画面中は無理に DOM を組み替えない

### 9.3 動画ダウンロードが動かない

切り分け順:

1. `performance.getEntriesByType('resource')` で `.m3u8` が見えるか
2. `dist/manifest.json` に `ffmpeg/ffmpeg-core2.js` が入っているか
3. console に `FFMPEG_*` 系ログが出ているか
4. network / credentials 条件が変わっていないか

### 9.4 アップスケーリングが動かない

原因候補:

- `navigator.gpu` 非対応
- 広告動画しか取れていない
- 動画 readyState / dimensions がまだ足りない

対処:

- 再生開始後に確認
- `#nv_watch_VideoAdContainer` 外の video が有効か調べる

### 9.5 大百科リンクが出ない

原因候補:

- tag container selector がずれた
- background fetch が失敗している
- 大百科側文言が変わった

対処:

- Background Service Worker console で `CHECK_NICOPEDIA_ARTICLE` を確認
- `dic.nicovideo.jp/a/{tag}` を手で開いて文言変化を確認

## 10. 変更前 / 変更後の最低確認セット

### コード変更前

- 対象ドキュメントを読む
- 既存テストの粒度を把握する
- live selector を必要に応じて確認する

### コード変更後

```bash
npm run lint:strict
npx tsc --noEmit
npm run test
npm run build
```

そのうえで、変更対象に応じた手動 smoke test を実施してください。
