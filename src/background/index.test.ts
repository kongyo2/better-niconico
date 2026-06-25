/**
 * Tests for src/background/index.ts
 *
 * index.ts を import すると副作用で各リスナーがモック chrome に登録される。
 * 登録された onMessage ハンドラを取り出し、CHECK_NICOPEDIA_ARTICLE の応答を検証する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../test/setup';
import { __resetNicopediaCheckState } from './nicopediaCheck';
import './index';

// import 時に登録された onMessage ハンドラを保持（beforeEach の clearAllMocks 前に取得）
type MessageHandler = (
  message: { type?: string; tagName?: unknown },
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean;
const messageHandler = vi.mocked(chrome.runtime.onMessage.addListener).mock
  .calls[0][0] as unknown as MessageHandler;

function res(status: number, text = ''): Partial<Response> {
  return { status, ok: status >= 200 && status < 300, text: () => Promise.resolve(text) };
}

function flush(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  resetChromeMocks();
  __resetNicopediaCheckState();
  vi.stubGlobal('fetch', vi.fn());
});

describe('background/index', () => {
  describe('リスナー登録', () => {
    it('onInstalled / onUpdated / onMessage が登録される', () => {
      expect(chrome.runtime.onInstalled.addListener).toBeDefined();
      expect(chrome.tabs.onUpdated.addListener).toBeDefined();
      expect(chrome.runtime.onMessage.addListener).toBeDefined();
      expect(typeof messageHandler).toBe('function');
    });
  });

  describe('CHECK_NICOPEDIA_ARTICLE ハンドラ', () => {
    it('存在する記事は { exists: true } を返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200)));
      const sendResponse = vi.fn();

      const ret = messageHandler(
        { type: 'CHECK_NICOPEDIA_ARTICLE', tagName: 'VOCALOID' },
        {},
        sendResponse,
      );

      expect(ret).toBe(true); // 非同期応答のため true
      await flush();
      expect(sendResponse).toHaveBeenCalledWith({ exists: true });
    });

    it('存在しない記事(404)は { exists: false } を返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(404)));
      const sendResponse = vi.fn();

      messageHandler({ type: 'CHECK_NICOPEDIA_ARTICLE', tagName: 'nonexistent' }, {}, sendResponse);
      await flush();

      expect(sendResponse).toHaveBeenCalledWith({ exists: false });
    });

    it('通信エラーは { exists: false, error: true } を返す（非存在と区別）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
      const sendResponse = vi.fn();

      messageHandler({ type: 'CHECK_NICOPEDIA_ARTICLE', tagName: 'x' }, {}, sendResponse);
      await flush();

      expect(sendResponse).toHaveBeenCalledWith({ exists: false, error: true });
    });

    it('5xx も error 扱い（誤って非存在にしない）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(503)));
      const sendResponse = vi.fn();

      messageHandler({ type: 'CHECK_NICOPEDIA_ARTICLE', tagName: 'x' }, {}, sendResponse);
      await flush();

      expect(sendResponse).toHaveBeenCalledWith({ exists: false, error: true });
    });

    it('tagName が無ければ問い合わせず error を返す', async () => {
      const fetchFn = vi.fn();
      vi.stubGlobal('fetch', fetchFn);
      const sendResponse = vi.fn();

      const ret = messageHandler({ type: 'CHECK_NICOPEDIA_ARTICLE' }, {}, sendResponse);
      await flush();

      expect(ret).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({ exists: false, error: true });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('対象外メッセージには false を返す', () => {
      const sendResponse = vi.fn();
      const ret = messageHandler({ type: 'OTHER' }, {}, sendResponse);
      expect(ret).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });
});
