import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/http';
import type { ApiKeyCreated } from '../api/types';
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

export function KeysPage() {
  const { api, token, signOut } = useSession();
  const keys = useAuthedQuery(['keys'], (a, t) => a.listKeys(t));
  const [name, setName] = useState('');
  // The full key exists only here, until it is dismissed or the page is left.
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const onAuthError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) signOut();
  };

  const create = useMutation({
    mutationFn: (keyName: string) => api.createKey(token as string, keyName),
    onSuccess: (res) => {
      setCreated(res);
      setCopied(false);
      setCopyFailed(false);
      setName('');
      void keys.refetch();
    },
    onError: onAuthError,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeKey(token as string, id),
    onSuccess: (_res, id) => {
      setConfirmId(null);
      // Do not keep showing a key that no longer works.
      setCreated((c) => (c?.id === id ? null : c));
      void keys.refetch();
    },
    onError: onAuthError,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) create.mutate(trimmed);
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
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || create.isPending}>
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
            <strong>{created.name} is ready.</strong> Copy the key now. It will not be shown again, and the server
            cannot show it to you later.
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
          <table className="tbl" style={{ minWidth: 760 }}>
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
                  <td className="mono num muted" style={{ fontSize: 12 }}>
                    {formatUtcLong(k.created_at)}
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {k.last_used_at ? formatUtcLong(k.last_used_at) : 'No use recorded'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {confirmId === k.id ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>Calls with this key will fail.</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(k.id)}
                        >
                          {revoke.isPending ? 'Revoking…' : 'Revoke'}
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setConfirmId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`Revoke ${k.name}`}
                        onClick={() => {
                          revoke.reset();
                          setConfirmId(k.id);
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {revoke.isError && (
            <p className="alert" role="alert" style={{ margin: '12px 24px' }}>
              {actionError(revoke.error)}
            </p>
          )}
        </div>
      )}

      <p className="sub" style={{ padding: '14px 24px 24px', fontSize: 12.5 }}>
        Revoked keys drop off this list. Last used is the most recent request the key made, kept to the minute; a server
        before qwed-verification #486 does not record it, so there every key reads "No use recorded". Rotation, owners
        and expiry dates will follow once the server returns them.
      </p>
    </Shell>
  );
}
