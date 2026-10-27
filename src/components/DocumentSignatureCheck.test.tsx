// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import { contextFixtures } from '../test/fixtures/verificationContext';
import { renderApp } from '../test/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const { jwks, documents } = contextFixtures;

/** Opens a record the server stored, at a time its token is still valid. */
async function openStored(name: keyof typeof documents) {
  const row = documents[name].row;
  const token = (JSON.parse(row.verification_result) as { attestation: string }).attestation;
  const payload = token.split('.')[1] ?? '';
  const { iat } = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as { iat: number };
  vi.spyOn(Date, 'now').mockReturnValue((iat + 60) * 1000);
  vi.spyOn(demoApi, 'getLog').mockResolvedValue(row);
  renderApp(<App />, { route: `/records/${row.id}` });
  return within(await screen.findByRole('region', { name: 'Document signature' }));
}

describe('DocumentSignatureCheck', () => {
  it('checks a stored document’s signature with the server’s keys', async () => {
    const keys = vi.spyOn(demoApi, 'getJwks').mockResolvedValue(jwks);
    const user = userEvent.setup();
    const card = await openStored('admitted');
    expect(card.getByText(/it adds nothing to the verdict or the admission/)).toBeTruthy();
    await user.click(card.getByRole('button', { name: 'Check signature' }));
    expect(await card.findByText('The signature checks out: the server issued this document as stored.')).toBeTruthy();
    expect(keys).toHaveBeenCalledTimes(1);
    for (const label of [
      'Signed with the server’s key',
      'Issued by the key’s owner',
      'Covers this document',
      'States the stored verdict',
      'States the stored admission',
      'States the stored proof_ref',
    ]) {
      expect(card.getByText(label)).toBeTruthy();
    }
    expect(card.getByText(jwks.keys[0]?.kid ?? '')).toBeTruthy();
    expect(card.getByRole('button', { name: 'Check again' })).toBeTruthy();
    // A document carries its own signature, not a verdict's attestation.
    expect(screen.queryByRole('region', { name: 'Attestation' })).toBeNull();
  });

  it('says why the stored copy of a document with personal data does not match', async () => {
    vi.spyOn(demoApi, 'getJwks').mockResolvedValue(jwks);
    const user = userEvent.setup();
    const card = await openStored('redacted');
    await user.click(card.getByRole('button', { name: 'Check signature' }));
    expect(await card.findByText('The server signed a document, but not this document as stored.')).toBeTruthy();
    expect(card.getByText(/The server replaced personal data in the copy it stored \(\[EMAIL_REDACTED\]\)/)).toBeTruthy();
  });

  it('says the keys could not be loaded', async () => {
    vi.spyOn(demoApi, 'getJwks').mockRejectedValue(new ApiError(404, 'Not Found'));
    const user = userEvent.setup();
    const card = await openStored('admitted');
    await user.click(card.getByRole('button', { name: 'Check signature' }));
    await waitFor(() =>
      expect(card.getByRole('alert').textContent).toBe(
        'The server’s public keys could not be loaded from /.well-known/jwks.json: the server returned 404: Not Found',
      ),
    );
  });

  it('says a spec 1.0 document carries no signature', async () => {
    // The sample Verification Context record is spec 1.0.
    renderApp(<App />, { route: '/records/1040' });
    const card = within(await screen.findByRole('region', { name: 'Document signature' }));
    expect(card.getByText(/This is a spec 1.0 document, which carries no signature/)).toBeTruthy();
    expect(card.queryByRole('button', { name: 'Check signature' })).toBeNull();
  });

  it('says a spec 1.1 document without a signature has nothing to check', async () => {
    const row = documents.admitted.row;
    const doc = JSON.parse(row.verification_result) as Record<string, unknown>;
    vi.spyOn(demoApi, 'getLog').mockResolvedValue({ ...row, verification_result: JSON.stringify({ ...doc, attestation: null }) });
    renderApp(<App />, { route: `/records/${row.id}` });
    const card = within(await screen.findByRole('region', { name: 'Document signature' }));
    expect(card.getByText(/This spec 1.1 document carries no signature, though the spec requires one/)).toBeTruthy();
  });
});
