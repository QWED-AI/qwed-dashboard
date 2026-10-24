// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { AuditLog } from '../api/types';
import { renderApp } from '../test/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});

async function region(name: string) {
  return within(await screen.findByRole('region', { name }));
}

/** The value next to a label in the record details. */
async function detail(label: string) {
  const details = await region('Record details');
  const term = details.getByText(label, { selector: 'dt' });
  return term.nextElementSibling?.textContent;
}

async function openAuditEntry() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'Audit entry' }));
  return within(screen.getByRole('tabpanel', { name: 'Audit entry' }));
}

const olderServerRow: AuditLog = {
  id: '1',
  request_input: 'q',
  verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: 'ok' }),
  engine_used: 'MATH',
  status: 'verified',
  created_at: '2026-10-21T10:00:00',
};

describe('RecordPage', () => {
  describe('details', () => {
    it('names the key that made the record and the server version', async () => {
      renderApp(<App />, { route: '/records/1037' });
      expect(await detail('API key')).toBe('payments-agent prod (qwed_live_****x7Qa)');
      expect(await detail('Version')).toBe('7.3.0');
      expect(await detail('Verifier')).toBe('math');
    });

    it('shows the id of a key that is not in the key list', async () => {
      renderApp(<App />, { route: '/records/1036' });
      expect(await detail('API key')).toBe('Key 5, not in your key list');
    });

    it('shows the key id, and says the list failed, when the key list is refused', async () => {
      vi.spyOn(demoApi, 'listKeys').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
      renderApp(<App />, { route: '/records/1037' });
      await waitFor(async () => expect(await detail('API key')).toBe('Key 7 (the key list could not be loaded)'));
    });

    it('says not recorded for a record written before the server kept its caller', async () => {
      renderApp(<App />, { route: '/records/1033' });
      expect(await detail('API key')).toBe('not recorded');
      expect(await detail('Version')).toBe('not recorded');
      expect((await region('Record details')).getByText(/No API key is recorded for this row/)).toBeTruthy();
    });
  });

  describe('the reason, what next, and checks', () => {
    it('shows what the verifier said, and for VERIFIED that it is not a claim holding', async () => {
      renderApp(<App />, { route: '/records/1037' });
      expect((await region('Why')).getByText('The identity is false.')).toBeTruthy();
      const next = await region('Read what the verifier said');
      expect(next.getByText(/VERIFIED means the check ran to a proof, not that the claim holds/)).toBeTruthy();
    });

    it('gives each verdict its own next step', async () => {
      renderApp(<App />, { route: '/records/1038' });
      expect(await screen.findByRole('heading', { name: 'Send a new request' })).toBeTruthy();
      cleanup();
      renderApp(<App />, { route: '/records/1042' });
      expect(await screen.findByRole('heading', { name: 'A person can look' })).toBeTruthy();
      cleanup();
      renderApp(<App />, { route: '/records/1034' });
      expect(await screen.findByRole('heading', { name: 'No readable verdict' })).toBeTruthy();
    });

    it('says whether the result carries a proof_ref', async () => {
      renderApp(<App />, { route: '/records/1037' });
      const checks = await region('Checks');
      expect(checks.getByText('proof_ref present')).toBeTruthy();
      expect(checks.getByText('sha256:sample-d3e9-5b10')).toBeTruthy();
      cleanup();
      renderApp(<App />, { route: '/records/1038' });
      expect((await region('Checks')).getByText('No proof_ref')).toBeTruthy();
    });

    it('does not call a proof_ref absent when the stored result cannot be read', async () => {
      // The server says VERIFIED; the stored copy was shortened, so the
      // dashboard cannot see its proof_ref and must not say it has none.
      vi.spyOn(demoApi, 'getLog').mockResolvedValue({
        ...olderServerRow,
        verification_result: JSON.stringify({ truncated: true, preview: "{'status': 'VERIFIED'" }),
        verdict: 'VERIFIED',
      });
      renderApp(<App />, { route: '/records/1' });
      const checks = await region('Checks');
      expect(checks.getByText('proof_ref not readable')).toBeTruthy();
      expect(checks.queryByText('No proof_ref')).toBeNull();
    });

    it('says when the attestation check, not the verifier, blocked the result', async () => {
      renderApp(<App />, { route: '/records/1035' });
      const card = await region('Blocked by the attestation check');
      expect(card.getByText('VERIFIED')).toBeTruthy();
      expect(card.getByText('sha256:sample-5f12-c08e')).toBeTruthy();
      expect(card.getByText('api.attestation.signing_error')).toBeTruthy();
      expect(card.getByText(/does not store the attestation token/)).toBeTruthy();
      // The next step points at the server, and the record stays BLOCKED.
      expect(await screen.findByRole('heading', { name: 'Look at the server’s attestation' })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Send a new request' })).toBeNull();
      expect(screen.getAllByText('BLOCKED').length).toBeGreaterThan(0);
      expect((await region('Checks')).getByText('No proof_ref')).toBeTruthy();
    });

    it('shows no attestation note when the verifier itself blocked the result', async () => {
      renderApp(<App />, { route: '/records/1038' });
      expect(await screen.findByRole('heading', { name: 'Send a new request' })).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Blocked by the attestation check' })).toBeNull();
    });

    it('says the verifier’s verdict was not recorded when the server kept none', async () => {
      vi.spyOn(demoApi, 'getLog').mockResolvedValue({
        ...olderServerRow,
        verification_result: JSON.stringify({
          status: 'BLOCKED',
          agent_message: 'Verification blocked — diagnostic snapshot failed',
          developer_fields: { constraint_id: 'trust_gate.diagnostic_snapshot_failed', policy: 'mandatory' },
          proof_ref: null,
        }),
        verdict: 'BLOCKED',
      });
      renderApp(<App />, { route: '/records/1' });
      const card = await region('Blocked by the attestation check');
      expect(card.getAllByText('not recorded')).toHaveLength(2);
      expect(card.getByText('trust_gate.diagnostic_snapshot_failed')).toBeTruthy();
    });

    it('shows the proof_ref a proof mismatch keeps, with no verdict', async () => {
      vi.spyOn(demoApi, 'getLog').mockResolvedValue({
        ...olderServerRow,
        verification_result: JSON.stringify({
          status: 'BLOCKED',
          agent_message: 'Verification blocked',
          developer_fields: {
            constraint_id: 'trust_gate.claims_proof_mismatch',
            token_proof_hash: 'sha256:token',
            result_proof_ref: 'sha256:verifier',
            policy: 'mandatory',
          },
          proof_ref: null,
        }),
        verdict: 'BLOCKED',
      });
      renderApp(<App />, { route: '/records/1' });
      const card = await region('Blocked by the attestation check');
      expect(card.getByText('sha256:verifier')).toBeTruthy();
      expect(card.getByText('not recorded')).toBeTruthy();
    });

    it('says a VERIFIED result with no proof_ref did not record one', async () => {
      vi.spyOn(demoApi, 'getLog').mockResolvedValue(olderServerRow); // VERIFIED, no proof_ref
      renderApp(<App />, { route: '/records/1' });
      expect((await region('Checks')).getByText('No proof_ref recorded')).toBeTruthy();
    });
  });

  describe('admission', () => {
    /** The Checks list's admission value. */
    async function admission() {
      const checks = await region('Checks');
      return checks.getByText('Admission', { selector: 'dt' }).nextElementSibling?.textContent;
    }

    it('shows a stored BLOCKED as DENY, and says what was stored', async () => {
      renderApp(<App />, { route: '/records/1037' });
      expect(await admission()).toBe('DENY (stored as BLOCKED)');
      expect((await region('Checks')).getByText(/The server stored this admission as BLOCKED/)).toBeTruthy();
      expect(screen.getByRole('heading', { name: '(a + b)**2 = a**2 + b**2' })).toBeTruthy();
      expect(document.querySelector('.chip.lg')?.getAttribute('aria-label')).toBe('VERIFIED, admission DENY, stored as BLOCKED');
    });

    it('says why there is none on a route that decides none', async () => {
      renderApp(<App />, { route: '/records/1042' });
      expect(await admission()).toBe('not recorded');
      expect((await region('Checks')).getByText(/This route decides none/)).toBeTruthy();
    });

    it('shows a Verification Context’s ADMIT with no note', async () => {
      renderApp(<App />, { route: '/records/1040' });
      expect(await admission()).toBe('ADMIT');
      expect((await region('Checks')).queryByText(/stored this admission|decides none/)).toBeNull();
    });

    it('shows a Verification Context’s own admission on a row from before #307', async () => {
      const row = await demoApi.getLog('demo', '1040');
      vi.spyOn(demoApi, 'getLog').mockResolvedValue({ ...row, admission: null });
      renderApp(<App />, { route: '/records/1040' });
      expect(await admission()).toBe('ADMIT');
    });

    it('explains a Verification Context with no admission anywhere', async () => {
      const row = await demoApi.getLog('demo', '1040');
      const doc = JSON.parse(row.verification_result) as { context: { decision: Record<string, unknown> } };
      doc.context.decision = {};
      vi.spyOn(demoApi, 'getLog').mockResolvedValue({ ...row, admission: null, verification_result: JSON.stringify(doc) });
      renderApp(<App />, { route: '/records/1040' });
      expect(await admission()).toBe('not recorded');
      expect((await region('Checks')).getByText(/its Verification Context document holds none either/)).toBeTruthy();
    });

    it('keeps reading the stored result on a server that sends no admission', async () => {
      vi.spyOn(demoApi, 'getLog').mockResolvedValue(olderServerRow);
      renderApp(<App />, { route: '/records/1' });
      expect(await admission()).toBe('not recorded');
    });
  });

  describe('tabs', () => {
    it('shows the stored result first and the audit entry on its tab', async () => {
      renderApp(<App />, { route: '/records/1037' });
      expect((await screen.findByRole('tab', { name: 'Stored result' })).getAttribute('aria-selected')).toBe('true');
      expect(screen.getByRole('region', { name: 'Stored result JSON' })).toBeTruthy();

      const entry = await openAuditEntry();
      // Sample hashes: 64 hex characters, like a SHA-256, and all different.
      const values = entry.getAllByText(/^[0-9a-f]{64}$/).map((el) => el.textContent);
      expect(values).toHaveLength(3);
      expect(new Set(values).size).toBe(3);
      expect(screen.queryByRole('region', { name: 'Stored result JSON' })).toBeNull();
    });

    it('links each sample entry to the one before it', async () => {
      const [newer, older] = await Promise.all([demoApi.getLog('demo', '1037'), demoApi.getLog('demo', '1036')]);
      expect(newer.previous_hash).toBe(older.entry_hash);
      expect(newer.entry_hash).not.toBe(older.entry_hash);
    });

    it('moves between tabs with the arrow keys', async () => {
      const user = userEvent.setup();
      renderApp(<App />, { route: '/records/1037' });
      await user.click(await screen.findByRole('tab', { name: 'Stored result' }));
      await user.keyboard('{ArrowRight}');
      const entry = screen.getByRole('tab', { name: 'Audit entry' });
      expect(entry.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(entry);
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'Stored result' }).getAttribute('aria-selected')).toBe('true');
    });

    it('leaves arrow keys with a modifier to the browser', async () => {
      const user = userEvent.setup();
      renderApp(<App />, { route: '/records/1037' });
      await user.click(await screen.findByRole('tab', { name: 'Stored result' }));
      for (const combo of ['{Alt>}{ArrowRight}{/Alt}', '{Control>}{ArrowRight}{/Control}', '{Shift>}{ArrowLeft}{/Shift}']) {
        await user.keyboard(combo);
        expect(screen.getByRole('tab', { name: 'Stored result' }).getAttribute('aria-selected')).toBe('true');
      }
    });

    it('says so for the first entry in the chain', async () => {
      // The oldest sample row.
      renderApp(<App />, { route: '/records/996' });
      expect((await openAuditEntry()).getByText('none: the first entry')).toBeTruthy();
    });

    it('does not call a row outside the chain its first entry', async () => {
      vi.spyOn(demoApi, 'getLog').mockResolvedValue({
        ...olderServerRow,
        entry_hash: null,
        previous_hash: null,
        hmac_signature: null,
      });
      renderApp(<App />, { route: '/records/1' });
      const entry = await openAuditEntry();
      expect(entry.getByText('none: written outside the chain')).toBeTruthy();
      expect(entry.queryByText('none: the first entry')).toBeNull();
      expect(entry.getAllByText('none')).toHaveLength(2);
    });

    it('says not recorded for every field a server before #484 does not send', async () => {
      vi.spyOn(demoApi, 'getLog').mockResolvedValue(olderServerRow);
      renderApp(<App />, { route: '/records/1' });
      expect(await detail('API key')).toBe('not recorded');
      expect(await detail('Version')).toBe('not recorded');
      expect((await openAuditEntry()).getAllByText('not recorded')).toHaveLength(3);
    });
  });

  describe('actions', () => {
    it('copies the record id', async () => {
      const user = userEvent.setup();
      renderApp(<App />, { route: '/records/1037' });
      await user.click(await screen.findByRole('button', { name: 'Copy record id' }));
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
      expect(await navigator.clipboard.readText()).toBe('1037');
    });

    it('shows the id when the browser refuses to copy', async () => {
      const user = userEvent.setup();
      renderApp(<App />, { route: '/records/1037' });
      const button = await screen.findByRole('button', { name: 'Copy record id' });
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
      await user.click(button);
      expect((await screen.findByRole('alert')).textContent).toMatch(/The record id is 1037/);
    });

    it('downloads the record as the server returned it', async () => {
      const user = userEvent.setup();
      const blobs: Blob[] = [];
      const createObjectURL = (b: Blob) => {
        blobs.push(b);
        return 'blob:x';
      };
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('qwed-record-1037.json');
      });
      renderApp(<App />, { route: '/records/1037' });
      await user.click(await screen.findByRole('button', { name: 'Download .json' }));

      expect(click).toHaveBeenCalledTimes(1);
      // The Blob URL is released once the download has started.
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
      const [blob] = blobs;
      if (!blob) throw new Error('No file was saved');
      const saved = JSON.parse(await blob.text()) as AuditLog;
      expect(saved.id).toBe('1037');
      expect(saved.api_key_id).toBe('7');
    });
  });

  it('keeps the record and the key name when a refresh fails, then recovers on Try again', async () => {
    const user = userEvent.setup();
    const getLog = demoApi.getLog.bind(demoApi);
    const listKeys = demoApi.listKeys.bind(demoApi);
    vi.spyOn(demoApi, 'getLog')
      .mockImplementationOnce(getLog)
      .mockRejectedValueOnce(new ApiError(403, 'Insufficient permissions'))
      .mockImplementation(getLog);
    vi.spyOn(demoApi, 'listKeys')
      .mockImplementationOnce(listKeys)
      .mockRejectedValueOnce(new ApiError(403, 'Denied'));
    renderApp(<App />, { route: '/records/1037' });
    expect(await detail('API key')).toBe('payments-agent prod (qwed_live_****x7Qa)');

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByText(/This record could not be refreshed/)).toBeTruthy();
    expect(screen.queryByText('This record could not be loaded')).toBeNull();
    expect(screen.getByRole('heading', { name: '(a + b)**2 = a**2 + b**2' })).toBeTruthy();
    // A key list that loaded once still names the key after its refresh fails.
    expect(await detail('API key')).toBe('payments-agent prod (qwed_live_****x7Qa)');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/This record could not be refreshed/)).toBeNull());
  });
});
