# 機能仕様

このドキュメントは `src/content/features/` の現行コードを、**ユーザー機能・保守ポイント・相互作用** の観点で整理したものです。
実装順序に沿って説明します。

## 1. 機能一覧

| 適用順 | 機能 | 設定キー | Popup カテゴリ | 既定値 | 主対象ページ |
| --- | --- | --- | --- | --- | --- |
| 1 | プレミアム誘導を非表示 | `hidePremiumSection` | UI | `true` | `/video_top` |
| 2 | TV放送中アニメを非表示 | `hideOnAirAnime` | UI | `true` | `/video_top` |
| 3 | クラシックレイアウト復元 | `restoreClassicVideoLayout` | 動画 | `false` | `/watch/*` |
| 4 | 動画アップスケーリング | `enableVideoUpscaling` | 動画 | `false` | `/watch/*` |
| 5 | ニコランボタン追加 | `showNicoRankButton` | UI | `true` | `/video_top` |
| 6 | プロフィールアイコン四角化 | `squareProfileIcons` | UI | `false` | 複数 nicovideo サービス |
| 7 | サポーターボタン非表示 | `hideSupporterButton` | UI | `false` | 主に `/watch/*` |
| 8 | ニコニ広告セクション非表示 | `hideNicoAds` | UI | `false` | 主に `/watch/*` |
| 9 | Picture-in-Picture | `enablePictureInPicture` | 動画 | `false` | `/watch/*` |
| 10 | スクリーンショット | `enableVideoScreenshot` | 動画 | `false` | `/watch/*` |
| 11 | 通報フォーム入力補助 | `enableAllegationAssist` | システム | `false` | `garage.nicovideo.jp/allegation/*` |
| 12 | シネマティックライティング | `enableCinematicLighting` | 動画 | `false` | `/watch/*` |
| 13 | 動画ダウンロード | `enableVideoDownload` | 動画 | `false` | `/watch/*` |
| 14 | 大百科リンク復元 | `restoreNicopediaLink` | UI | `false` | `/watch/*` |

補足:

- `allegationTemplates` は補助設定であり、独立トグルではありません。
- `squareProfileIcons` は `www.nicovideo.jp` 以外のニコニコ系サービスにも CSS を効かせます。

## 2. 共通仕様

### 2.1 `apply(enabled)` 契約

各機能は `apply(enabled)` を公開し、Content Script から何度でも呼ばれる前提です。

### 2.2 冪等性ルール

必須要件:

1. 既に追加済みの DOM を二重生成しない
2. 同じイベントリスナを重複登録しない
3. 無効化時に **自分が追加したものだけ** を消す
4. DOM 再生成後に再適用されても破綻しない

### 2.3 マーカー規約

- 追加 DOM や処理済み要素には `data-bn-*` を使う
- 例: `data-bn-pip-button`, `data-bn-nico-rank-button`, `data-bn-nicopedia-processed`

### 2.4 ページガード

多くの機能はページ先頭で対象判定して早期 return します。

- watch 系: `window.location.pathname.startsWith('/watch/')`
- video_top 系: `/video_top` 判定
- allegation 系: `hostname === 'garage.nicovideo.jp'` かつ `pathname.includes('/allegation/')`

## 3. 機能詳細

### 3.1 プレミアム誘導を非表示

- 実装: `src/content/features/hidePremiumSection.ts`
- 対象: `/video_top`
- 起点セレクタ: `.TagPushVideosContainer`
- 非表示対象: `closest('.BaseLayout-block')`
- マーカー: `data-bn-premium-hidden`

#### 動作

- ブロック本文に `プレミアム` または `見放題` を含むときのみ非表示
- 無効化時は `display` を戻し、マーカーを外す

#### 意図

- class 名一致だけで消さず、本文チェックで誤爆を減らす

#### リスク

- 文言が大きく変わると検知漏れする

### 3.2 TV放送中アニメを非表示

- 実装: `src/content/features/hideOnAirAnime.ts`
- 対象: `/video_top`
- 起点セレクタ: `.OnTvAnimeVideosContainer`
- 非表示対象: `closest('.BaseLayout-block')`
- マーカー: `data-bn-anime-hidden`

#### 動作

