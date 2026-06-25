/**
 * Tests for src/background/nicopediaCheck.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  classifyStatus,
  fetchArticleExistence,
  resolveArticleExistence,
  __resetNicopediaCheckState,
} from './nicopediaCheck';

/** Response 風オブジェクトを生成 */
function res(status: number, text = ''): Partial<Response> {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(text),
  };
}

function flush(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  __resetNicopediaCheckState();
  vi.unstubAllGlobals();
});

describe('classifyStatus', () => {
  it.each([
    [200, 'exists'],
    [204, 'exists'],
    [299, 'exists'],
    [404, 'missing'],
    [410, 'missing'],
    [301, 'error'],
    [403, 'error'],
    [429, 'error'],
    [500, 'error'],
    [503, 'error'],
  ])('status %i => %s', (status, expected) => {
    expect(classifyStatus(status as number)).toBe(expected);
  });
});

describe('fetchArticleExistence', () => {
  it('HEAD が 200 なら exists（本文は取得しない）', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal('fetch', fetchFn);

    expect(await fetchArticleExistence('VOCALOID')).toBe('exists');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][1].method).toBe('HEAD');
    expect(fetchFn.mock.calls[0][1].credentials).toBe('omit');
  });

  it('HEAD が 404 なら missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(404)));
    expect(await fetchArticleExistence('nonexistent')).toBe('missing');
  });

  it('HEAD が 5xx なら error（非存在と断定しない）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(503)));
    expect(await fetchArticleExistence('x')).toBe('error');
  });

  it('ネットワークエラーは error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await fetchArticleExistence('x')).toBe('error');
  });

  it('HEAD が 405 なら GET へフォールバックして判定する', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(res(405)) // HEAD: 非対応
      .mockResolvedValueOnce(res(200, '<html>記事の本文</html>')); // GET
    vi.stubGlobal('fetch', fetchFn);

    expect(await fetchArticleExistence('y')).toBe('exists');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][1].method).toBe('HEAD');
    expect(fetchFn.mock.calls[1][1].method).toBe('GET');
  });

  it('GET フォールバックで「まだ記事が書かれていません」を含めば missing', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(res(405))
      .mockResolvedValueOnce(res(200, '<html>まだ記事が書かれていませんでした</html>'));
    vi.stubGlobal('fetch', fetchFn);

    expect(await fetchArticleExistence('z')).toBe('missing');
  });

  it('GET フォールバックで 404 なら missing', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(res(405)).mockResolvedValueOnce(res(404));
    vi.stubGlobal('fetch', fetchFn);

    expect(await fetchArticleExistence('z')).toBe('missing');
  });
});

describe('resolveArticleExistence（キャッシュ・dedup）', () => {
  it('確定結果をキャッシュし、2回目は fetch しない', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal('fetch', fetchFn);

    expect(await resolveArticleExistence('cached')).toBe('exists');
    expect(await resolveArticleExistence('cached')).toBe('exists');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('missing も同様にキャッシュする', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal('fetch', fetchFn);

    expect(await resolveArticleExistence('m')).toBe('missing');
    expect(await resolveArticleExistence('m')).toBe('missing');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('error はキャッシュせず、次回は再度 fetch する', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(res(500)).mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchFn);

    expect(await resolveArticleExistence('e')).toBe('error');
    expect(await resolveArticleExistence('e')).toBe('exists');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('同一タグへの同時問い合わせを 1 回の fetch に結合する', async () => {
    let resolveFetch: (value: Partial<Response>) => void = () => {};
    const fetchFn = vi.fn(
      () =>
        new Promise<Partial<Response>>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchFn);

    const p1 = resolveArticleExistence('dup');
    const p2 = resolveArticleExistence('dup');
    await flush(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    resolveFetch(res(200));
    expect(await p1).toBe('exists');
    expect(await p2).toBe('exists');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
