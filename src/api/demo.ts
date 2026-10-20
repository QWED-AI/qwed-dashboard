import { ApiError, type QwedApi } from './http';
import type { AuditLog, EntryCheck, User } from './types';

// Sample data for exploring the dashboard without a QWED server. Shaped like
// the real /audit/logs rows; none of it comes from a real verification.

const demoUser: User = { id: 'demo', email: 'demo@example.com', org_id: 'demo', role: 'owner' };

function diagnostic(
  status: 'VERIFIED' | 'UNVERIFIABLE' | 'BLOCKED',
  agentMessage: string,
  developerFields: Record<string, unknown>,
  proofRef: string | null,
): string {
  return JSON.stringify({
    status,
    agent_message: agentMessage,
    developer_fields: developerFields,
    proof_ref: proofRef,
    is_authoritative: proofRef !== null,
  });
}

const contextDocument = JSON.stringify({
  spec_version: '1.0',
  object: { formal_statement: 'Invoice total 4 × 249.00 + 18% GST equals 1,175.28' },
  context: {
    interpretation: { theory: 'math verification' },
    proof: { verifier: 'math', verifier_version: '7.3.0' },
    evidence: {
      evidence: { status: 'VERIFIED', agent_message: 'The stated total matches.' },
      proof_ref: 'sha256:sample-41aa-3f90',
    },
    decision: { admission: 'ADMIT' },
  },
  verdict: 'VERIFIED',
});

const logs: AuditLog[] = [
  {
    id: '1042',
    request_input: 'Refund of 3,400.00 for order [ORDER ID] is within the 30-day return window',
    verification_result: diagnostic('UNVERIFIABLE', 'Logic constraints are unsatisfiable', { status: 'UNSAT', dsl_code: '[DSL]' }, null),
    engine_used: 'LOGIC',
    status: 'blocked',
    created_at: '2026-10-20T09:41:12',
  },
  {
    id: '1041',
    request_input: 'SELECT id, total FROM orders WHERE id = 7; DELETE FROM orders',
    verification_result: diagnostic('VERIFIED', 'The query is not read-only.', { is_valid: false }, 'sha256:sample-9c41-e07a'),
    engine_used: 'SQL',
    status: 'blocked',
    created_at: '2026-10-20T09:12:05',
  },
  {
    id: '1040',
    request_input: 'Invoice total 4 × 249.00 + 18% GST equals 1,175.28',
    verification_result: contextDocument,
    engine_used: 'VERIFICATION_CONTEXT',
    status: 'verified',
    created_at: '2026-10-20T08:57:44',
  },
  {
    id: '1039',
    request_input: 'Supplier VAT number [VAT ID] matches the registry extract supplied',
    verification_result: diagnostic('UNVERIFIABLE', 'The extract supports the claim; a fact check never reaches VERIFIED.', { verdict: 'SUPPORTED' }, null),
    engine_used: 'FACT',
    status: 'blocked',
    created_at: '2026-10-20T08:30:19',
  },
  {
    id: '1038',
    request_input: 'Supplier [NAME] is registered in Germany',
    verification_result: diagnostic('BLOCKED', 'The documents supplied contradict the claim.', { verdict: 'REFUTED' }, null),
    engine_used: 'FACT',
    status: 'blocked',
    created_at: '2026-10-20T08:14:33',
  },
  {
    id: '1037',
    request_input: '(a + b)**2 = a**2 + b**2',
    verification_result: diagnostic('VERIFIED', 'The identity is false.', { is_valid: false }, 'sha256:sample-d3e9-5b10'),
    engine_used: 'MATH',
    status: 'blocked',
    created_at: '2026-10-20T08:02:51',
  },
  {
    id: '1036',
    request_input: 'import os\nos.system("rm -rf /tmp/build")',
    verification_result: diagnostic('VERIFIED', 'The code runs a shell command.', { is_valid: false }, 'sha256:sample-2b77-a6c4'),
    engine_used: 'CODE',
    status: 'blocked',
    created_at: '2026-10-20T07:48:30',
  },
  {
    id: '1035',
    request_input: 'def refund(:\n    return total',
    verification_result: diagnostic('BLOCKED', 'The code could not be parsed.', {}, null),
    engine_used: 'CODE',
    status: 'blocked',
    created_at: '2026-10-20T07:33:10',
  },
  {
    id: '1034',
    request_input: 'Mean order value in [FILE] is 1,240.50',
    verification_result: JSON.stringify({ truncated: true, preview: "{'status': 'UNVERIFIABLE', 'agent_message': 'Sandboxed computation ran..." }),
    engine_used: 'STATS',
    status: 'blocked',
    created_at: '2026-10-20T06:52:40',
  },
  {
    id: '1033',
    request_input: '(x + 1)**2 = x**2 + 2*x + 1',
    verification_result: diagnostic('VERIFIED', 'The identity holds.', { is_valid: true }, 'sha256:sample-6e08-b2d9'),
    engine_used: 'MATH',
    status: 'verified',
    created_at: '2026-10-20T06:44:17',
  },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function find(id: string): AuditLog {
  const log = logs.find((l) => l.id === id);
  if (!log) throw new ApiError(404, 'Log not found');
  return log;
}

export const demoApi: QwedApi = {
  async signIn() {
    return { access_token: 'demo', token_type: 'bearer', user: demoUser };
  },
  async me() {
    return demoUser;
  },
  async listLogs() {
    await wait(250);
    return logs;
  },
  async getLog(_token, id) {
    await wait(150);
    return find(id);
  },
  async checkEntry(_adminKey, id): Promise<EntryCheck> {
    await wait(300);
    find(id);
    if (id === '1037') {
      return {
        valid: false,
        checks: { hash_valid: true, signature_valid: false, chain_valid: true },
        errors: ['HMAC signature mismatch (sample data)'],
        log_id: Number(id),
      };
    }
    return { valid: true, checks: { hash_valid: true, signature_valid: true, chain_valid: true }, errors: [], log_id: Number(id) };
  },
};