- 本文に `TV放送中` または `アニメ` を含む場合のみ非表示
- 無効化時は元の `display` に戻す

#### リスク

- 一時的プレースホルダや SSR テンプレート断片が混ざるページでは本文がノイジーになりうる

### 3.3 クラシックレイアウト復元

- 実装: `src/content/features/restoreClassicVideoLayout.ts`
- 対象: `/watch/*`
- 主要セレクタ:
  - `.grid-area_\\[player\\]`
  - `.grid-area_\\[bottom\\]`
  - `.grid-area_\\[sidebar\\]`
- 主要マーカー / 要素:
  - `data-bn-layout="classic|default"`
  - `#bn-bottom-sections`
  - `data-bn-bottom-container`

#### 有効時

- `動画の詳細情報` セクション以降を専用コンテナへ退避・並べ替え
- 親グリッドから一部 Tailwind 由来 class を外し、`gridTemplateAreas` を上書き
- サイドバーに sticky / maxHeight / overflowY を設定

#### 無効時

- 退避した要素を `.grid-area_[bottom]` へ戻す
- 追加コンテナ削除
- インラインスタイルとレイアウトマーカーを解除

#### 全画面時

- `fullscreenchange` で一時的にデフォルトレイアウトへ戻す
- 全画面終了後、設定 ON なら再適用

#### 相互作用

- player / bottom / sidebar の相対位置を変えるので、watch 系機能の土台を最も大きく触る
- 全画面考慮漏れがあると崩れやすい

### 3.4 動画アップスケーリング

- 実装: `src/content/features/videoUpscaling.ts`
- 依存: `anime4k-webgpu`
- 対象: `/watch/*`
- 生成要素:
  - `#bn-upscaled-canvas`
  - `data-bn-canvas`
- 動画マーカー:
  - `data-bn-upscaling="active|inactive"`

#### 動作

- player 領域内の `video` から **広告動画を除いた有効動画** を選ぶ
- `navigator.gpu` / `requestAdapter()` で WebGPU 可否を一度だけ判定しキャッシュ
- Anime4K `ModeA` を使って 2 倍内部解像度で render
- 元動画は `display: none`、Canvas を表示

#### 再適用・終了

- `MutationObserver` で `video` 追加や `src` 更新を監視
- 無効化時は canvas を除去し、元動画の表示を戻す
- 全画面中は停止、復帰後に再初期化

#### 相互作用

- `pictureInPicture` は存在すればこの canvas を合成元として優先使用
- `videoScreenshot` はこの canvas を使わず元動画を撮る

#### 手動確認が必要な理由

- WebGPU / requestVideoFrameCallback / 実動画が必要なため、単体テストだけでは保証しづらい

### 3.5 ニコランボタン追加

- 実装: `src/content/features/addNicoRankButton.ts`
- 対象: `/video_top`
- 追加先: ランキングリンク直後
- 主要セレクタ:
  - `.simplebar-content`
  - `a.css-1i9dz1a[href*="/ranking?ref=video_sidemenu"]`
- マーカー:
  - `data-bn-nico-rank-button`
  - `data-bn-nico-rank-container`
- 外部リンク先: `https://nico-rank.com/`

#### 動作

- 既存ランキング項目の近くに「ニコラン」リンクを追加
- 折りたたみ / 展開で異なる class を再現する
- サイドバー class 変化を `MutationObserver` で監視し、既存ボタンの class を同期

#### ライブ確認（2026-04-15）

- 折りたたみ状態の `.css-1i3qj3a` / `.css-54sd46` / `.css-ium6yj` は確認済み
- 展開状態 `.css-gzpr6t` はその時点では未確認

### 3.6 プロフィールアイコン四角化

- 実装: `src/content/features/squareProfileIcons.ts`
- CSS 本体: `src/content/index.css`
- 動作: `body.bn-square-icons` を付与 / 削除

#### 特徴

- `www.nicovideo.jp` だけでなく、静画・生放送・ニコニ立体など複数サービスのセレクタを同居させている
- 一部は `src` / `data-src` / `srcset` でアイコン画像 URL を直接判定する

#### リスク

- CSS セレクタ群が広範囲なので、見た目回帰の影響範囲が広い

