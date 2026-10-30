import { describe, expect, it } from 'vitest';
import { demoApi } from './demo';

describe('the sample audit chain checks', () => {
  // As qwed-verification words the scope from #551: the whole-chain check
  // has no start or end, the activity summary's check covers its period.
  it('names every entry for the whole chain, and the period for the summary', async () => {
    expect((await demoApi.verifyTrail({ session: 'demo' })).scope).toBe(
      'Signature and hash-chain check of every audit entry recorded for the organisation. It does not show that every request was recorded.',
    );
    expect((await demoApi.activitySummary('demo', 'demo')).audit_trail.scope).toBe(
      'Signature and hash-chain check of the audit entries recorded in the period. It does not show that every request was recorded.',
    );
  });
});

describe('the sample ledger', () => {
  it('holds a week of rows, newest first, with distinct ids', async () => {
    const { logs } = await demoApi.listLogs('demo', 200);
    const times = logs.map((l) => l.created_at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(new Set(logs.map((l) => l.id)).size).toBe(logs.length);
    const days = new Set(times.map((t) => t.slice(0, 10)));
    expect([...days].sort()).toEqual(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
  });

  it('has no row from key 7 before the key was created', async () => {
    const { logs } = await demoApi.listLogs('demo', 200);
    const created = (await demoApi.listKeys('demo')).find((k) => k.id === '7')?.created_at ?? '';
    expect(logs.filter((l) => l.api_key_id === '7' && l.created_at < created)).toEqual([]);
  });

  it('links each row to the next older one, the oldest to none', async () => {
    const { logs } = await demoApi.listLogs('demo', 200);
    const full = await Promise.all(logs.map((l) => demoApi.getLog('demo', l.id)));
    full.forEach((row, i) => {
      expect(row.previous_hash).toBe(full[i + 1]?.entry_hash ?? null);
    });
  });
});
