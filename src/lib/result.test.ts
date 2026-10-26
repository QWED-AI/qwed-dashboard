import { describe, expect, it } from 'vitest';
import type { AuditLog, Verdict } from '../api/types';
import { attestationVerdictLabel, CALLER_SUPPLIED_NOTICE, parseResult, toRecord } from './result';

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

  describe('the messages of a Verification Context document', () => {
    const document = (evidence: Record<string, unknown>) =>
      parseResult(JSON.stringify({ spec_version: '1.0', verdict: 'VERIFIED', context: { evidence: { evidence } } }));

    it('shows the message as the caller’s on a server before qwed-verification #321, which kept it verbatim', () => {
      const r = document({
        agent_message: 'Verified by the QWED math engine: the stated total holds.',
        developer_fields: { constraint_id: 'verification_context.caller_supplied_diagnostic' },
      });
      expect(r.agentMessage).toBeNull();
      expect(r.callerMessage).toBe('Verified by the QWED math engine: the stated total holds.');
    });

    it('takes the notice as the server’s, and the caller’s message from where the server keeps it (#321)', () => {
      const r = document({
        agent_message: CALLER_SUPPLIED_NOTICE,
        developer_fields: { caller_supplied: { agent_message: 'The stated total holds.', developer_fields: {} } },
      });
      expect(r.agentMessage).toBe(CALLER_SUPPLIED_NOTICE);
      expect(r.callerMessage).toBe('The stated total holds.');
    });

    it('keeps another message as the caller’s even when caller_supplied is there too', () => {
      // An older server stored the caller's developer_fields as sent, caller_supplied included.
      const r = document({
        agent_message: 'Caller-written text.',
        developer_fields: { caller_supplied: { agent_message: 'Nested caller text.', developer_fields: {} } },
      });
      expect(r.agentMessage).toBeNull();
      expect(r.callerMessage).toBe('Caller-written text.');
    });

    it('takes only the notice’s exact text as the server’s', () => {
      expect(document({ agent_message: `${CALLER_SUPPLIED_NOTICE}.` }).agentMessage).toBeNull();
      expect(document({ agent_message: CALLER_SUPPLIED_NOTICE.toUpperCase() }).callerMessage).toBe(
        CALLER_SUPPLIED_NOTICE.toUpperCase(),
      );
      expect(document({ agent_message: CALLER_SUPPLIED_NOTICE }).callerMessage).toBeNull();
    });

    it('never gives a DiagnosticResult a caller’s message', () => {
      expect(parseResult(JSON.stringify({ status: 'VERIFIED', agent_message: 'ok' })).callerMessage).toBeNull();
    });
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
  });

  it('shows a stored BLOCKED admission as DENY and keeps the stored word', () => {
    // The verify routes store BLOCKED for what the specification calls DENY (#324).
    const r = parseResult(JSON.stringify({ status: 'VERIFIED', admission: 'BLOCKED' }));
    expect([r.admission, r.admissionStored]).toEqual(['DENY', 'BLOCKED']);
  });

  it('keeps an admission word it does not know, without showing it as a decision', () => {
    const r = parseResult(JSON.stringify({ status: 'VERIFIED', admission: 'REVIEW' }));
    expect([r.admission, r.admissionStored]).toEqual([null, 'REVIEW']);
    const blank = parseResult(JSON.stringify({ status: 'VERIFIED', admission: ' ' }));
    expect([blank.admission, blank.admissionStored]).toEqual([null, null]);
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

  it('reads the attestation a result stored, and none from a Verification Context document (#39)', () => {
    expect(parseResult(JSON.stringify({ status: 'VERIFIED', attestation: 'h.p.s' })).attestation).toBe('h.p.s');
    expect(parseResult(JSON.stringify({ status: 'VERIFIED', attestation: '' })).attestation).toBeNull();
    expect(parseResult(JSON.stringify({ status: 'VERIFIED' })).attestation).toBeNull();
    expect(
      parseResult(JSON.stringify({ spec_version: '1.0', verdict: 'VERIFIED', attestation: 'h.p.s', context: {} })).attestation,
    ).toBeNull();
    const batch = JSON.stringify({ batch_job_id: 'j', details: { result: { status: 'VERIFIED', attestation: 'h.p.s' } } });
    expect(parseResult(batch).attestation).toBe('h.p.s');
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

  it('says a batch item with neither a result nor an error stored no result', () => {
    for (const details of [{ result: null, error: '' }, { error: null }, {}, null]) {
      const r = parseResult(batchRow(details));
      expect(r.shape).toBe('batch-item');
      expect(r.verdict).toBeNull();
      expect(r.error).toBe('This batch item stored no result.');
    }
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

  describe('the admission the row stores (#307)', () => {
    const context = (admission: string) =>
      JSON.stringify({ spec_version: '1.0', verdict: 'VERIFIED', context: { decision: { admission } } });
    const row = (doc: string, extra: Record<string, unknown>) =>
      toRecord(log({ verification_result: context(doc), ...extra })).result;

    it('wins over the document’s when it has one', () => {
      expect([row('ADMIT', { admission: 'DENY' }).admission, row('ADMIT', { admission: 'DENY' }).admissionStored]).toEqual(['DENY', null]);
      expect(row('DENY', { admission: 'ADMIT' }).admission).toBe('ADMIT');
      expect([row('ADMIT', { admission: 'BLOCKED' }).admission, row('ADMIT', { admission: 'BLOCKED' }).admissionStored]).toEqual(['DENY', 'BLOCKED']);
    });

    it('lets a word it does not know override the document’s, kept and not shown as a decision', () => {
      const r = row('ADMIT', { admission: 'REVIEW' });
      expect([r.admission, r.admissionStored]).toEqual([null, 'REVIEW']);
    });

    it('leaves the document’s standing when it is null, as on a row from before #307, or absent', () => {
      expect(row('ADMIT', { admission: null }).admission).toBe('ADMIT');
      expect(row('DENY', {}).admission).toBe('DENY');
    });

    it('is not recorded when neither the row nor the stored result has one', () => {
      const r = toRecord(log({ admission: null })).result;
      expect([r.admission, r.admissionStored]).toEqual([null, null]);
    });
  });

  it('keeps the caller as the server sent it: an id, null, or absent before #484', () => {
    expect(toRecord(log({ api_key_id: '7' })).apiKeyId).toBe('7');
    expect(toRecord(log({ api_key_id: null })).apiKeyId).toBeNull();
    expect(toRecord(log({})).apiKeyId).toBeUndefined();
  });
});

describe('the attestation check (qwed-verification #320)', () => {
  const blocked = (fields: Record<string, unknown> | undefined, status = 'BLOCKED') =>
    JSON.stringify({ status, agent_message: 'Verification blocked', developer_fields: fields, proof_ref: null, is_authoritative: false });
  const refused = (constraintId: string) => ({
    constraint_id: constraintId,
    policy: 'mandatory',
    verdict_status: 'VERIFIED',
    verdict_proof_ref: 'sha256:reached',
  });

  // What qwed-verification main stores for each refusal today (core/diagnostics.py, core/trust.py).
  const V = 'sha256:reached';
  const shapes: { fields: Record<string, unknown>; verdict: string | null; proofRef: string | null }[] = [
    { fields: { constraint_id: 'trust_gate.mandatory_attestation_missing', missing: 'attestation_token', policy: 'p', verdict_status: 'VERIFIED', verdict_proof_ref: V }, verdict: 'VERIFIED', proofRef: V },
    { fields: { constraint_id: 'trust_gate.invalid_attestation_token', validation_error: 'expired', policy: 'p', verdict_status: 'VERIFIED', verdict_proof_ref: V }, verdict: 'VERIFIED', proofRef: V },
    { fields: { constraint_id: 'trust_gate.attestation_verification_error', error: 'x', policy: 'p', verdict_status: 'VERIFIED', verdict_proof_ref: V }, verdict: 'VERIFIED', proofRef: V },
    { fields: { constraint_id: 'trust_gate.claims_missing', policy: 'p', verdict_status: 'VERIFIED', verdict_proof_ref: V }, verdict: 'VERIFIED', proofRef: V },
    // The claim mismatches keep only what they compared.
    { fields: { constraint_id: 'trust_gate.claims_status_mismatch', token_status: 'UNVERIFIABLE', result_status: 'VERIFIED', policy: 'p' }, verdict: 'VERIFIED', proofRef: null },
    { fields: { constraint_id: 'trust_gate.claims_proof_mismatch', token_proof_hash: 'sha256:token', result_proof_ref: V, policy: 'p' }, verdict: null, proofRef: V },
    { fields: { constraint_id: 'trust_gate.claims_query_mismatch', expected_query_hash: 'a', token_query_hash: 'b', policy: 'p' }, verdict: null, proofRef: null },
    { fields: { constraint_id: 'trust_gate.diagnostic_snapshot_failed', policy: 'p' }, verdict: null, proofRef: null },
    { fields: { constraint_id: 'api.attestation.signing_error', attestation_error: 'SIGNING_FAILURE', engine: 'code', verdict_status: 'VERIFIED', verdict_proof_ref: V }, verdict: 'VERIFIED', proofRef: V },
  ];

  it('reads each refusal the server writes, from the fields it keeps for that refusal', () => {
    for (const { fields, verdict, proofRef } of shapes) {
      const r = parseResult(blocked(fields));
      expect(r.verdict).toBe('BLOCKED');
      expect(r.attestationBlock).toEqual({ constraintId: fields.constraint_id, verdict, verdictStored: null, proofRef });
    }
  });

  it('matches by prefix, so an id the dashboard has not seen still reads', () => {
    expect(parseResult(blocked(refused('trust_gate.some_new_reason'))).attestationBlock?.constraintId).toBe(
      'trust_gate.some_new_reason',
    );
  });

  it('labels the verifier’s verdict: as read, as stored, or not recorded', () => {
    const label = (fields: Record<string, unknown>) => {
      const block = parseResult(blocked(fields)).attestationBlock;
      return block ? attestationVerdictLabel(block) : null;
    };
    expect(label(refused('trust_gate.claims_missing'))).toBe('VERIFIED');
    expect(label({ ...refused('trust_gate.claims_missing'), verdict_status: 'SAT' })).toBe('SAT (not a verdict the dashboard knows)');
    expect(label({ constraint_id: 'trust_gate.claims_query_mismatch' })).toBe('not recorded');
  });

  it('leaves a result the verifier blocked alone', () => {
    expect(parseResult(blocked({ constraint_id: 'code_verifier.unsupported_language' })).attestationBlock).toBeNull();
    expect(parseResult(blocked({ constraint_id: 'trust_gateway' })).attestationBlock).toBeNull();
    expect(parseResult(blocked({})).attestationBlock).toBeNull();
    expect(parseResult(blocked(undefined)).attestationBlock).toBeNull();
    expect(parseResult(JSON.stringify({ status: 'BLOCKED', developer_fields: { constraint_id: 7 } })).attestationBlock).toBeNull();
  });

  it('reads it only on a BLOCKED result', () => {
    for (const status of ['VERIFIED', 'UNVERIFIABLE', 'SAT']) {
      expect(parseResult(blocked(refused('trust_gate.claims_missing'), status)).attestationBlock).toBeNull();
    }
  });

  it('keeps a verdict outside the specification as stored, and not as a verdict', () => {
    const r = parseResult(blocked({ ...refused('trust_gate.claims_missing'), verdict_status: 'SAT' }));
    expect(r.attestationBlock?.verdict).toBeNull();
    expect(r.attestationBlock?.verdictStored).toBe('SAT');
    const none = parseResult(blocked({ constraint_id: 'trust_gate.claims_missing', verdict_status: '' }));
    expect(none.attestationBlock?.verdict).toBeNull();
    expect(none.attestationBlock?.verdictStored).toBeNull();
  });

  it('reads it from a batch item and from a Verification Context document', () => {
    const item = JSON.stringify({
      batch_job_id: 'j',
      batch_item_id: 'j-0',
      details: { result: JSON.parse(blocked(refused('trust_gate.mandatory_attestation_missing'))), error: null },
    });
    expect(parseResult(item).attestationBlock?.constraintId).toBe('trust_gate.mandatory_attestation_missing');
    const doc = JSON.stringify({
      spec_version: '1.0',
      verdict: 'BLOCKED',
      context: { evidence: { evidence: { developer_fields: refused('api.attestation.signing_error') } }, decision: { admission: 'DENY' } },
    });
    expect(parseResult(doc).attestationBlock?.constraintId).toBe('api.attestation.signing_error');
  });

  it('goes with the verdict the row stores: dropped when the server reads another', () => {
    const row = (verdict: Verdict | null): AuditLog => ({
      id: '1',
      request_input: 'q',
      verification_result: blocked(refused('api.attestation.signing_error')),
      engine_used: 'CODE',
      status: 'blocked',
      created_at: 'x',
      verdict,
    });
    expect(toRecord(row('BLOCKED')).result.attestationBlock?.verdict).toBe('VERIFIED');
    expect(toRecord(row('VERIFIED')).result.attestationBlock).toBeNull();
    expect(toRecord(row(null)).result.attestationBlock).toBeNull();
  });
});
