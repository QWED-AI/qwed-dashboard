import { describe, expect, it } from 'vitest';
import { parseResult } from './result';

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
});
