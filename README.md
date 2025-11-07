# Better Niconico

ニコニコ動画のレイアウトと細部を改善する Chrome 拡張機能です。

[Calm Twitter](https://github.com/yusukesaitoh/calm-twitter) や [Refined GitHub](https://github.com/refined-github/refined-github) のように、ユーザーが各機能を個別にオン/オフできるカスタマイズ可能な拡張機能として設計されています。

## 機能

### 実装済み

- **プレミアム会員セクションの非表示**: 「プレミアム会員なら動画が見放題！」セクションを非表示にできます
  - デフォルトでオン
  - 設定画面から簡単にオン/オフ可能

### 今後追加予定の機能

- サムネイル表示のカスタマイズ
- レイアウトの最適化
- その他のUI改善

## インストール方法

### 開発版のインストール

1. このリポジトリをクローン
   ```bash
   git clone <repository-url>
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

### 開発モード

開発中はホットリロード付きの開発モードを使用できます：

```bash
npm run dev
```

## 使い方

1. 拡張機能アイコンをクリックして設定画面を開く
2. 各機能のトグルスイッチで好みの設定にカスタマイズ
3. 設定は自動的に保存され、即座に反映されます

## 技術スタック

- **TypeScript**: 型安全な開発
- **Vite**: 高速ビルド & ホットリロード
- **Chrome Extension Manifest V3**: 最新の拡張機能API
- **@crxjs/vite-plugin**: Vite向けChrome拡張機能プラグイン

## 開発

```bash
# 開発モード（ホットリロード）
npm run dev

# プロダクションビルド
npm run build

# Linting
npm run lint
npm run lint:fix

# アイコン生成
npm run generate-icons
```

## プロジェクト構造

```
better-niconico/
├── src/
│   ├── background/       # バックグラウンドサービスワーカー
│   ├── content/          # コンテンツスクリプト（ページに注入）
│   ├── popup/            # 拡張機能のポップアップUI
│   └── types/            # TypeScript型定義
├── public/
│   └── icons/            # 拡張機能のアイコン
├── manifest.json         # 拡張機能マニフェスト
└── vite.config.ts        # Vite設定
```

## ライセンス

MIT

## 貢献

プルリクエストを歓迎します！バグ報告や機能要望は Issue でお願いします。
