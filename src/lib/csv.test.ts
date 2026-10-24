import { describe, expect, it } from 'vitest';
import type { AuditLog } from '../api/types';
import { csvCell, ledgerCsv } from './csv';
import { toRecord } from './result';

const log = (extra: Partial<AuditLog> = {}): AuditLog => ({
  id: '7',
  request_input: '(x + 1)**2 = x**2 + 2*x + 1',
  verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: 'The identity holds.', proof_ref: 'sha256:a' }),
  engine_used: 'MATH',
  status: 'verified',
  created_at: '2026-10-20T06:44:17',
  verdict: 'VERIFIED',
  api_key_id: '6',
  admission: 'ADMIT',
  ...extra,
});

/** The cells of each line, for files whose cells hold no commas or line breaks. */
const lines = (csv: string) => csv.split('\r\n').filter(Boolean).map((l) => l.split(','));

describe('csvCell', () => {
  it('leaves plain text as it is and writes no value as an empty cell', () => {
    expect(csvCell('VERIFIED')).toBe('VERIFIED');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('')).toBe('');
  });

  it('quotes commas, quotes and line breaks, doubling the quotes', () => {
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "no"')).toBe('"say ""no"""');
    expect(csvCell('def f():\n    return 1')).toBe('"def f():\n    return 1"');
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"');
  });

  it('keeps a spreadsheet from reading a cell as a formula', () => {
    for (const start of ['=', '+', '-', '@', '\t', '\r']) {
      expect(csvCell(`${start}SUM(A1:A9)`)).toBe(`"'${start}SUM(A1:A9)"`);
    }
    expect(csvCell('=HYPERLINK("http://x", "y")')).toBe('"\'=HYPERLINK(""http://x"", ""y"")"');
    // Only the first character counts.
    expect(csvCell('2 - 1 = 1')).toBe('2 - 1 = 1');
  });
});

describe('ledgerCsv', () => {
  it('writes a header and one line per record, with CRLF line ends', () => {
    const csv = ledgerCsv([toRecord(log())]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(lines(csv)).toEqual([
      [
        'record_id',
        'received_utc',
        'verifier',
        'request',
        'verdict',
        'admission',
        'admission_stored',
        'verifier_message',
        'proof_ref',
        'api_key_id',
        'attestation_refusal',
        'attestation_verifier_verdict',
      ],
      ['7', '2026-10-20T06:44:17', 'MATH', '(x + 1)**2 = x**2 + 2*x + 1', 'VERIFIED', 'ADMIT', '', 'The identity holds.', 'sha256:a', '6', '', ''],
    ]);
  });

  it('writes the values the ledger shows, and leaves what the server did not store empty', () => {
    const [, cells] = lines(
      ledgerCsv([
        toRecord(
          log({
            verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: 'The query is not read-only.' }),
            admission: 'BLOCKED',
            api_key_id: null,
          }),
        ),
      ]),
    );
    // A stored BLOCKED admission is DENY, with the stored word beside it, as on the record page.
    expect(cells?.slice(4, 10)).toEqual(['VERIFIED', 'DENY', 'BLOCKED', 'The query is not read-only.', '', '']);

    const [, none] = lines(ledgerCsv([toRecord(log({ verdict: null, admission: null, verification_result: '{}' }))]));
    expect(none?.slice(4, 9)).toEqual(['', '', '', '', '']);
  });

  it('never works out an admission the server did not store', () => {
    const [, cells] = lines(ledgerCsv([toRecord(log({ admission: undefined }))]));
    expect(cells?.[5]).toBe('');
  });

  it('writes the attestation refusal and the verifier’s verdict it kept', () => {
    const blocked = (fields: Record<string, unknown>) =>
      log({
        verification_result: JSON.stringify({ status: 'BLOCKED', agent_message: 'Verification blocked', developer_fields: fields }),
        verdict: 'BLOCKED',
        admission: 'BLOCKED',
      });
    const csv = ledgerCsv([
      toRecord(blocked({ constraint_id: 'api.attestation.signing_error', verdict_status: 'VERIFIED' })),
      toRecord(blocked({ constraint_id: 'trust_gate.claims_status_mismatch', result_status: 'SAT' })),
      toRecord(blocked({ constraint_id: 'trust_gate.claims_query_mismatch' })),
    ]);
    expect(lines(csv).slice(1).map((c) => c.slice(10))).toEqual([
      ['api.attestation.signing_error', 'VERIFIED'],
      ['trust_gate.claims_status_mismatch', 'SAT'],
      ['trust_gate.claims_query_mismatch', ''],
    ]);
  });

  it('quotes a request that spans lines, so it stays one record', () => {
    const csv = ledgerCsv([toRecord(log({ request_input: 'def refund_total(items):\n    return sum(i.price for i in items)' }))]);
    expect(csv).toContain(',"def refund_total(items):\n    return sum(i.price for i in items)",');
  });
});
