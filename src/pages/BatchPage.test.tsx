// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { AuditLog } from '../api/types';
import { renderApp } from '../test/render';
import { BatchPage } from './BatchPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A /verify/batch item row (#477) of job `job`, with its result under details. */
const item = (id: string, job: string, result: object, extra: Partial<AuditLog> = {}): AuditLog => ({
  id,
  request_input: `claim ${id}`,
  verification_result: JSON.stringify({
    batch_job_id: job,
    batch_item_id: `${job}-${id}`,
    batch_item_type: 'math',
    item_status: 'completed',
    details: { result },
  }),
  engine_used: 'MATH',
  status: 'verified',
  created_at: '2026-10-21T10:00:00',
  ...extra,
});

const single = (id: string): AuditLog => ({
  id,
  request_input: `claim ${id}`,
  verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: `message ${id}` }),
  engine_used: 'MATH',
  status: 'verified',
  created_at: '2026-10-21T09:00:00',
});

const jobRows: AuditLog[] = [
  item('14', 'job-a', { status: 'VERIFIED', agent_message: 'The arithmetic holds.' }, { admission: 'ADMIT', created_at: '2026-10-21T10:00:03' }),
  item('13', 'job-b', { status: 'VERIFIED' }, { admission: 'ADMIT', created_at: '2026-10-21T10:00:02' }),
  item('12', 'job-a', { status: 'VERIFIED', agent_message: 'The stated value is wrong.' }, { admission: 'DENY', created_at: '2026-10-21T10:00:02' }),
  item('11', 'job-a', { status: 'UNVERIFIABLE' }, { admission: null, created_at: '2026-10-21T10:00:01' }),
  single('10'),
];

/** The tile's number, by its label. */
function tile(label: string) {
  const tiles = within(screen.getByRole('region', { name: 'This job’s items' }));
  return tiles.getByText(label).closest('.tile')?.querySelector('.tile-value')?.textContent;
}

function Search() {
  return <span data-testid="search">{useLocation().search}</span>;
}

function renderJob(job: string, options: Parameters<typeof renderApp>[1] = {}) {
  return renderApp(
    <Routes>
      <Route
        path="/batches/:jobId"
        element={
          <>
            <BatchPage />
            <Search />
          </>
        }
      />
    </Routes>,
    { route: `/batches/${job}`, ...options },
  );
}

