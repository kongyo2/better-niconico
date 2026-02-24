# 機能仕様

このドキュメントは、`src/content/features/` 配下の現行実装をそのまま仕様化したものです。

## 1. 一覧

| # | 機能名 | 設定キー | 既定値 | 主対象ページ |
|---|---|---|---|---|
| 1 | プレミアム誘導を非表示 | `hidePremiumSection` | `true` | `/video_top` |
| 2 | TV放送中アニメを非表示 | `hideOnAirAnime` | `true` | `/video_top` |
| 3 | クラシックレイアウト復元 | `restoreClassicVideoLayout` | `false` | `/watch/*` |
| 4 | 動画アップスケーリング | `enableVideoUpscaling` | `false` | `/watch/*` |
| 5 | ニコランボタン追加 | `showNicoRankButton` | `true` | `/video_top` |
| 6 | プロフィールアイコン四角化 | `squareProfileIcons` | `false` | 全体（CSS適用可能ページ） |
| 7 | サポーターボタン非表示 | `hideSupporterButton` | `false` | 主に `/watch/*` |
| 8 | ニコニ広告セクション非表示 | `hideNicoAds` | `false` | 主に `/watch/*` |
| 9 | Picture-in-Picture | `enablePictureInPicture` | `false` | `/watch/*` |
| 10 | スクリーンショット | `enableVideoScreenshot` | `false` | `/watch/*` |
| 11 | 通報フォーム入力補助 | `enableAllegationAssist` | `false` | `garage.nicovideo.jp/allegation/*` |
| 12 | シネマティックライティング | `enableCinematicLighting` | `false` | `/watch/*` |
| 13 | 動画ダウンロード | `enableVideoDownload` | `false` | `/watch/*` |
| 14 | 大百科リンク復元 | `restoreNicopediaLink` | `false` | `/watch/*` |

## 2. 共通ルール

1. 各機能は `apply(enabled: boolean)` を公開し、Content Script から一括適用されます。
2. DOM変化時に再適用される前提なので、冪等性（多重呼び出し安全）が必須です。
3. 追加DOMには `data-bn-*` マーカー属性を使い、重複挿入を防ぎます。
4. 失敗時は例外で全体停止せず、ログ出力して継続する実装が基本です。

## 3. 機能詳細

## 3.1 プレミアム誘導を非表示

- 実装: `src/content/features/hidePremiumSection.ts`
- セレクタ:
  - 起点: `.TagPushVideosContainer`
  - 非表示対象: `.closest('.BaseLayout-block')`
- マーカー: `data-bn-premium-hidden`
- 有効時:
  - `BaseLayout-block` の本文に `プレミアム` または `見放題` を含む場合のみ `display: none`
- 無効時:
  - `display` を空文字へ戻し、マーカー削除

## 3.2 TV放送中アニメを非表示

- 実装: `src/content/features/hideOnAirAnime.ts`
- セレクタ:
  - 起点: `.OnTvAnimeVideosContainer`
  - 非表示対象: `.closest('.BaseLayout-block')`
- マーカー: `data-bn-anime-hidden`
- 有効時:
  - 本文に `TV放送中` または `アニメ` を含む場合のみ `display: none`
- 無効時:
  - `display` 復帰、マーカー削除

## 3.3 クラシックレイアウト復元

- 実装: `src/content/features/restoreClassicVideoLayout.ts`
- 対象判定: `window.location.pathname.startsWith('/watch/')`
- 主要セレクタ:
  - `.grid-area_\[player\]`
  - `.grid-area_\[bottom\]`
  - `.grid-area_\[sidebar\]`
- 主要マーカー:
  - `data-bn-layout` (`classic` / `default`)
  - `#bn-bottom-sections` + `data-bn-bottom-container`
