import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/http';
import type { EntryCheck } from '../api/types';
import { useSession } from '../auth/session';
import { describeError } from '../lib/useAuthedQuery';
import { Icon } from './Icon';

const CHECKS: { key: keyof EntryCheck['checks']; label: string }[] = [
  { key: 'hash_valid', label: 'Entry hash matches its contents' },
  { key: 'signature_valid', label: 'HMAC signature matches' },
  { key: 'chain_valid', label: 'Link to the previous entry holds' },
];

/** The check route authenticates by API key, so a 401 or 403 is about the key, not the session. */
const isKeyRejection = (err: unknown): err is ApiError =>
  err instanceof ApiError && (err.status === 401 || err.status === 403);

function Mark({ ok }: { ok: boolean | undefined }) {
  if (ok === true)
    return (
      <span className="mark pass">
        <Icon name="check" size={12} label="Passed" />
      </span>
    );
  if (ok === false)
    return (
      <span className="mark fail">
        <Icon name="cross" size={12} label="Failed" />
      </span>
    );
  return (
    <span className="mark unknown">
      <Icon name="dash" size={12} label="Not checked" />
    </span>
  );
}

/**
 * Asks the server to check this audit entry (GET /admin/compliance/verify/{id}).
 * That route takes an owner or admin API key, not the session token, so the
 * key is asked for here and kept in memory for this tab only.
 */
export function ChainCheck({ logId }: { logId: string }) {
  const { api, mode, adminKey, setAdminKey } = useSession();
  const [draft, setDraft] = useState('');
  const check = useMutation({
    mutationFn: (key: string) => api.checkEntry(key, logId),
    onError: (err) => {
      // A rejected key is forgotten so the form asks for another one.
      if (mode === 'live' && isKeyRejection(err)) setAdminKey(null);
    },
  });

  const needsKey = mode === 'live' && !adminKey;
  const keyToUse = mode === 'demo' ? 'demo' : adminKey;

  function submitKey(e: FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (!key) return;
    setAdminKey(key);
    setDraft('');
    check.mutate(key);
  }

  const result = check.data;

  return (
    <section className="card" aria-labelledby="chain-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="chain" />
        <h2 id="chain-title">Audit chain entry</h2>
      </div>

      {needsKey ? (
        <form onSubmit={submitKey} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="field">
            Owner or admin API key
            <input
              className="input mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="qwed_live_…"
            />
            <span className="hint">
              The check route takes an API key, not your session. The key stays in this tab's memory and is gone when
              you close it or sign out.
            </span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
            Check this entry
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => keyToUse && check.mutate(keyToUse)}
          disabled={check.isPending}
        >
          {check.isPending ? 'Checking…' : result ? 'Check again' : 'Check this entry'}
        </button>
      )}

      {check.isError && (
        <p className="alert" role="alert">
          {isKeyRejection(check.error)
            ? `The server did not accept this API key: ${check.error.message}. Enter an owner or admin key.`
            : describeError(check.error)}
        </p>
      )}

      {result && (
        <div aria-live="polite">
          <p className="sub" style={{ color: 'var(--ink)', fontWeight: 600, marginBottom: 6 }}>
            {result.valid
              ? 'This entry is intact.'
              : result.legacy
                ? 'This entry was written before the chain existed, so it cannot be checked.'
                : 'This entry failed its check.'}
          </p>
          {CHECKS.map((c) => (
            <div className="check" key={c.key}>
              <Mark ok={result.checks[c.key]} />
              <span>{c.label}</span>
              <span className="mono muted" style={{ fontSize: 11.5 }}>
                {c.key}
              </span>
            </div>
          ))}
          {result.errors.length > 0 && (
            <ul className="sub" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === 'live' && adminKey && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdminKey(null)}>
          <Icon name="key" size={14} />
          Forget the API key
        </button>
      )}
    </section>
  );
}