describe('BatchPage', () => {
  it('lists only the loaded records of this job, with its counts', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: jobRows, nextBefore: null });
    renderJob('job-a');
    const items = within(await screen.findByRole('region', { name: 'Items' }));
    expect(items.getByRole('link', { name: 'claim 14' })).toBeTruthy();
    expect(items.getByRole('link', { name: 'claim 12' })).toBeTruthy();
    expect(items.getByRole('link', { name: 'claim 11' })).toBeTruthy();
    expect(items.queryByRole('link', { name: 'claim 13' })).toBeNull(); // another job's item
    expect(items.queryByRole('link', { name: 'claim 10' })).toBeNull(); // not a batch item
    expect(tile('Items')).toBe('3');
    expect(tile('ADMIT')).toBe('1');
    expect(tile('Not admitted (DENY)')).toBe('1');
    expect(tile('Admission not recorded')).toBe('1');
    expect(screen.getByText('Received 21 Oct 10:00:01 to 21 Oct 10:00:03 UTC')).toBeTruthy();
    expect(screen.getByText(/3 items of this job among the newest 5 records/)).toBeTruthy();
  });

  it('keeps each item’s own verdict and message, and does not link the job again', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: jobRows, nextBefore: null });
    renderJob('job-a');
    const link = await screen.findByRole('link', { name: 'claim 12' });
    const row = link.closest('tr');
    if (!row) throw new Error('No row for claim 12');
    expect(within(row).getByText('VERIFIED')).toBeTruthy();
    expect(within(row).getByText('The stated value is wrong.')).toBeTruthy();
    expect(within(row).queryByText(/An item of batch job/)).toBeNull();
    expect(link.getAttribute('href')).toBe('/records/12');
  });

  it('names the API key that sent the job, and opens the ledger on its records', async () => {
    const keyed = jobRows.map((r) => ({ ...r, api_key_id: '7' }));
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: keyed, nextBefore: null });
    vi.spyOn(demoApi, 'listKeys').mockResolvedValue([
      { id: '7', name: 'nightly-batch', key_preview: 'qwed_…7a', created_at: '2026-10-01T00:00:00', last_used_at: null, is_revoked: false },
    ]);
    renderJob('job-a');
    const key = await screen.findByRole('link', { name: 'nightly-batch' });
    expect(key.getAttribute('href')).toBe('/ledger?key=7');
    expect(key.closest('.tag')?.textContent).toBe('API key nightly-batch');
  });

  it('lists every key it finds, and says when none was recorded', async () => {
    const mixed = jobRows.map((r, i) => ({ ...r, api_key_id: i === 0 ? '9' : '7' }));
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: mixed, nextBefore: null });
    vi.spyOn(demoApi, 'listKeys').mockResolvedValue([]);
    renderJob('job-a');
    const first = await screen.findByRole('link', { name: 'Key 9' });
    expect(first.closest('.tag')?.textContent).toBe('API keys Key 9, Key 7');
    cleanup();
    // A row before qwed-verification #484, or one sent without a key.
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: jobRows, nextBefore: null });
    renderJob('job-a');
    expect(await screen.findByText('API key not recorded')).toBeTruthy();
  });

  it('shows only the items not admitted when asked, and keeps that in the address', async () => {
    const user = userEvent.setup();
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: jobRows, nextBefore: null });
    renderJob('job-a');
    await screen.findByRole('link', { name: 'claim 14' });
    await user.click(screen.getByRole('checkbox', { name: 'Show only the items not admitted' }));
    expect(screen.getByTestId('search').textContent).toBe('?admission=DENY');
    const items = within(screen.getByRole('region', { name: 'Items' }));
    expect(items.getByRole('link', { name: 'claim 12' })).toBeTruthy();
    expect(items.queryByRole('link', { name: 'claim 14' })).toBeNull();
    expect(items.queryByRole('link', { name: 'claim 11' })).toBeNull();
    // The counts are the job's, not the filter's.
    expect(tile('Items')).toBe('3');
    await user.click(screen.getByRole('checkbox', { name: 'Show only the items not admitted' }));
    expect(screen.getByTestId('search').textContent).toBe('');
    expect(items.getByRole('link', { name: 'claim 14' })).toBeTruthy();
  });

  it('says so when no item of the job was stored with DENY', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: jobRows, nextBefore: null });
    renderJob('job-b', { route: '/batches/job-b?admission=DENY' });
    expect(await screen.findByText('No item of this job was stored with DENY.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says when no loaded record has the job, and loads older ones on request', async () => {
    const user = userEvent.setup();
    const listLogs = vi
      .spyOn(demoApi, 'listLogs')
      .mockResolvedValueOnce({ logs: [single('30')], nextBefore: '30' })
      .mockResolvedValueOnce({ logs: jobRows, nextBefore: null });
    renderJob('job-a');
    expect(await screen.findByText('No item of this job is among the loaded records')).toBeTruthy();
    expect(screen.getByText(/The newest 1 record hold none with this job id/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Load 200 older records' }));
    expect(await screen.findByRole('link', { name: 'claim 14' })).toBeTruthy();
    expect(listLogs).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/3 items of this job among the newest 6 records/)).toBeTruthy();
  });

  it('says why when the records cannot be loaded', async () => {
    vi.spyOn(demoApi, 'listLogs').mockRejectedValue(new ApiError(500, 'Server error'));
    renderJob('job-a');
    expect(await screen.findByText('The records could not be loaded')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('exports the shown items for an owner or admin only', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: jobRows, nextBefore: null });
    for (const role of ['owner', 'admin']) {
      renderJob('job-a', { role });
      await screen.findByRole('link', { name: 'claim 14' });
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy();
      cleanup();
    }
    for (const role of ['member', 'viewer']) {
      renderJob('job-a', { role });
      await screen.findByRole('link', { name: 'claim 14' });
      expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
      expect(screen.getByText('An owner or admin of your organisation can export these items as CSV.')).toBeTruthy();
      cleanup();
    }
  });

  it('saves only the items shown', async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', { ...URL, createObjectURL: (b: Blob) => (blobs.push(b), 'blob:x'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: jobRows, nextBefore: null });
    renderJob('job-a', { route: '/batches/job-a?admission=DENY' });
    await screen.findByRole('link', { name: 'claim 12' });
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    const [blob] = blobs;
    if (!blob) throw new Error('No file was saved');
    const text = await blob.text();
    expect(text).toContain('claim 12');
    expect(text).not.toContain('claim 14');
    expect(text).not.toContain('claim 11');
  });
});

