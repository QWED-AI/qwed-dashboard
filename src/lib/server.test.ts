import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/http';
import { compareVersions, NEEDED_VERSION, serverStatus } from './server';

describe('compareVersions', () => {
  it('orders by major, minor, then patch', () => {
    expect(compareVersions('7.3.0', '8.0.0')).toBeLessThan(0);
    expect(compareVersions('8.0.0', '8.0.0')).toBe(0);
    expect(compareVersions('8.0.1', '8.0.0')).toBeGreaterThan(0);
    expect(compareVersions('8.10.0', '8.9.0')).toBeGreaterThan(0);
    expect(compareVersions('10.0.0', '9.9.9')).toBeGreaterThan(0);
  });

  it('reads a leading v and ignores a pre-release or build after the numbers', () => {
    expect(compareVersions('v8.0.0', '8.0.0')).toBe(0);
    expect(compareVersions('8.0.0rc1', '8.0.0')).toBe(0);
    expect(compareVersions('8.1.0-dev+abc', '8.0.0')).toBeGreaterThan(0);
  });

  it('is null for a version it cannot read', () => {
    expect(compareVersions('8.0', '8.0.0')).toBeNull();
    expect(compareVersions('latest', '8.0.0')).toBeNull();
    expect(compareVersions('', '8.0.0')).toBeNull();
  });
});

describe('serverStatus', () => {
  it('names a server at the needed version or later as current', () => {
    expect(serverStatus({ version: NEEDED_VERSION }, null, false)).toEqual({ kind: 'current', version: NEEDED_VERSION });
    expect(serverStatus({ version: ' 8.2.1 ' }, null, false)).toEqual({ kind: 'current', version: '8.2.1' });
  });

  it('names an older server as older', () => {
    expect(serverStatus({ status: 'healthy', version: '7.3.0' }, null, false)).toEqual({ kind: 'older', version: '7.3.0' });
  });

  it('says it cannot tell when the server sends no version, or one it cannot read', () => {
    expect(serverStatus({ status: 'healthy' }, null, false)).toEqual({ kind: 'unknown', version: null });
    expect(serverStatus({ version: 'main' }, null, false)).toEqual({ kind: 'unknown', version: 'main' });
  });

  it('says the server is unreachable when it did not answer, even after an earlier answer', () => {
    const down = new ApiError(0, 'The QWED server could not be reached.');
    expect(serverStatus(undefined, down, false)).toEqual({ kind: 'unreachable' });
    expect(serverStatus({ version: '8.0.0' }, down, false)).toEqual({ kind: 'unreachable' });
    const gateway = new ApiError(502, 'The QWED server could not be reached. The proxy in front of it answered 502.', null, true);
    expect(serverStatus(undefined, gateway, false)).toEqual({ kind: 'unreachable' });
  });

  it('says the check failed when something other than the server’s health answered', () => {
    const html = new ApiError(200, 'The server did not return JSON. Check that /api points at the QWED server.');
    expect(serverStatus(undefined, html, false)).toEqual({ kind: 'failed', reason: html.message });
    expect(serverStatus(undefined, new ApiError(404, 'Not Found'), false)).toEqual({ kind: 'failed', reason: 'Not Found' });
  });

  it('lets a failed refresh replace an earlier answer, which may no longer be what answers there', () => {
    expect(serverStatus({ version: '8.0.0' }, new ApiError(500, 'Internal Server Error'), false)).toEqual({
      kind: 'failed',
      reason: 'Internal Server Error',
    });
  });

  it('is checking until the first answer, and sample data in the demo', () => {
    expect(serverStatus(undefined, null, false)).toEqual({ kind: 'checking' });
    expect(serverStatus({ version: '8.0.0' }, null, true)).toEqual({ kind: 'demo' });
  });
});
