import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { ApiError, sessionNotAccepted } from '../api/http';
import type { ApiKeyItem } from '../api/types';
import { useSession } from '../auth/session';
import { Icon } from '../components/Icon';
import { Shell } from '../components/Shell';
import { formatUtcLong } from '../lib/format';
import { describeError, useAuthedQuery } from '../lib/useAuthedQuery';

const NAME_MAX = 80;

function actionError(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return 'Your role cannot do this.';
  return describeError(err);
}

/** Why a rotation failed. The server's 403 says which of its rules refused it, so it is shown as the server wrote it. */
function rotateError(err: unknown): string {
  if (sessionNotAccepted(err)) {
    return 'This server rotates a key only with an API key, not a signed-in session. Rotating from the dashboard needs a qwed-verification release with #505.';
  }
  if (err instanceof ApiError && err.status === 403) return `The server refused: ${err.message}.`;
  if (err instanceof ApiError && err.status === 404) return 'The server no longer has this key: it was revoked or rotated already.';
  return describeError(err);
}

/** A full key, shown once: one just created, or the replacement of one just rotated. */
interface OneTimeKey {
  id: string;
  heading: string;
  key: string;
}

type Confirm = { id: string; action: 'revoke' | 'rotate' };

export function KeysPage() {
  const { api, token, user, signOut } = useSession();
  // The server lets a viewer revoke its own key but not rotate one.
  const canRotate = user?.role !== 'viewer';
  const keys = useAuthedQuery(['keys'], (a, t) => a.listKeys(t));
  const [name, setName] = useState('');
  // The full key exists only here, until it is dismissed or the page is left.
  const [created, setCreated] = useState<OneTimeKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // A server before #505 refuses the session for rotation with a 401: that is
  // not the end of the session.
  const onAuthError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401 && !sessionNotAccepted(err)) signOut();
  };

  function showOnce(key: OneTimeKey) {
    setCreated(key);
    setCopied(false);
    setCopyFailed(false);
  }

  const create = useMutation({
    mutationFn: (keyName: string) => api.createKey(token as string, keyName),
    onSuccess: (res) => {
      showOnce({ id: res.id, heading: `${res.name} is ready.`, key: res.key });
      setName('');
      void keys.refetch();
    },
    onError: onAuthError,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeKey(token as string, id),
    onSuccess: (_res, id) => {
      setConfirm(null);
      // Do not keep showing a key that no longer works.
      setCreated((c) => (c?.id === id ? null : c));
      void keys.refetch();
    },
    onError: onAuthError,
  });

  const rotate = useMutation({
    mutationFn: (key: ApiKeyItem) => api.rotateKey(token as string, key.id),
    onSuccess: (res, key) => {
      setConfirm(null);
      // The old key no longer works, so its replacement takes its place here too.
      showOnce({ id: res.newKeyId, heading: `${key.name} was rotated. The old key no longer works.`, key: res.newKey });
      void keys.refetch();
    },
    onError: (err, key) => {
      onAuthError(err);
      // A key already gone drops off the list, and its shown secret, if any, no longer works.
      if (err instanceof ApiError && err.status === 404) {
        setCreated((c) => (c?.id === key.id ? null : c));
        void keys.refetch();
      }
    },
  });

  // One full key can be shown, and the server shows it only once. While one
  // is shown and not yet saved, nothing may replace it, except rotating that
  // same key, whose shown secret no longer works; nor may two requests that
  // each make a key overlap.
  const busy = create.isPending || rotate.isPending;
  const holdsOther = (id: string | null) => created !== null && created.id !== id;

  function ask(id: string, action: Confirm['action']) {
    revoke.reset();
    rotate.reset();
    setConfirm({ id, action });
  }

  function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && !busy && !created) create.mutate(trimmed);
  }

  async function copyKey() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      // Clipboard access can be refused (permissions, insecure origin).
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <Shell crumbs={[{ label: 'Settings' }, { label: 'API keys' }]}>
      <div className="page-head">
        <div>
          <h1 className="h1">API keys</h1>
          <p className="sub">
            Keys call the verify routes for your organisation. The full key is shown once, when it is created. The
            server keeps only a keyed hash of it.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="filters" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 280px' }}>
          <span>New key name</span>
          <input
            className="input"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example: invoice pipeline"
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy || created !== null}>
          <Icon name="plus" size={14} />
          {create.isPending ? 'Creating…' : 'Create key'}
        </button>
      </form>
      {create.isError && (
        <p className="alert" role="alert" style={{ margin: '0 24px 14px' }}>
          {actionError(create.error)}
        </p>
      )}

      {created && (
        <output className="note" style={{ margin: '0 24px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span>
            <strong>{created.heading}</strong> Copy the key now. It will not be shown again, and the server
            cannot show it to you later. Creating or rotating another key waits until you have saved this one.
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <code className="mono" style={{ fontSize: 12.5, color: 'var(--ink)', background: 'var(--sheet)', boxShadow: 'inset 0 0 0 1px var(--line-strong)', borderRadius: 8, padding: '8px 10px', overflowWrap: 'anywhere' }}>
              {created.key}
            </code>
            <button type="button" className="btn btn-sm" onClick={copyKey}>
              <Icon name="copy" size={14} />
              {copied ? 'Copied' : 'Copy'}
            </button>
            {copyFailed && (
              <span role="alert" style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                The browser did not allow copying. Select the key and copy it by hand.
              </span>
            )}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreated(null)}>
              I have saved it
            </button>
          </div>
        </output>
      )}

      {keys.isPending && (
        <div className="state" aria-busy="true">
          <span className="sk" style={{ width: '60%' }} />
          <span className="sk" style={{ width: '45%' }} />
        </div>
      )}

      {keys.isError && (
        <div className="state" role="alert">
          <h2>The keys could not be loaded</h2>
          <p className="sub">{actionError(keys.error)}</p>
        </div>
      )}

      {keys.isSuccess && keys.data.length === 0 && (
        <div className="state">
          <span className="state-icon">
            <Icon name="key" size={20} />
          </span>
          <h2>No active keys</h2>
          <p className="sub">Create a key above to start calling the verify routes.</p>
        </div>
      )}

      {keys.isSuccess && keys.data.length > 0 && (
        <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
          <table className="tbl compact tbl-stack">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Key</th>
                <th scope="col">Created (UTC)</th>
                <th scope="col">Last used</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.data.map((k) => (
                <tr key={k.id}>
                  <td style={{ color: 'var(--ink)', fontWeight: 500 }}>{k.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {k.key_preview}
                  </td>
                  <td className="mono num muted cell-small" style={{ fontSize: 12 }} data-label="Created">
                    {formatUtcLong(k.created_at)}
                  </td>
                  <td className="muted cell-small" style={{ fontSize: 12.5 }} data-label="Last used">
                    {k.last_used_at ? formatUtcLong(k.last_used_at) : 'No use recorded'}
                  </td>
                  <td className="cell-end">
                    {confirm?.id === k.id && confirm.action === 'revoke' && (
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>Calls with this key will fail.</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(k.id)}
                        >
                          {revoke.isPending ? 'Revoking…' : 'Revoke'}
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setConfirm(null)}>
                          Cancel
                        </button>
                      </span>
                    )}
                    {confirm?.id === k.id && confirm.action === 'rotate' && (
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--ink)', maxWidth: 360 }}>
                          The server revokes this key and makes a new one in its place. Callers still sending the old key
                          are refused until they have the new one.
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={busy || holdsOther(k.id)}
                          onClick={() => rotate.mutate(k)}
                        >
                          {rotate.isPending ? 'Rotating…' : 'Rotate'}
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setConfirm(null)}>
                          Cancel
                        </button>
                      </span>
                    )}
                    {confirm?.id !== k.id && (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        {canRotate && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            aria-label={`Rotate ${k.name}`}
                            disabled={busy || holdsOther(k.id)}
                            onClick={() => ask(k.id, 'rotate')}
                          >
                            Rotate
                          </button>
                        )}
                        <button type="button" className="btn btn-sm" aria-label={`Revoke ${k.name}`} onClick={() => ask(k.id, 'revoke')}>
                          Revoke
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Outside the list, so a refresh that empties it does not hide why. */}
      {revoke.isError && (
        <p className="alert" role="alert" style={{ margin: '12px 24px' }}>
          {actionError(revoke.error)}
        </p>
      )}
      {rotate.isError && (
        <p className="alert" role="alert" style={{ margin: '12px 24px' }}>
          {rotateError(rotate.error)}
        </p>
      )}

      <p className="sub" style={{ padding: '14px 24px 24px', fontSize: 12.5 }}>
        Revoked keys drop off this list. Last used is the most recent request the key made, kept to the minute; a server
        before qwed-verification #486 does not record it, so there every key reads "No use recorded". Rotate replaces a
        key with a new one named after it. Anyone but a viewer can rotate their own key, and an owner or admin can
        rotate another user's, unless that user ranks higher. Owners and expiry dates will follow once the server
        returns them.
      </p>
    </Shell>
  );
}
