import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, httpApi } from './http';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function call(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('httpApi API keys', () => {
  it('lists keys with the session token', async () => {
    const keys = [{ id: '1', name: 'a', key_preview: 'qwed_live_****abcd', created_at: 'x', last_used_at: null, is_revoked: false }];
    const fetchMock = stubFetch(json(keys));
    expect(await httpApi.listKeys('tok')).toEqual(keys);
    const { url, headers } = call(fetchMock);
    expect(url).toBe('/api/auth/api-keys');
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('creates a key with a JSON body', async () => {
    const fetchMock = stubFetch(json({ id: '2', name: 'b', key: 'qwed_live_x', created_at: 'y' }));
    const res = await httpApi.createKey('tok', 'b');
    expect(res.key).toBe('qwed_live_x');
    const { init, headers } = call(fetchMock);
    expect(init.method).toBe('POST');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'b' }));
  });

  it('revokes a key whether the server answers with JSON or with no body', async () => {
    const withJson = stubFetch(json({ message: 'API key revoked successfully' }));
    await expect(httpApi.revokeKey('tok', '3')).resolves.toBeUndefined();
    expect(call(withJson).init.method).toBe('DELETE');
    expect(call(withJson).url).toBe('/api/auth/api-keys/3');

    stubFetch(new Response(null, { status: 204 }));
    await expect(httpApi.revokeKey('tok', '3')).resolves.toBeUndefined();
  });
});

describe('request errors', () => {
  it('turns a 2xx that is not JSON into a routing hint', async () => {
    stubFetch(new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    await expect(httpApi.listKeys('tok')).rejects.toMatchObject({ status: 200, message: expect.stringMatching(/\/api points at the QWED server/) });
  });

  it('carries the server detail and Retry-After', async () => {
    stubFetch(json({ detail: 'Too many requests' }, 429, { 'Retry-After': '30' }));
    const err = await httpApi.listKeys('tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, message: 'Too many requests', retryAfter: '30' });
  });

  it('falls back to the status text when the error is not JSON', async () => {
    stubFetch(new Response('nope', { status: 502, statusText: 'Bad Gateway' }));
    await expect(httpApi.listKeys('tok')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });

  it('reports an unreachable server as status 0', async () => {
    stubFetch(new TypeError('fetch failed'));
    await expect(httpApi.listKeys('tok')).rejects.toMatchObject({ status: 0 });
  });
});