### 3.7 サポーターボタン非表示

- 実装: `src/content/features/hideSupporterButton.ts`
- CSS 本体: `src/content/index.css`
- 動作: `body.bn-hide-supporter` を付与 / 削除

#### 非表示対象

- `a[href*='creator-support.nicovideo.jp']`
- `.NC-CreatorSupportAccepting`
- `.CreatorSupportAppealContainer`

#### 補足

- 旧 UI と新 UI の両方を CSS 側で面倒を見る後方互換型の実装

### 3.8 ニコニ広告セクション非表示

- 実装: `src/content/features/hideNicoAds.ts`
- 主対象: `/watch/*`
- 探索方法: `h1` を総当たりして `ニコニ広告` を含む見出しの `closest('section')`
- マーカー: `data-bn-nicoad-hidden`

#### 動作

- 見出しテキストベースで対象 section を見つけて `display: none`
- 無効化時は元に戻す

#### 特徴

- class 名ではなく見出し文言に寄せているため、レイアウト変更には比較的強い
- ただし文言変更には弱い

### 3.9 Picture-in-Picture

- 実装: `src/content/features/pictureInPicture.ts`
- 対象: `/watch/*`
- 主要要素:
  - `#bn-pip-button`
  - `#bn-pip-canvas`
  - `#bn-pip-video`
- 主要マーカー:
  - `data-bn-pip-button`
  - `data-bn-pip-canvas`
  - `data-bn-pip-video`

#### UI 配置

- `button[aria-label="全画面表示する"]` の前にボタンを追加

#### 合成対象

1. メイン映像（存在すれば `#bn-upscaled-canvas` を優先）
2. サポーター canvas（存在時のみ）
3. コメント canvas

#### 実装上の要点

- `requestVideoFrameCallback` 優先、なければ `requestAnimationFrame`
- `canvas.captureStream(0)` + `requestFrame()` で PiP 用フレーム供給
- 開始時に元動画 / コメント canvas を `visibility: hidden`
- 停止時に表示と MediaStream を復元
- コメントレイヤー再生成時は再初期化

#### 手動確認が必要な理由

- PiP API、MediaStream、動画フレーム同期は実ブラウザ依存が強い

### 3.10 スクリーンショット

- 実装: `src/content/features/videoScreenshot.ts`
- 対象: `/watch/*`
- 追加ボタン: `#bn-screenshot-button`
- マーカー: `data-bn-screenshot-button`

#### 動作

- 全画面ボタン前にカメラボタンを追加
- 現在フレーム + サポーター canvas + コメント canvas を 1 枚の canvas に合成
- `toBlob()` で PNG 化してダウンロード

#### 保存仕様

- 形式: PNG
- ファイル名: `niconico_{videoId}_{HH-MM-SS}.png`

#### 相互作用

- PiP と違い、アップスケール canvas を直接撮影しない
- そのため「見た目上アップスケーリングしていても、保存画像は元動画ベース」という差分がある

### 3.11 通報フォーム入力補助

- 実装: `src/content/features/allegationAssist.ts`
- 対象:
  - `hostname === 'garage.nicovideo.jp'`
  - `pathname.includes('/allegation/')`
- 追加 UI:
  - `data-bn-allegation-container`
  - `data-bn-allegation-dropdown`

#### フォーム対象

- `select[name="reason_id"]`
- `input[type="radio"][name="content_type"]`
- `textarea[name="comment"]`

#### 動作

- 設定からテンプレート一覧を読み込む
- 違反項目 select の手前にテンプレート選択 UI を挿入
- 選択したテンプレートの理由、種別、コメントをフォームへ反映

#### Popup 側との関係

- テンプレートの追加 / 編集 / 削除は Popup の「定型文を管理」で行う
- Content Script 側は常に保存済みテンプレートを読むだけ

### 3.12 シネマティックライティング

- 実装: `src/content/features/cinematicLighting.ts`
- 対象: `/watch/*`
- 生成要素:
  - `#bn-ambient-outer`
  - `#bn-ambient-container`
  - `#bn-ambient-inner`
  - `#bn-ambient-corners` + 4 corner 要素
- CSS 本体: `src/content/index.css` の `.bn-ambient-*`

