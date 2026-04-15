# 実装ガイド

このドキュメントは、`better-niconico` に機能追加・改修・整理を入れるときの標準手順をまとめたものです。
目標は **壊れにくく・戻しやすく・docs と同期した変更** を作ることです。

## 1. 実装原則

1. **既存挙動を理解してから触る**
2. **`apply(true)` / `apply(false)` の往復を設計の中心に置く**
3. **設定スキーマ・Popup・Content Script・docs を一緒に更新する**
4. **セレクタ drift を前提に、防御的に書く**
5. **メディア系は自動テスト + 手動検証の二段構えにする**

## 2. 変更の種類ごとの進め方

### 2.1 既存機能の軽微修正

対象例:

- セレクタ修正
- 文言修正
- 既存マーカー漏れの補修

手順:

1. 既存テストを読む
2. 失敗ケースを再現するテストを足す
3. 最小変更で直す
4. docs の該当節を更新する

### 2.2 新機能追加

対象例:

- 新しい watch 機能
- 新しい `video_top` 装飾
- 新しい Popup トグル

手順:

1. どのページで動くか決める
2. 実装パターンを決める（CSS / DOM / 非同期）
3. テストを書く
4. feature module を追加する
5. settings / popup / content index / docs を同期する
6. build + 手動確認を行う

### 2.3 大きめの refactor

対象例:

- videoDownload 内部整理
- watch 系共通ユーティリティ抽出
- observer / cleanup 戦略の見直し

手順:

1. まず回帰を固定するテストを書く
2. 1 パスで複数責務を同時に変えない
3. docs に「設計変更点」を残す
4. 変更範囲が広いほど `release.md` の smoke checklist を多めに回す

## 3. 新機能追加の標準チェックリスト

### 3.1 機能ファイル

追加先:

- 単一ファイルなら `src/content/features/<featureName>.ts`
- 複数モジュールなら `src/content/features/<featureName>/...`

公開インターフェース:

```ts
export function apply(enabled: boolean): void {
  if (enabled) {
    enableFeature();
  } else {
    disableFeature();
  }
}
```

非同期が必要なら `Promise<void>` にしてもよいですが、呼び出し側で fire-and-forget される前提を意識してください。

### 3.2 設定スキーマ

更新先: `src/types/settings.ts`

やること:

1. `BetterNiconicoSettingsSchema` に追加
2. `DEFAULT_SETTINGS` に追加
3. 必要なら補助型を追加
4. デフォルト値を必ず定義する

理由:

- Zod default が後方互換の土台
- 旧ユーザーの保存データにも安全にデフォルトを適用できる

### 3.3 Content Script 接続

更新先: `src/content/index.ts`

やること:

1. feature module を import
2. `applySettings()` 成功時 / 失敗時の両方に呼び出しを追加
3. 実行順を意識して配置する

順序判断の例:

- レイアウト土台を変えるものは前段
- 装飾系は中段
- 独立ボタンや background 連携は後段

### 3.4 Popup 反映

更新先: `src/popup/popup.ts`

`SETTINGS_CONFIG` に以下を足します。

- `id`
- `label`
- `description`
- `category`
- `icon`（推奨）
- `actionButton`（必要な場合のみ）

Popup を更新しないと:

- ユーザーが設定できない
- デフォルト値だけ存在する隠し設定になる

### 3.5 docs 同期

最低でも更新対象:

- `docs/features.md`
- `docs/architecture.md`（責務やデータフローが変わる場合）
- `docs/development.md`（手動確認やトラブルシュートが増える場合）
- `docs/release.md`（リリース手順に影響する場合）

## 4. 実装パターンの選び方

### 4.1 CSS クラス付与型

向いているもの:

- 単純な見た目変更
- 非表示切り替え
- 多ページ横断のスタイル補正

使いどころ:

- `squareProfileIcons`
- `hideSupporterButton`

利点:

- 速い
- cleanup が簡単
- DOM 再生成に比較的強い

### 4.2 DOM 非表示 / DOM 挿入型

向いているもの:

- 特定セクションの除去
- ボタン追加
- 既存 UI のそばへのリンク追加

使いどころ:

- `hidePremiumSection`
- `hideOnAirAnime`
- `hideNicoAds`
- `addNicoRankButton`
- `restoreNicopediaLink`

必須ルール:

- 既存ノードの重複確認を先に行う
- 追加ノードには ID か `data-bn-*` を付ける
- remove は「自分が追加したノードだけ」に限定する

### 4.3 非同期 / メディア処理型

向いているもの:

- WebGPU / MediaStream / FFmpeg / fetch を使う機能
- フォーム自動入力や background 連携

使いどころ:

