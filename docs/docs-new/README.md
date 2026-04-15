# Better Niconico ドキュメント索引

`docs/` は `better-niconico` を **理解する・直す・増やす・配布する** ための実務ドキュメント置き場です。
コードだけでは見落としやすい、DOM 依存、Chrome 拡張特有の制約、手動確認ポイントをここで補います。

## 読む順番の目安

### 初見で把握したい人
1. [architecture.md](./architecture.md)
2. [features.md](./features.md)
3. [development.md](./development.md)

### 機能追加や改修をしたい人
1. [implementation.md](./implementation.md)
2. [features.md](./features.md)
3. [development.md](./development.md)
4. [release.md](./release.md)

### 不具合調査やセレクタ崩れを追いたい人
1. [development.md](./development.md)
2. [architecture.md](./architecture.md)
3. [features.md](./features.md)

## ドキュメント一覧

| ファイル | 主な読者 | 内容 |
| --- | --- | --- |
| [architecture.md](./architecture.md) | 実装者 / レビュアー | MV3 構成、責務分離、データフロー、ビルド経路、ライブ DOM 確認結果 |
| [features.md](./features.md) | 実装者 / QA | 14 機能の仕様、対象ページ、生成 DOM、依存関係、相互作用 |
| [development.md](./development.md) | 開発者 / デバッガー | セットアップ、主要コマンド、Chrome DevTools の見方、手動確認、トラブルシュート |
| [implementation.md](./implementation.md) | 実装者 | 新機能追加・改修の標準手順、責務配置、テスト方針、ドキュメント同期ルール |
| [release.md](./release.md) | メンテナ / リリース担当 | バージョン更新、ビルド成果物、ローカル読込、Web Store 公開前後の確認 |

## 2026-04-15 時点の確認メモ

以下は **コード読解 + Chrome DevTools MCP** で確認したスナップショットです。将来変わりうるので、運用メモとして扱ってください。

| 項目 | 確認結果 | 備考 |
| --- | --- | --- |
| パッケージ版 | `1.0.14` | `package.json` / Popup バージョン表示 / Chrome Web Store で一致 |
| Chrome Web Store 更新日 | 2026年3月28日 | ストア listing 上の表示 |
| Chrome Web Store 利用者数 | 60 ユーザー | 同上。変動値なので履歴用メモ |
| `/watch/sm9` | `grid-area_[player]` / `grid-area_[bottom]` / `grid-area_[sidebar]` が存在 | watch 系機能の主要前提を満たす |
| `/watch/sm9` | `[data-name="comment"] canvas` と `[data-name="supporter-content"] canvas` が存在 | PiP / スクリーンショット / ライティング前提 |
| `/watch/sm9` | タグリンクはあるが `dic.nicovideo.jp/a/...` へのリンクは 0 件 | `restoreNicopediaLink` の追加価値を確認 |
| `/video_top` | `.simplebar-content`, `.TagPushVideosContainer`, `.OnTvAnimeVideosContainer`, `.BaseLayout-block` が存在 | サイドバー・非表示系機能の主要前提を満たす |
| `/video_top` | ランキングリンクは `a.css-1i9dz1a[href*="/ranking?ref=video_sidemenu"]` で取得可能 | `addNicoRankButton` の実装前提 |

## この docs/ を更新するタイミング

次のどれかに触れたら、対応する docs も更新してください。

- `src/types/settings.ts` の設定キーやデフォルト値
- `src/content/index.ts` の適用順序やメッセージ契約
- `src/content/features/*` のセレクタ、生成 DOM、クリーンアップ条件
- `src/popup/popup.ts` のカテゴリ、ラベル、テンプレート管理 UI
- `manifest.json` / `vite.config.ts` / `scripts/post-build.mjs` のビルド経路
- Chrome Web Store 公開手順や手動検証フロー

## ドキュメント運用ルール

1. **ライブサイトの観察結果は日付付きで書く**
   - DOM やストア情報は変わるので、必ず確認日を残します。
2. **仕様と実装を混同しない**
   - 「現行実装の説明」なのか「あるべき設計」なのかを明記します。
3. **コードの単なる言い換えで終わらせない**
   - 依存、相互作用、壊れやすい前提、手動確認ポイントも書きます。
4. **利用者向け説明より保守向け説明を優先する**
   - README に書き切れない保守情報をここで管理します。