#### 動作

- 低解像度サンプリング canvas（16x16）から動画フレームの色分布を読む
- 支配色、辺色、四隅色を計算し、プレイヤー周囲の glow に反映
- 色変化が小さいときは更新をスキップして負荷を抑える

#### ランタイム制御

- `requestVideoFrameCallback` 優先
- `fullscreenchange` を監視
- `popstate` と URL 監視（500ms 間隔）で SPA 遷移を追う
- watch ページ離脱時に `forceCleanup()` 実行

#### リスク

- 監視点が多いので cleanup 漏れがあると残留しやすい

### 3.13 動画ダウンロード

- 実装:
  - `videoDownload/index.ts`
  - `stream.ts`
  - `fetcher.ts`
  - `muxer.ts`
  - `ui.ts`
  - `saver.ts`
- 対象: `/watch/*`
- 追加ボタン: `#bn-download-button`
- マーカー: `data-bn-download-button`

#### パイプライン

1. `stream.ts` が Performance API から master playlist URL を探す
2. 見つからなければ DOM / system message から fallback 探索
3. master playlist を fetch して video/audio variant を決定
4. media playlist を fetch し、segment URL をローカルファイル名に置換
5. 複数 segment を並列ダウンロード
6. `muxer.ts` が FFmpeg 仮想 FS に segment + m3u8 を書き込み
7. `master.m3u8` を入力に `ffmpeg -c copy` で MP4 を生成
8. `saver.ts` が Blob 保存

#### FFmpeg 連携の前提

- `public/ffmpeg/ffmpeg-core2.js` が content script 先頭で読まれていること
- `scripts/post-build.mjs` が `dist/manifest.json` を書き換えること

#### エラーになりやすい箇所

- Performance API に `.m3u8` が残っていない
- HLS 形式や URL 断片が変わった
- segment fetch の credentials / CORS 条件が変わった
- FFmpeg script が注入されていない

#### 手動確認が必須な理由

- 単体テストで playlist / fetch / UI はある程度守れるが、実際の FFmpeg 実行はブラウザ環境依存

### 3.14 大百科リンク復元

- 実装: `src/content/features/restoreNicopediaLink.ts`
- 対象: `/watch/*`
- 対象エリア: `.grid-area_\\[bottom\\]` 内のタグコンテナ
- マーカー:
  - 処理済みタグ: `data-bn-nicopedia-processed`
  - 追加リンク: `data-bn-nicopedia-link`

#### 動作

- 動画情報エリア内の `a[href*="/tag/"]` を列挙
- 各タグ名を background へ渡し、大百科記事の有無を確認
- 記事が存在するタグだけに「百」アイコンリンクを内包追加
- セッション中は `Map<string, boolean>` で存在確認をキャッシュ

#### ライブ確認（2026-04-15）

- `/watch/sm9` のタグ群には `dic.nicovideo.jp` リンクが存在しなかった
- つまり復元機能は現行ページでも有効

#### リスク

- 大百科記事の存在判定が background 側の文言依存
- タグコンテナ探索が `flex-wrap_wrap` を含む div 前提

## 4. 機能間の相互作用メモ

| 組み合わせ | 関係 |
| --- | --- |
| クラシックレイアウト × watch 系機能 | player / bottom / sidebar の見た目土台を変える。全画面復帰が重要 |
| アップスケーリング × PiP | PiP は `#bn-upscaled-canvas` を優先使用 |
| アップスケーリング × スクリーンショット | スクショは元動画ベース。見た目との差が出る可能性あり |
| PiP × コメント再生成 | コメント canvas が差し替わると再初期化が必要 |
| 動画ダウンロード × ビルド設定 | `post-build` の manifest 書き換えが崩れると機能しない |
| 大百科リンク × Background | content script 単独では完結しない。background fetch 契約が前提 |

## 5. QA で優先して見るべき機能

1. `restoreClassicVideoLayout`
2. `videoUpscaling`
3. `pictureInPicture`
4. `videoDownload`
5. `restoreNicopediaLink`
6. `addNicoRankButton`

理由:

- DOM 変更量が大きい
- 実ブラウザ API 依存が強い
- 外部サイト側の変更に弱い