- 有効時:
  - `h1` の `動画の詳細情報` セクション以降を `#bn-bottom-sections` に移動
  - グリッド親から `grid-tr_`, `grid-template-areas_`, `grid-tc_` クラスを除去
  - `gridTemplateAreas` を `"bottom sidebar" "player sidebar" "bn-bottom sidebar"` に上書き
  - サイドバーに `maxHeight`, `overflowY`, `position: sticky` を適用
- 無効時:
  - `#bn-bottom-sections` の子を `.grid-area_[bottom]` へ戻し、コンテナ削除
  - Tailwindグリッドクラスを復元
  - インラインスタイルをリセット
- 全画面対応:
  - `fullscreenchange` を監視
  - 全画面入りでデフォルトレイアウトへ戻し、退出後は設定ONなら100ms後に再適用

## 3.4 動画アップスケーリング

- 実装: `src/content/features/videoUpscaling.ts`
- 依存: `anime4k-webgpu` (`render`, `ModeA`)
- 対象判定: `/watch/*`
- 主要仕様:
  - 広告動画（`#nv_watch_VideoAdContainer` 内）を除外
  - 有効動画は `src != ''` かつ `videoWidth/videoHeight > 0`
  - 候補中 `readyState` が最も高い動画を選択
- 生成要素:
  - `#bn-upscaled-canvas` (`data-bn-canvas`)
- 動画マーカー:
  - `data-bn-upscaling` (`active` / `inactive`)
- 有効時:
  - WebGPU可否を一度だけ判定してキャッシュ
  - Canvasを動画次要素に挿入し、内部解像度2倍で `render()` 実行
  - 元動画を `display: none`、Canvasを表示
- 無効時:
  - Canvas削除
  - 動画の `display` を復元
  - 既知動画マーカーを `inactive` 化
- 監視:
  - `MutationObserver` で `src` 変更・`video` 追加を検出し再初期化
- 全画面対応:
  - 全画面中は停止
  - 退出後、設定ONなら再適用

## 3.5 ニコランボタン追加

- 実装: `src/content/features/addNicoRankButton.ts`
- 対象判定: `/video_top`
- 主要セレクタ:
  - サイドバー: `.simplebar-content`
  - ランキングリンク: `a.css-1i9dz1a` かつ `textContent === 'ランキング'` かつ `href` に `/ranking`
- 主要クラス（実装埋め込み）:
  - 折りたたみ: `css-1i3qj3a`, `css-54sd46`, `css-ium6yj`
  - 展開: `css-gzpr6t`, `css-1xvl3dk`, `css-xzkfql`
- 主要マーカー:
  - `data-bn-nico-rank-button`
  - `data-bn-nico-rank-container`
- 有効時:
  - ランキング項目の直後に `https://nico-rank.com/` リンクを追加
  - サイドバー状態（折りたたみ/展開）に合わせてクラスを適用
  - サイドバー `class` 変化を監視し、既存ボタンのクラスを更新
- 無効時:
  - マーカー付きコンテナ/ボタンをすべて削除
  - 監視停止

## 3.6 プロフィールアイコン四角化

- 実装: `src/content/features/squareProfileIcons.ts`
- CSS実体: `src/content/index.css`
- 動作:
  - 有効: `body.bn-square-icons` を付与
  - 無効: 同クラスを削除
- 備考:
  - `index.css` で多数のサイト内セレクタ（通常動画、静画、生放送など）へ `border-radius` ルールを適用

## 3.7 サポーターボタン非表示

- 実装: `src/content/features/hideSupporterButton.ts`
- CSS実体: `src/content/index.css`
- 動作:
  - 有効: `body.bn-hide-supporter` を付与
  - 無効: 同クラスを削除
- CSS側で非表示にする対象:
  - `a[href*='creator-support.nicovideo.jp']`
  - `.NC-CreatorSupportAccepting`
  - `.CreatorSupportAppealContainer`

## 3.8 ニコニ広告セクション非表示

