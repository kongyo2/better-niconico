# Better Niconico

ニコニコ動画のレイアウトと細部を改善する Chrome 拡張機能です。(開発中)

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/kongyo2/better-niconico)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/kongyo2/better-niconico)

[![CI](https://github.com/kongyo2/better-niconico/actions/workflows/ci.yml/badge.svg)](https://github.com/kongyo2/better-niconico/actions/workflows/ci.yml) 

ユーザーが各機能を個別にオン/オフできるカスタマイズ可能な拡張機能として設計されています。

Chrome Webstore: https://chromewebstore.google.com/detail/plgkkapmiakgdndngkacndmgkehcfdgf?utm_source=item-share-cb

## インストール方法

### 開発版のインストール

1. このリポジトリをクローン
   ```bash
   git clone https://github.com/kongyo2/better-niconico
   cd better-niconico
   ```

2. 依存関係をインストール
   ```bash
   npm install
   ```

3. ビルド
   ```bash
   npm run build
   ```

4. Chrome で拡張機能を読み込む
   - Chrome で `chrome://extensions/` を開く
   - 「デベロッパーモード」を有効にする
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist` フォルダを選択

## 使い方

1. 拡張機能アイコンをクリックして設定画面を開く
2. 各機能のトグルスイッチで好みの設定にカスタマイズ
3. 設定は自動的に保存され、即座に反映されます

## 主な機能

- **プレミアム会員セクションを非表示** - 広告セクションを非表示
- **TV放送中のアニメセクションを非表示** - TVアニメセクションを非表示
- **動画情報を上部に表示** - クラシックレイアウトを復元
- **動画アップスケーリング** - Anime4K-WebGPUを使用したAI高画質化
- **サイドバーにニコランボタンを表示** - nico-rank.comへのリンクを追加
- **プロフィールアイコンを四角型に変更** - 丸型から角丸四角型に
- **サポーターボタンを非表示** - クリエイターサポートボタンを非表示
- **ニコニ広告セクションを非表示** - 動画下部の広告セクションを非表示
- **Picture-in-Picture機能** - 動画とコメントをPiP表示
- **動画スクリーンショット機能** - 現在のフレーム（コメント付き）を画像保存
- **通報フォーム入力補助** - 通報フォームへの定型文自動入力
- **シネマティックライティング** - 動画の色をプレイヤー周囲にグロー表示（アンビエントモード）
- **大百科リンクの復元** - タグの横にニコニコ大百科へのリンクを表示

## 魔改造大歓迎！（ローカルで自由にやれよ！）

（何々？開発者が気に入らない？ならフォークして自分用に魔改造しよう！ちゃんとフォークネットワークから切り離しておけよ？プルリク事故を起こしちゃ不味いので。）

このプロジェクトはOSSです。文字通り自由に使って、改変して、壊してください！インターネットは、自由な空間です。
