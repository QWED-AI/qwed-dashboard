import { describe, expect, it } from 'vitest';
import { parseResult, toRecord } from './result';

describe('parseResult', () => {
  it('reads a DiagnosticResult and records no admission', () => {
    const r = parseResult(
      JSON.stringify({ status: 'VERIFIED', agent_message: 'ok', developer_fields: {}, proof_ref: 'sha256:x', is_authoritative: true }),
    );
    expect(r.shape).toBe('diagnostic');
    expect(r.verdict).toBe('VERIFIED');
    expect(r.admission).toBeNull();
    expect(r.proofRef).toBe('sha256:x');
    expect(r.isAuthoritative).toBe(true);
  });

  it('reads verdict and admission from a Verification Context document', () => {
    const r = parseResult(
      JSON.stringify({
        spec_version: '1.0',
        verdict: 'UNVERIFIABLE',
        context: { decision: { admission: 'DENY' }, evidence: { proof_ref: null } },
      }),
    );
    expect(r.shape).toBe('verification-context');
    expect(r.verdict).toBe('UNVERIFIABLE');
    expect(r.admission).toBe('DENY');
    expect(r.proofRef).toBeNull();
  });

  it('treats an empty verifier message as not recorded', () => {
    expect(parseResult(JSON.stringify({ status: 'VERIFIED', agent_message: '' })).agentMessage).toBeNull();
    expect(parseResult(JSON.stringify({ status: 'VERIFIED', agent_message: '  ' })).agentMessage).toBeNull();
    expect(
      parseResult(JSON.stringify({ spec_version: '1.0', verdict: 'VERIFIED', context: { evidence: { evidence: { agent_message: '' } } } }))
        .agentMessage,
    ).toBeNull();
  });

  it('never works out an admission from the verdict', () => {
    const r = parseResult(JSON.stringify({ status: 'BLOCKED', proof_ref: null }));
    expect(r.verdict).toBe('BLOCKED');
    expect(r.admission).toBeNull();
  });

  it('does not accept values outside the specification', () => {
    expect(parseResult(JSON.stringify({ status: 'INCONCLUSIVE' })).verdict).toBeNull();
    expect(parseResult(JSON.stringify({ status: 'verified' })).verdict).toBeNull();
    // The core AdmissionDecision enum says BLOCKED; the specification says DENY.
    expect(parseResult(JSON.stringify({ status: 'BLOCKED', admission: 'BLOCKED' })).admission).toBeNull();
  });

  it('reports a truncated result instead of guessing', () => {
    const r = parseResult(JSON.stringify({ truncated: true, preview: "{'status': 'VERIFIED'" }));
    expect(r.shape).toBe('truncated');
    expect(r.verdict).toBeNull();
    expect(r.error).not.toBeNull();
  });

  it('handles text that is not JSON, or not an object', () => {
    expect(parseResult('not json').error).not.toBeNull();
    expect(parseResult('[1, 2]').verdict).toBeNull();
    expect(parseResult('null').shape).toBe('unknown');
  });

  // The row /verify/batch writes for each item (#477).
  const batchRow = (details: unknown) =>
    JSON.stringify({ batch_job_id: 'j', batch_item_id: 'j-0', batch_item_type: 'code', item_status: 'completed', details });

  it('reads a batch item from its result under details', () => {
    const r = parseResult(
      batchRow({ result: { status: 'VERIFIED', agent_message: 'Unsafe code', proof_ref: 'sha256:x', admission: 'DENY' }, error: null }),
    );
    expect(r.shape).toBe('batch-item');
    expect(r.verdict).toBe('VERIFIED');
    expect(r.admission).toBe('DENY'); // batch code items store the admission
    expect(r.agentMessage).toBe('Unsafe code');
    expect(r.proofRef).toBe('sha256:x');
  });

  it('gives a batch logic item no verdict, as the server does', () => {
    // Batch logic items store the control plane's SAT, not a verdict (#494).
    expect(parseResult(batchRow({ result: { status: 'SAT' }, error: null })).verdict).toBeNull();
  });

  it('says why a failed or shortened batch item has no verdict', () => {
    const failed = parseResult(batchRow({ result: null, error: 'audit persistence failed' }));
    expect(failed.shape).toBe('batch-item');
    expect(failed.verdict).toBeNull();
    expect(failed.error).toBe('This batch item failed: audit persistence failed');
    expect(parseResult(batchRow({ truncated: true })).shape).toBe('truncated');
  });
});

describe('toRecord', () => {
  const log = (extra: Record<string, unknown>) => ({
    id: '1',
    request_input: 'q',
    verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: 'm' }),
    engine_used: 'MATH',
    status: 'verified',
    created_at: 'x',
    ...extra,
  });

  it('reads the verdict from the result when the server sends none (before #484)', () => {
    expect(toRecord(log({})).result.verdict).toBe('VERIFIED');
  });

  it('uses the server verdict when it sends one, null included', () => {
    expect(toRecord(log({ verdict: 'BLOCKED' })).result.verdict).toBe('BLOCKED');
    expect(toRecord(log({ verdict: null })).result.verdict).toBeNull();
  });

  it('does not accept a server verdict outside the specification', () => {
    expect(toRecord(log({ verdict: 'SAT' })).result.verdict).toBeNull();
  });

  it('keeps the message and other fields from the result', () => {
    expect(toRecord(log({ verdict: 'BLOCKED' })).result.agentMessage).toBe('m');
  });
});