- 実装: `src/content/features/hideNicoAds.ts`
- 探索方法:
  - すべての `h1` を走査
  - `ニコニ広告` を含む見出しの `closest('section')` を対象化
- マーカー: `data-bn-nicoad-hidden`
- 有効時:
  - 対象 `section` を `display: none`
- 無効時:
  - `display` 復帰、マーカー削除

## 3.9 Picture-in-Picture

- 実装: `src/content/features/pictureInPicture.ts`
- 対象判定: `/watch/*`
- 主要要素:
  - ボタン: `#bn-pip-button` (`data-bn-pip-button`)
  - 合成キャンバス: `#bn-pip-canvas` (`data-bn-pip-canvas`)
  - PiP用video: `#bn-pip-video` (`data-bn-pip-video`)
- 配置:
  - `button[aria-label="全画面表示する"]` の前に挿入
- 合成内容:
  1. メイン映像（または `#bn-upscaled-canvas`）
  2. サポーターキャンバス（表示時のみ）
  3. コメントキャンバス
- ループ:
  - `requestVideoFrameCallback` 優先
  - 非対応時は `requestAnimationFrame`
- ストリーム:
  - `canvas.captureStream(0)` + `requestFrame()`（手動フレーム要求）
- 開始時:
  - 元映像（またはアップスケールCanvas）とコメントCanvasを `visibility: hidden`
- 停止時:
  - すべて復元し、MediaStream track停止
- 特記事項:
  - コメントレイヤー破棄を検知したら再初期化

## 3.10 スクリーンショット

- 実装: `src/content/features/videoScreenshot.ts`
- 対象判定: `/watch/*`
- 主要要素:
  - ボタン: `#bn-screenshot-button` (`data-bn-screenshot-button`)
- 配置:
  - `button[aria-label="全画面表示する"]` の前に挿入
- 合成内容:
  1. メイン動画
  2. サポーターキャンバス（表示時のみ）
  3. コメントキャンバス
- 保存仕様:
  - PNG
  - ファイル名: `niconico_{videoId}_{HH-MM-SS}.png`
  - `toBlob` -> 一時アンカークリックで保存
- 備考:
  - PiPと異なり、アップスケールCanvasを直接利用する実装ではありません（メイン動画ソース基準）。

## 3.11 通報フォーム入力補助

- 実装: `src/content/features/allegationAssist.ts`
- 対象判定:
  - `hostname === 'garage.nicovideo.jp'`
  - `pathname` に `/allegation/` を含む
- フォームセレクタ:
  - `select[name="reason_id"]`
  - `input[type="radio"][name="content_type"]`
  - `textarea[name="comment"]`
- 生成要素:
  - コンテナ: `data-bn-allegation-container`
  - ドロップダウン: `data-bn-allegation-dropdown`
- 有効時:
  - 設定から `allegationTemplates` を読み込み
  - `reason_id` セレクト手前にテンプレート選択UIを挿入
  - 選択で違反項目・種別・詳細コメントをフォームに適用
- 無効時:
  - 追加UIを削除

## 3.12 シネマティックライティング

- 実装: `src/content/features/cinematicLighting.ts`
- 対象判定: `/watch/*`
- コア処理:
  - `16x16` サンプリングCanvasでフレーム色を抽出
  - 彩度優先スコアで支配色/辺色/四隅色を算出
  - 変化量しきい値以下なら更新スキップ
- 生成要素:
  - `#bn-ambient-outer` (`data-bn-ambient-outer`)
  - `#bn-ambient-container` (`data-bn-ambient-container`)
  - `#bn-ambient-inner`
  - `#bn-ambient-corners` + 4コーナー要素
- CSS実体:
  - `src/content/index.css` の `.bn-ambient-*` 群
- ループ:
  - `requestVideoFrameCallback` 優先
  - フォールバックで `requestAnimationFrame`
- 全画面対応:
  - 全画面中はグロー非表示
  - 退出後に再描画
