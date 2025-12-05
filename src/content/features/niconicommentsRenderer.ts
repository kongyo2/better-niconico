/**
 * niconicomments を使用した高パフォーマンスコメントレンダラー
 * PiP高パフォーマンスモードで使用される
 *
 * @see https://github.com/xpadev-net/niconicomments
 *
 * 特徴:
 * - ニコニコ公式プレイヤー互換の高パフォーマンスコメント描画
 * - Canvas APIを使用した直接描画
 * - コメントアートへの対応
 */

import NiconiComments from '@xpadev-net/niconicomments';
import type { V1Thread } from '@xpadev-net/niconicomments';

// イベント名（inject/commentCapture.tsと同期）
const COMMENT_DATA_EVENT = 'bn-comment-data-captured';

// キャンバスID
const RENDERER_CANVAS_ID = 'bn-niconicomments-canvas';

// 状態管理
let niconiComments: NiconiComments | null = null;
let rendererCanvas: HTMLCanvasElement | null = null;
let isInitialized = false;
let commentData: V1Thread[] | null = null;
let eventListenerAttached = false;

// コールバック関数（PiPからの参照用）
let onCommentDataReady: ((canvas: HTMLCanvasElement) => void) | null = null;

/**
 * コメントキャプチャイベントを受信するリスナーをセットアップ
 */
function setupEventListener(): void {
  if (eventListenerAttached) {
    return;
  }

  window.addEventListener(COMMENT_DATA_EVENT, ((event: CustomEvent) => {
    const { threads } = event.detail as {
      threads: V1Thread[];
      globalComments: unknown[];
      timestamp: number;
    };

    console.log('[Better Niconico] niconicommentsRenderer: コメントデータを受信:', threads.length, 'スレッド');

    // コメントデータを保存
    commentData = threads;

    // 既にキャンバスが作成されている場合は再初期化
    if (rendererCanvas) {
      initializeNiconiComments();
    }
  }) as EventListener);

  eventListenerAttached = true;
  console.log('[Better Niconico] niconicommentsRenderer: イベントリスナーをセットアップしました');
}

/**
 * インジェクトスクリプトをページに注入
 */
function injectCaptureScript(): void {
  // 既に注入済みかチェック
  if (document.getElementById('bn-comment-capture-script')) {
    return;
  }

  // インジェクトスクリプトのコードを直接埋め込む
  // ビルド時にバンドルされないようにインラインで記述
  const scriptContent = `
(function () {
  'use strict';

  const COMMENT_API_URL = 'public.nvcomment.nicovideo.jp/v1/threads';
  const COMMENT_DATA_EVENT = 'bn-comment-data-captured';
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const [input] = args;
    let url;
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input instanceof Request) {
      url = input.url;
    } else {
      return originalFetch.apply(window, args);
    }

    if (url.includes(COMMENT_API_URL)) {
      try {
        const response = await originalFetch.apply(window, args);
        const clonedResponse = response.clone();
        clonedResponse.json().then((data) => {
          if (data && data.data && data.data.threads) {
            const event = new CustomEvent(COMMENT_DATA_EVENT, {
              detail: {
                threads: data.data.threads,
                globalComments: data.data.globalComments,
                timestamp: Date.now(),
              },
            });
            window.dispatchEvent(event);
            console.log('[Better Niconico] コメントデータをキャプチャしました');
          }
        }).catch((err) => {
          console.warn('[Better Niconico] コメントデータのパースに失敗:', err);
        });
        return response;
      } catch (error) {
        console.error('[Better Niconico] fetchエラー:', error);
        throw error;
      }
    }
    return originalFetch.apply(window, args);
  };

  console.log('[Better Niconico] コメントキャプチャスクリプトを初期化しました');
})();
`;

  const script = document.createElement('script');
  script.id = 'bn-comment-capture-script';
  script.textContent = scriptContent;
  (document.head || document.documentElement).appendChild(script);

  console.log('[Better Niconico] コメントキャプチャスクリプトを注入しました');
}

