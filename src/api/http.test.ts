import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, httpApi, sessionNotAccepted } from './http';

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

  it('rotates a key with the session, and reads the server’s numeric ids as strings', async () => {
    const fetchMock = stubFetch(
      json({ status: 'rotated', old_key_id: 3, new_key_id: 9, new_key_preview: 'qwed_live_****wxyz', new_key_secret: 'qwed_live_secret' }),
    );
    await expect(httpApi.rotateKey('tok', '3')).resolves.toEqual({
      oldKeyId: '3',
      newKeyId: '9',
      newKeyPreview: 'qwed_live_****wxyz',
      newKey: 'qwed_live_secret',
    });
    const { url, init, headers } = call(fetchMock);
    expect(url).toBe('/api/admin/keys/rotate?key_id=3');
    expect(init.method).toBe('POST');
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('x-api-key')).toBeNull();
  });
});

describe('httpApi members', () => {
  it('lists the organisation’s users with the session', async () => {
    const users = [{ id: '1', email: 'a@example.com', role: 'owner', is_active: true, created_at: '2026-10-01T10:00:00Z' }];
    const fetchMock = stubFetch(json(users));
    await expect(httpApi.listUsers('tok')).resolves.toEqual(users);
    const { url, headers } = call(fetchMock);
    expect(url).toBe('/api/auth/users');
    expect(headers.get('Authorization')).toBe('Bearer tok');
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
    stubFetch(new Response('nope', { status: 500, statusText: 'Internal Server Error' }));
    await expect(httpApi.listKeys('tok')).rejects.toMatchObject({
      status: 500,
      message: 'Internal Server Error',
      unreachable: false,
    });
  });

  it('reports an unreachable server as status 0', async () => {
    stubFetch(new TypeError('fetch failed'));
    await expect(httpApi.listKeys('tok')).rejects.toMatchObject({
      status: 0,
      message: 'The QWED server could not be reached.',
      unreachable: true,
    });
  });

  // #40: the dev proxy, or one in front of the server, answers for it.
  it('reports a proxy answer without a JSON body as an unreachable server, keeping its status', async () => {
    stubFetch(new Response('', { status: 502, statusText: 'Bad Gateway' }));
    await expect(httpApi.listKeys('tok')).rejects.toMatchObject({
      status: 502,
      message: 'The QWED server could not be reached. The proxy in front of it answered 502 Bad Gateway.',
      unreachable: true,
    });
    stubFetch(new Response('<html>timeout</html>', { status: 504, headers: { 'Content-Type': 'text/html' } }));
    await expect(httpApi.listKeys('tok')).rejects.toMatchObject({
      status: 504,
      message: 'The QWED server could not be reached. The proxy in front of it answered 504.',
      unreachable: true,
    });
  });

  it('keeps a 503 the server answered itself, with its JSON detail', async () => {
    stubFetch(json({ detail: 'Provider unavailable' }, 503, { 'Retry-After': '5' }));
    await expect(httpApi.listKeys('tok')).rejects.toMatchObject({
      status: 503,
      message: 'Provider unavailable',
      retryAfter: '5',
      unreachable: false,
    });
  });
});

describe('httpApi audit log', () => {
  const row = { id: '9', request_input: 'q', verification_result: '{}', engine_used: 'MATH', status: 'verified', created_at: 'x' };

  it('asks for the first page and returns its cursor', async () => {
    const fetchMock = stubFetch(json({ total: 1, logs: [row], next_before: '9' }));
    expect(await httpApi.listLogs('tok', 1)).toEqual({ logs: [row], nextBefore: '9' });
    expect(call(fetchMock).url).toBe('/api/audit/logs?limit=1');
  });

  it('passes a cursor as before', async () => {
    const fetchMock = stubFetch(json({ total: 0, logs: [], next_before: null }));
    expect(await httpApi.listLogs('tok', 200, '9')).toEqual({ logs: [], nextBefore: null });
    expect(call(fetchMock).url).toBe('/api/audit/logs?limit=200&before=9');
  });

  it('reads a server that sends no cursor as one that does not page', async () => {
    stubFetch(json({ total: 1, logs: [row] }));
    expect((await httpApi.listLogs('tok')).nextBefore).toBeUndefined();
  });
});

describe('httpApi compliance checks', () => {
  const intact = { valid: true, checks: {}, errors: [] };

  it('checks an entry with the session as a bearer token', async () => {
    const fetchMock = stubFetch(json(intact));
    await httpApi.checkEntry({ session: 'tok' }, '7');
    const { url, headers } = call(fetchMock);
    expect(url).toBe('/api/admin/compliance/verify/7');
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('x-api-key')).toBeNull();
  });

  it('checks an entry with an API key', async () => {
    const fetchMock = stubFetch(json(intact));
    await httpApi.checkEntry({ apiKey: 'qwed_live_k' }, '7');
    const { headers } = call(fetchMock);
    expect(headers.get('x-api-key')).toBe('qwed_live_k');
    expect(headers.get('Authorization')).toBeNull();
  });

  it('asks for the whole-chain check', async () => {
    const fetchMock = stubFetch(json({ status: 'NO_ENTRIES' }));
    expect((await httpApi.verifyTrail({ session: 'tok' })).status).toBe('NO_ENTRIES');
    expect(call(fetchMock).url).toBe('/api/admin/compliance/verify-trail');
  });

  it('asks for the activity summary of the organisation with the session', async () => {
    const fetchMock = stubFetch(json({ report_type: 'Security activity summary' }));
    expect((await httpApi.activitySummary('tok', '12')).report_type).toBe('Security activity summary');
    const { url, headers } = call(fetchMock);
    expect(url).toBe('/api/admin/compliance/report/soc2/12');
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('tells a server that takes only API keys from other refusals', () => {
    expect(sessionNotAccepted(new ApiError(401, 'Missing x-api-key header'))).toBe(true);
    // After #485 the same route names the bearer token too.
    expect(sessionNotAccepted(new ApiError(401, 'Missing x-api-key header or bearer token'))).toBe(false);
    expect(sessionNotAccepted(new ApiError(403, 'Missing x-api-key header'))).toBe(false);
    expect(sessionNotAccepted(new Error('Missing x-api-key header'))).toBe(false);
  });
});

describe('httpApi security events', () => {
  it('asks for a page of events with the session and returns its cursor', async () => {
    const fetchMock = stubFetch(json({ total: 0, next_before: '5', events: [] }));
    expect(await httpApi.listSecurityEvents('tok', { limit: 2, before: '9', eventType: 'SECRET_LEAK_AUTO_REVOKED' })).toEqual({
      events: [],
      nextBefore: '5',
    });
    const { url, headers } = call(fetchMock);
    expect(url).toBe('/api/admin/security/events?limit=2&before=9&event_type=SECRET_LEAK_AUTO_REVOKED');
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('asks for the first fifty by default', async () => {
    const fetchMock = stubFetch(json({ total: 0, next_before: null, events: [] }));
    await httpApi.listSecurityEvents('tok');
    expect(call(fetchMock).url).toBe('/api/admin/security/events?limit=50');
  });
});