- SPA対応:
  - `popstate` と URL監視（500ms間隔）でページ遷移を検知
  - watch離脱時は `forceCleanup()` を実行

## 3.13 動画ダウンロード

- 実装:
  - `src/content/features/videoDownload/index.ts`
  - `stream.ts`, `fetcher.ts`, `muxer.ts`, `ui.ts`, `saver.ts`
- 対象判定: `/watch/*`
- UI:
  - ボタン `#bn-download-button` (`data-bn-download-button`)
  - コントロールバーの全画面ボタン付近へ挿入
- パイプライン:
  1. `getMasterUrl()`
     - `performance.getEntriesByType('resource')` 優先
     - 失敗時はDOM上のシステムメッセージ文字列から抽出
  2. `getVariantStreams()`
     - master m3u8を解析し、最高帯域video + audioを選定
  3. `downloadSegmentsForMux()`
     - media playlist中URLをローカル名へ置換
     - セグメントを並列（同時3件）取得
  4. `muxWithPlaylist()`
     - `createFFmpegCore`（`ffmpeg-core2.js`）でFFmpeg起動
     - FSにセグメント/playlistを書き込み `-c copy` でmux
  5. `saveAsFile()`
     - `{videoId}.mp4` として保存
- 依存条件:
  - `post-build` で `ffmpeg-core2.js` が content scripts に追加されること
  - `ffmpeg-core.wasm` を `chrome.runtime.getURL` で参照可能なこと

## 3.14 大百科リンク復元

- 実装: `src/content/features/restoreNicopediaLink.ts`
- 対象判定: `/watch/*`
- 対象領域限定:
  - `.grid-area_\[bottom\]` 配下
  - `div[class*="flex-wrap_wrap"]` 内タグリンクのみ
- 主要マーカー:
  - タグ処理済み: `data-bn-nicopedia-processed`
  - 追加リンク: `data-bn-nicopedia-link`
- 存在判定:
  - Backgroundへ `CHECK_NICOPEDIA_ARTICLE` を送信
  - メモリキャッシュ `Map<string, boolean>` で再問い合わせ抑制
- リンク生成:
  - `https://dic.nicovideo.jp/a/{encodedTagName}`
  - タグアンカー内部末尾に挿入
  - `bn-nicopedia-link` / `bn-nicopedia-icon` スタイルを利用
- 無効時:
  - 追加リンクを削除
  - 処理済みマーカーを除去

## 4. 機能間の依存・干渉ポイント

1. `enablePictureInPicture` と `enableVideoUpscaling`
   - PiPは `#bn-upscaled-canvas` が有効ならそれを映像ソースとして利用します。
2. `restoreClassicVideoLayout` と `enableCinematicLighting`
   - ライティング側は `data-bn-layout='classic'` を認識し、要素配置を調整します。
3. `restoreNicopediaLink`
   - 背景スクリプトのメッセージ処理が前提です。
4. `enableAllegationAssist`
   - テンプレート実データは `allegationTemplates` 依存です。

## 5. 実ページ整合確認（2026-02-24）

`/watch/sm9` と `/video_top` で、主要セレクタの存在を確認済みです。

- watch系（PiP/スクショ/アップスケール/ライティング/レイアウト）
  - `.grid-area_\[player\]`, `.grid-area_\[bottom\]`, `.grid-area_\[sidebar\]`
  - `[data-name="comment"] canvas`, `[data-name="supporter-content"] canvas`
  - `button[aria-label="全画面表示する"]`
- video_top系（プレミアム/TVアニメ/ニコラン）
  - `.simplebar-content`, `.TagPushVideosContainer`, `.OnTvAnimeVideosContainer`
  - `.BaseLayout-block`, `a[href*="/ranking?ref=video_sidemenu"]`, `.css-1i3qj3a`

以上は、現行実装で参照しているDOMと一致しています。