- `videoUpscaling`
- `pictureInPicture`
- `videoScreenshot`
- `videoDownload`
- `allegationAssist`
- `restoreNicopediaLink`

必須ルール:

- 失敗を局所化する
- 要素未取得は例外で全体停止させず早期 return する
- observer / interval / frame callback を cleanup できるようにする

## 5. セレクタ設計の指針

### 5.1 優先順位

1. `aria-label` や `data-name` などの意味的属性
2. URL / text / コンテナ構造
3. class 名
4. ハッシュ化 class 名のみ

### 5.2 class 名に頼るときの姿勢

`video_top` のようにハッシュ class に触る必要がある場合は:

- 近くに **より安定したアンカー**（例: ランキングリンクの href）を置く
- class 名は「見た目同期」のためだけに使う
- tests と live-site 確認メモを必ず残す

### 5.3 watch ページの重要セレクタ

現状よく使うもの:

- `.grid-area_\\[player\\]`
- `.grid-area_\\[bottom\\]`
- `.grid-area_\\[sidebar\\]`
- `[data-name="comment"] canvas`
- `[data-name="supporter-content"] canvas`
- `button[aria-label="全画面表示する"]`

これらが変わると watch 系機能の影響範囲が広いので、変更時は architecture / development docs も更新してください。

## 6. Idempotency / Cleanup の実装ルール

### 6.1 `apply(true)` 側

確認項目:

- 既存ボタン / コンテナ / marker がないか
- observer が既に起動していないか
- 同じ listener を再登録しないか

### 6.2 `apply(false)` 側

確認項目:

- 追加 DOM が全部消えるか
- style / class が元に戻るか
- observer / timer / frame callback / MediaStream が止まるか

### 6.3 MutationObserver を使うとき

- observe 対象は必要最小限にする
- callback 内では即再帰しないよう注意する
- 自分が追加したノード変更を無視できるなら無視する

## 7. Background 連携を追加するとき

対象例:

- CORS 回避 fetch
- 複数 content script で共有したい通信

手順:

1. `src/background/index.ts` に message contract を追加
2. content script 側から `chrome.runtime.sendMessage` する
3. 返却 shape を docs に書く
4. 失敗時の fallback を決める

例:

- `restoreNicopediaLink` は `exists: false` を fail-safe とする

## 8. Popup 編集系 UI を追加するとき

既に template editor があるので、次の考え方を踏襲できます。

- 一覧表示 + overlay form
- `currentSettings` をローカル state として編集
- 最後に `saveSettings()` で一括保存
- 成功 / 失敗は `showStatus()` でユーザーへ返す

追加時の注意:

- 編集中 state を明示変数で持つ
- キャンセル時の巻き戻しを UI 上で分かりやすくする
- `textContent` ベースで安全に描画する（HTML 注入しない）

## 9. videoDownload を触るときの特記事項

`videoDownload` は他機能より変更コストが高いです。

### 9.1 影響箇所

- `stream.ts`: master / variant playlist の検出と選定
- `fetcher.ts`: media playlist 解析と segment fetch
- `muxer.ts`: FFmpeg 仮想 FS と mux
- `ui.ts`: ボタン配置
- `scripts/post-build.mjs`: FFmpeg script 注入
- `public/ffmpeg/*`: ランタイム資産

### 9.2 変更時の最低確認

- playlist URL を取得できるか
- audio / video 両方の stream が取れるか
- `dist/manifest.json` の先頭 JS が壊れていないか
- 実ブラウザで mp4 が保存できるか

## 10. テスト設計ガイド

### 10.1 最低限書くべきもの

1. `enabled=true` の期待動作
2. `enabled=false` の cleanup
3. 同じ `apply(true)` を複数回呼んでも重複しないこと
4. 対象ページ以外では何もしないこと

### 10.2 追加すると強いもの

- 実ページに近い DOM fixture
- class 変更や DOM 再生成に対する再適用
- 失敗系（要素欠落・fetch 失敗・API 不可）

### 10.3 手動検証が必要な領域

- WebGPU
- PiP
- MediaStream
- FFmpeg 実行
- fullscreen の見た目

## 11. 変更前セルフチェック

```bash
npm run lint:strict
npx tsc --noEmit
npm run test
npm run build
```

その後に確認すること:

- Popup のトグル / 保存
- 変更対象ページでの手動 smoke
- docs 同期

## 12. よくある実装ミス

1. `settings.ts` だけ更新して Popup 追加を忘れる
2. Popup 追加だけして Content Script で適用していない
3. `apply(false)` の cleanup が不完全
4. marker なしで DOM を追加する
5. fullscreen や SPA 遷移を考慮しない
6. FFmpeg 変更で `post-build` を見落とす
7. docs を更新せず「コードを読めば分かる」で終わらせる