/**
 * レンダリング用キャンバスを作成
 */
function createRendererCanvas(): HTMLCanvasElement {
  // 既存のキャンバスがあれば削除
  const existingCanvas = document.getElementById(RENDERER_CANVAS_ID);
  if (existingCanvas) {
    existingCanvas.remove();
  }

  const canvas = document.createElement('canvas');
  canvas.id = RENDERER_CANVAS_ID;
  // ニコニコ動画の標準コメントサイズ（16:9）
  canvas.width = 1920;
  canvas.height = 1080;
  // 非表示（PiPの合成でのみ使用）
  canvas.style.display = 'none';

  document.body.appendChild(canvas);
  rendererCanvas = canvas;

  console.log('[Better Niconico] niconicommentsレンダリングキャンバスを作成しました');

  return canvas;
}

/**
 * NiconiCommentsインスタンスを初期化
 */
function initializeNiconiComments(): void {
  if (!rendererCanvas || !commentData) {
    console.warn('[Better Niconico] niconicommentsの初期化に必要なデータがありません');
    return;
  }

  try {
    // 既存のインスタンスがあればクリア
    if (niconiComments) {
      niconiComments.clear();
    }

    // NiconiCommentsインスタンスを作成
    niconiComments = new NiconiComments(rendererCanvas, commentData, {
      format: 'v1',
      mode: 'default',
    });

    isInitialized = true;
    console.log('[Better Niconico] niconicommentsを初期化しました');

    // コールバックがあれば呼び出す
    if (onCommentDataReady && rendererCanvas) {
      onCommentDataReady(rendererCanvas);
    }
  } catch (error) {
    console.error('[Better Niconico] niconicommentsの初期化に失敗:', error);
    isInitialized = false;
  }
}

/**
 * 指定されたvposでコメントを描画
 * @param vpos 動画の再生位置（100倍した値、例: 1秒 = 100）
 */
export function drawComments(vpos: number): void {
  if (!niconiComments || !isInitialized) {
    return;
  }

  niconiComments.drawCanvas(vpos);
}

/**
 * 現在の再生時間（秒）でコメントを描画
 * @param currentTimeSeconds 動画の現在再生時間（秒）
 */
export function drawCommentsAtTime(currentTimeSeconds: number): void {
  // vposは100倍（10ms単位）
  const vpos = Math.floor(currentTimeSeconds * 100);
  drawComments(vpos);
}

/**
 * レンダラーを初期化
 * @param callback コメントデータが準備できた時に呼ばれるコールバック
 */
export function initRenderer(callback?: (canvas: HTMLCanvasElement) => void): HTMLCanvasElement | null {
  // コールバックを保存
  if (callback) {
    onCommentDataReady = callback;
  }

  // イベントリスナーをセットアップ
  setupEventListener();

  // インジェクトスクリプトを注入
  injectCaptureScript();

  // キャンバスを作成
  const canvas = createRendererCanvas();

  // 既にコメントデータがあれば初期化
  if (commentData) {
    initializeNiconiComments();
  }

  return canvas;
}

/**
 * レンダラーをクリーンアップ
 */
export function cleanupRenderer(): void {
  // niconicommentsをクリア
  if (niconiComments) {
    niconiComments.clear();
    niconiComments = null;
  }

  // キャンバスを削除
  if (rendererCanvas) {
    rendererCanvas.remove();
    rendererCanvas = null;
  }

  // 状態をリセット
  isInitialized = false;
  onCommentDataReady = null;

  console.log('[Better Niconico] niconicommentsレンダラーをクリーンアップしました');
}

/**
 * レンダラーが初期化済みかチェック
 */
export function isRendererReady(): boolean {
  return isInitialized && niconiComments !== null && rendererCanvas !== null;
}

/**
 * レンダリングキャンバスを取得
 */
export function getRendererCanvas(): HTMLCanvasElement | null {
  return rendererCanvas;
}

/**
 * コメントデータが利用可能かチェック
 */
export function hasCommentData(): boolean {
  return commentData !== null && commentData.length > 0;
}
