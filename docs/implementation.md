# 実装ガイド

このドキュメントは、`better-niconico` に新規機能や改修を入れるときの実装手順を、現行コード構成に合わせて整理したものです。

## 1. 目的

1. 実装の責務分離を保つ
2. `apply(enabled)` の冪等性を保つ
3. 設定スキーマとUIを常に同期させる
4. 探索 → Red → Green → Refactor の順で安全に変更する

## 2. 新機能追加フロー（標準）

## 2.1 探索

1. 似た機能を `src/content/features/` から1つ選ぶ
2. 対象ページのDOMを確認する
3. 既存テスト（`*.test.ts`）の粒度を確認する

最初に決めること:

- 対象ページ（`/watch/*`, `/video_top`, `garage.nicovideo.jp/allegation/*` など）
- 実装方式（CSSクラス付与型 / DOM挿入型 / 非同期処理型）
- 有効時・無効時の明確な対

## 2.2 Red

1. まず失敗するテストを書く
2. 成功条件は1つに絞る
3. 既存機能の回帰を同時に確認する

## 2.3 Green

1. 最小コードでテストを通す
2. 例外時も機能全体を止めない
3. 追加要素には `data-bn-*` マーカーを付ける

## 2.4 Refactor

1. 命名を揃える
2. 分岐を整理する
3. 不要なログや重複処理を削る
4. 冪等性テストを再実行する

## 3. 追加時に必ず更新する箇所

## 3.1 機能モジュールを作成

- 追加先: `src/content/features/<featureName>.ts`
- 公開関数: `export function apply(enabled: boolean): void`（または `Promise<void>`）

基本形:

```ts
export function apply(enabled: boolean): void {
  if (enabled) {
    enableFeature();
  } else {
    disableFeature();
  }
}
```

## 3.2 設定スキーマへ追加

更新先: `src/types/settings.ts`

1. `BetterNiconicoSettingsSchema` に項目追加（`z.boolean().default(...)`）
2. `DEFAULT_SETTINGS` へ同キーを追加
3. 必要なら関連型（テンプレート型など）を追加

注意:

- `.default()` は必須（後方互換のため）
- `z.infer` で型を引いているため、型定義は手書きしない

## 3.3 Content Scriptへ接続

更新先: `src/content/index.ts`

1. 機能モジュールを `import` する
2. `applySettings()` で `settings.<yourKey>` を渡して呼ぶ

## 3.4 Popupへ表示

更新先: `src/popup/popup.ts`

- `SETTINGS_CONFIG` に1エントリ追加
  - `id`: 設定キー（`keyof BetterNiconicoSettings`）
  - `label`: 表示名
  - `description`: 説明
  - `category`: `video | ui | system`
  - `icon`（任意）

通報テンプレート管理のような追加UIが必要な場合:

- `actionButton` を使って専用ビューを開く

## 3.5 ドキュメントを更新

- `docs/features.md`
- `docs/architecture.md`（必要に応じて）

## 4. 実装パターン

## 4.1 CSSクラス付与型（推奨）

例: `squareProfileIcons`, `hideSupporterButton`

- JSは `body` へのクラス付与/削除だけにする
- 実際の見た目は `src/content/index.css` に寄せる

利点:

1. 高速
2. DOM再描画時も追従しやすい
3. `apply()` の冪等性を保ちやすい

## 4.2 セクション非表示型

例: `hidePremiumSection`, `hideOnAirAnime`, `hideNicoAds`

- 直接要素ではなく、セクション単位（`closest(...)`）で扱う
- 本文テキスト検証で誤爆を防ぐ
- `data-bn-*` マーカーで再処理抑制

## 4.3 DOM挿入型

例: `addNicoRankButton`, `restoreNicopediaLink`

- 挿入済み判定を先に行う
- 追加要素に専用ID/マーカーを付ける
- 無効化時は「追加したものだけ」削除する

## 4.4 非同期処理型

例: `videoUpscaling`, `pictureInPicture`, `videoDownload`, `allegationAssist`

- `Result` / `ResultAsync` で失敗を局所化
- 前提要素がないときは例外でなく早期return
- 再試行/再初期化が必要なら状態変数を明示管理

## 5. watchページ実装の注意点

## 5.1 セレクタエスケープ

`querySelector` で Tailwind由来の `[]` を含むクラスを使う場合はエスケープする。

```ts
document.querySelector('.grid-area_\\[player\\]');
```

## 5.2 全画面イベント

- `MutationObserver` だけでは不十分
- `fullscreenchange` を基準に有効/無効を切り替える
- 全画面中に無理にDOM構造を変えない

## 5.3 動画要素の選別

watchページには複数 `video` が存在するため、以下を除外する。

1. 広告コンテナ内動画（`#nv_watch_VideoAdContainer`）
2. `src` が空の要素
3. `videoWidth` / `videoHeight` が0の要素

## 6. MutationObserver とイベントの使い分け

Observerを使うケース:

1. ノード追加/削除の検知
2. SPAで差し替えられる領域の再適用

イベントを使うケース:

1. `fullscreenchange`
2. `popstate`
3. UIボタンクリックやユーザー操作

原則:

- 状態遷移はイベント
- DOM断片の再出現はObserver

## 7. 冪等性チェックリスト

`apply(true)` 側:

1. 既に有効状態なら何もしない
2. 既存マーカー/既存要素を先に確認
3. 二重 `addEventListener` を避ける

`apply(false)` 側:

1. 追加要素の確実な削除
2. スタイル・クラスの復元
3. Observer / ループ / Timer の停止

## 8. テスト追加ガイド

## 8.1 最低限のテストセット

1. `enabled=true` で期待動作
2. `enabled=false` で復元
3. 同じ `apply(true)` を連続実行しても重複しない
4. ページ条件不一致で何もしない

## 8.2 追加すると良いテスト

1. 実DOMに近い構造でのテスト
2. 競合しやすい機能との併用
3. 失敗系（要素未存在・fetch失敗・API失敗）

## 9. 変更前セルフチェック

1. `npm run lint:strict`
2. `npm run test`
3. 必要なら `npm run build`
4. docs更新（仕様の同期）

## 10. 実装上の禁止事項

1. `settings.ts` のキー追加漏れ
2. Popup設定とスキーマの不一致
3. マーカーなしDOM挿入
4. 無効化時クリーンアップ未実装
5. 全画面遷移を考慮しない watch機能追加
