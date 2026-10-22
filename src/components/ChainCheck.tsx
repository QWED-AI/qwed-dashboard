import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, sessionNotAccepted } from '../api/http';
import type { ComplianceAuth, EntryCheck } from '../api/types';
import { useSession } from '../auth/session';
import { describeError } from '../lib/useAuthedQuery';
import { Icon } from './Icon';

const CHECKS: { key: keyof EntryCheck['checks']; label: string }[] = [
  { key: 'hash_valid', label: 'Entry hash matches its contents' },
  { key: 'signature_valid', label: 'HMAC signature matches' },
  { key: 'chain_valid', label: 'Link to the previous entry holds' },
];

const isAuthRefusal = (err: unknown): err is ApiError =>
  err instanceof ApiError && (err.status === 401 || err.status === 403);

function Mark({ ok }: Readonly<{ ok: boolean | undefined }>) {
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

function headline(result: EntryCheck): string {
  if (result.valid) return 'This entry is intact.';
  if (result.legacy) return 'This entry was written before the chain existed, so it cannot be checked.';
  return 'This entry failed its check.';
}

/** One sentence for a failed check, by what was refused and how it was called. */
function refusal(err: unknown, auth: ComplianceAuth | undefined): string {
  if (!isAuthRefusal(err)) return describeError(err);
  if (auth && 'apiKey' in auth) {
    return `The server did not accept this API key: ${err.message}. Enter an owner or admin key.`;
  }
  if (err.status === 403) return `Only an owner or admin can check audit entries. The server said: ${err.message}.`;
  return describeError(err);
}

/** The key, once one was entered for a server that takes only keys; else the session. */
export function complianceAuth(adminKey: string | null, token: string | null): ComplianceAuth | null {
  if (adminKey) return { apiKey: adminKey };
  if (token) return { session: token };
  return null;
}

/**
 * Asks the server to check this audit entry (GET /admin/compliance/verify/{id}).
 *
 * A server after #485 takes the signed-in session for owners and admins, so
 * the check runs with it. A server before #485 takes only an owner or admin
 * API key there; it answers the session with 401 "Missing x-api-key header",
 * and the key is then asked for here and kept in memory for this tab only.
 */
export function ChainCheck({ logId }: Readonly<{ logId: string }>) {
  const { api, mode, token, adminKey, setAdminKey } = useSession();
  const [draft, setDraft] = useState('');
  // Set once this server turns the session away: it checks by API key only.
  const [keyOnly, setKeyOnly] = useState(false);
  const check = useMutation({
    mutationFn: (auth: ComplianceAuth) => api.checkEntry(auth, logId),
    onError: (err, auth) => {
      if ('session' in auth && sessionNotAccepted(err)) setKeyOnly(true);
      // A rejected key is forgotten so the form asks for another one.
      if ('apiKey' in auth && isAuthRefusal(err)) setAdminKey(null);
    },
  });

  const needsKey = mode === 'live' && keyOnly && !adminKey;
  const auth = complianceAuth(adminKey, token);

  function submitKey(e: FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (!key) return;
    setAdminKey(key);
    setDraft('');
    check.mutate({ apiKey: key });
  }

  const result = check.data;
  // The session refusal is what switched to the key form; it is not an error to show.
  const showError = check.isError && !(needsKey && sessionNotAccepted(check.error));

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
              This server checks entries with an API key only, not your session. The key stays in this tab's memory
              and is gone when you close it or sign out.
            </span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
            Check this entry
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => auth && check.mutate(auth)}
            disabled={check.isPending || !auth}
          >
            {check.isPending ? 'Checking…' : result ? 'Check again' : 'Check this entry'}
          </button>
          {!adminKey && <span className="hint">Runs with your session. Owners and admins can check entries.</span>}
        </>
      )}

      {showError && (
        <p className="alert" role="alert">
          {refusal(check.error, check.variables)}
        </p>
      )}

      {result && (
        <div aria-live="polite">
          <p className="sub" style={{ color: 'var(--ink)', fontWeight: 600, marginBottom: 6 }}>
            {headline(result)}
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