describe('BatchPage with a qwed-verification 8.0.0 server', () => {
  // The rows a local 8.0.0 server wrote for one POST /verify/batch, as
  // GET /audit/logs listed them, with the attestations and developer fields
  // left out. The SQL item failed, so it has no result, verdict or admission.
  const served = (id: string, input: string, engine: string, row: object, extra: Partial<AuditLog>): AuditLog => ({
    id,
    request_input: input,
    verification_result: JSON.stringify({ batch_job_id: '9b67d841', ...row }),
    engine_used: engine,
    status: 'blocked',
    created_at: '2026-10-27T06:21:59.804201+00:00',
    api_key_id: '1',
    verifier_version: '8.0.0',
    ...extra,
  });
  const ok = (result: object) => ({ item_status: 'completed', details: { result, error: null } });
  const rows: AuditLog[] = [
    served('59', 'import os\nos.system(input())', 'CODE',
      { batch_item_id: '9b67d841-3', batch_item_type: 'code', verdict: 'VERIFIED', ...ok({ status: 'VERIFIED', agent_message: 'The code failed security verification and is not safe to use.', proof_ref: 'sha256:b221', is_authoritative: true, admission: 'BLOCKED' }) },
      { verdict: 'VERIFIED', admission: 'BLOCKED' }),
    served('58', '2 + 2 = 4', 'MATH',
      { batch_item_id: '9b67d841-0', batch_item_type: 'math', verdict: 'VERIFIED', ...ok({ status: 'VERIFIED', agent_message: 'Identity verified', proof_ref: 'sha256:f615', is_authoritative: true, admission: 'ADMIT' }) },
      { verdict: 'VERIFIED', admission: 'ADMIT', status: 'verified', created_at: '2026-10-27T06:21:59.784498+00:00' }),
    served('57', '2 + 2 = 5', 'MATH',
      { batch_item_id: '9b67d841-1', batch_item_type: 'math', verdict: 'UNVERIFIABLE', ...ok({ status: 'UNVERIFIABLE', agent_message: 'Not equal: 4 != 5', proof_ref: null, is_authoritative: false, admission: 'BLOCKED' }) },
      { verdict: 'UNVERIFIABLE', admission: 'BLOCKED', created_at: '2026-10-27T06:21:59.760454+00:00' }),
    served('56', 'SELECT id FROM orders', 'SQL',
      { batch_item_id: '9b67d841-2', batch_item_type: 'sql', item_status: 'failed', verdict: null, details: { result: null, error: "Missing 'schema_ddl'" } },
      { verdict: null, admission: null, created_at: '2026-10-27T06:21:59.719007+00:00' }),
  ];

  it('lists the job’s items with the verdicts and admissions the server stored', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: rows, nextBefore: null });
    vi.spyOn(demoApi, 'listKeys').mockResolvedValue([]);
    renderJob('9b67d841');
    await screen.findByRole('link', { name: '2 + 2 = 4' });
    expect(tile('Items')).toBe('4');
    expect(tile('ADMIT')).toBe('1');
    // A stored BLOCKED is a DENY, whatever the verdict.
    expect(tile('Not admitted (DENY)')).toBe('2');
    expect(tile('Admission not recorded')).toBe('1');
    expect(screen.getByText('Received 27 Oct 06:21:59 to 27 Oct 06:21:59 UTC')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Key 1' }).getAttribute('href')).toBe('/ledger?key=1');
    const failed = screen.getByRole('link', { name: 'SELECT id FROM orders' }).closest('tr');
    if (!failed) throw new Error('No row for the SQL item');
    expect(within(failed).getByText('No message recorded')).toBeTruthy();
    expect(within(failed).getByText('The dashboard notes: This batch item failed: Missing \'schema_ddl\'')).toBeTruthy();
    // A completed item has nothing to note.
    const done = screen.getByRole('link', { name: '2 + 2 = 4' }).closest('tr');
    expect(done && within(done).queryByText(/The dashboard notes/)).toBeNull();
  });
});

describe('Batch job links', () => {
  it('links a batch item’s ledger row to its job', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: jobRows, nextBefore: null });
    renderApp(<App />, { route: '/ledger' });
    const row = (await screen.findByRole('link', { name: 'claim 12' })).closest('tr');
    if (!row) throw new Error('No row for claim 12');
    const job = within(row).getByRole('link', { name: 'job-a' });
    expect(job.getAttribute('href')).toBe('/batches/job-a');
    expect(job.parentElement?.textContent).toBe('An item of batch job job-a');
    // A record from any other route has no job.
    const other = (await screen.findByRole('link', { name: 'claim 10' })).closest('tr');
    if (!other) throw new Error('No row for claim 10');
    expect(within(other).queryByText(/An item of batch job/)).toBeNull();
  });

  it('escapes a job id in the link', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: [item('1', 'a/b?c', { status: 'VERIFIED' })], nextBefore: null });
    renderApp(<App />, { route: '/ledger' });
    const job = await screen.findByRole('link', { name: 'a/b?c' });
    expect(job.getAttribute('href')).toBe('/batches/a%2Fb%3Fc');
  });

  it('opens the sample job from a sample record’s details', async () => {
    const user = userEvent.setup();
    renderApp(<App />, { route: '/records/1014' });
    const details = within(await screen.findByRole('region', { name: 'Record details' }));
    const job = details.getByRole('link', { name: 'sample-batch-1017' });
    await user.click(job);
    expect(await screen.findByRole('heading', { name: /Batch job/ })).toBeTruthy();
    await waitFor(() => expect(tile('Items')).toBe('4'));
    expect(tile('ADMIT')).toBe('2');
    expect(tile('Not admitted (DENY)')).toBe('2');
  });
});
