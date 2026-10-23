import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { ApiKeyItem, AuditLog, Verdict } from '../api/types';
import { ChainCheck } from '../components/ChainCheck';
import { Icon } from '../components/Icon';
import { JsonView } from '../components/JsonView';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { VerdictChip } from '../components/VerdictChip';
import { formatUtcLong } from '../lib/format';
import { toRecord, type ParsedResult } from '../lib/result';
import { describeError, useAuthedQuery } from '../lib/useAuthedQuery';

// Laid out as the RecordCore wireframe: what was checked and how it came
// out first, then the stored result and audit entry, with the reason, the
// checks and what to do next beside them. The exception, policy and route
// parts of that wireframe belong to the enterprise console and are left out.

const SHAPE_LABEL = {
  diagnostic: 'Engine result (DiagnosticResult)',
  'verification-context': 'Verification Context document',
  'batch-item': 'Batch item (engine result inside)',
  truncated: 'Shortened by the server',
  unknown: 'Unrecognised',
} as const;

/** The key-list query as the caller label needs it. */
interface KeyList {
  status: 'pending' | 'error' | 'success';
  data: ApiKeyItem[] | undefined;
}

/** The key that made a row, by name when the key list has it (#484). */
function keyLabel(keyId: string | null | undefined, keys: KeyList): string {
  if (keyId === undefined || keyId === null) return 'not recorded';
  // A list that loaded once is still a list when a later refresh fails.
  if (!keys.data) {
    return keys.status === 'error' ? `Key ${keyId} (the key list could not be loaded)` : `Key ${keyId}`;
  }
  const key = keys.data.find((k) => k.id === keyId);
  if (key) return `${key.name} (${key.key_preview})`;
  // The list holds active keys only, and only your own unless you are an
  // admin or owner, so a revoked or another member's key is not in it.
  return `Key ${keyId}, not in your key list`;
}

/** One stored chain field: absent on an older server, null when the row has none. */
function chainValue(value: string | null | undefined, none: string): string {
  if (value === undefined) return 'not recorded';
  return value ?? none;
}

/**
 * What a reader can do next, by the stored verdict. Guidance only: it never
 * says whether the claim holds or was admitted, which only the verifier's
 * message and a stored admission can say.
 */
const NEXT: Record<Verdict | 'none', { title: string; text: string }> = {
  VERIFIED: {
    title: 'Read what the verifier said',
    text: 'VERIFIED means the check ran to a proof, not that the claim holds: a disproven claim is VERIFIED too. The reason above says which. Download the record with its audit entry when someone asks for evidence.',
  },
  UNVERIFIABLE: {
    title: 'A person can look',
    text: 'The verifier could not decide with what it was given. Check the claim by hand, or send the request again with what was missing. A new request gets a new record; this one stays as it is.',
  },
  BLOCKED: {
    title: 'Send a new request',
    text: 'The verifier refused the request or could not check it. Fix the input and send it again. A new request gets a new record; this one stays as it is.',
  },
  none: {
    title: 'No readable verdict',
    text: 'The stored result has no verdict the dashboard can read. The stored result tab shows it exactly as the server keeps it.',
  },
};

const TABS = [
  { id: 'result', label: 'Stored result' },
  { id: 'entry', label: 'Audit entry' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Saves the record, as the server returned it, as a JSON file. */
function downloadRecord(log: AuditLog) {
  const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qwed-record-${log.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyId({ id }: Readonly<{ id: string }>) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setState('copied');
    } catch {
      // Clipboard access can be refused (permissions, insecure origin).
      setState('failed');
    }
  }
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={copy}>
        <Icon name={state === 'copied' ? 'check' : 'copy'} size={14} />
        {state === 'copied' ? 'Copied' : 'Copy record id'}
      </button>
      {state === 'failed' && (
        <span className="hint" role="alert">
          The browser did not allow copying. The record id is {id}.
        </span>
      )}
    </>
  );
}

function Tabs({ tab, onChange }: Readonly<{ tab: TabId; onChange: (t: TabId) => void }>) {
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({ result: null, entry: null });
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    // Alt+Arrow is back and forward in some browsers; leave modified keys alone.
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    if (!next) return;
    onChange(next.id);
    refs.current[next.id]?.focus();
  }
  return (
    // The keys are handled on each tab, the element that has focus.
    <div role="tablist" aria-label="Record views" className="tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.id)}
          onKeyDown={onKey}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function AuditEntry({ log }: Readonly<{ log: AuditLog }>) {
  return (
    <>
      <p className="sub" style={{ fontSize: 12.5 }}>
        The chained row as the server stored it. The entry hash covers the row's fields, its stored result and the
        link to the previous entry; the HMAC signs the entry hash.
      </p>
      <dl className="kv">
        <dt>entry_hash</dt>
        <dd className="mono" style={{ fontSize: 11.5 }}>
          {chainValue(log.entry_hash, 'none: written outside the chain')}
        </dd>
        <dt>previous_hash</dt>
        <dd className="mono" style={{ fontSize: 11.5 }}>
          {/* Only a row in the chain can be its first entry. */}
          {chainValue(log.previous_hash, log.entry_hash ? 'none: the first entry' : 'none')}
        </dd>
        <dt>HMAC</dt>
        <dd className="mono" style={{ fontSize: 11.5 }}>
          {chainValue(log.hmac_signature, 'none')}
        </dd>
      </dl>
      <p className="hint">The check beside this recomputes these values on the server.</p>
    </>
  );
}

/**
 * What the dashboard can say about the result's proof_ref. The verdict may
 * come from the server while the stored result cannot be read here (it was
 * shortened, or is in no known shape), so an absent proof_ref is only called
 * absent when the result could be read.
 */
function proofRefState(result: ParsedResult): { title: string; text: string } {
  if (result.proofRef) {
    return {
      title: 'proof_ref present',
      text: 'A hash of the evidence the engine produced. A VERIFIED result always carries one.',
    };
  }
  if (result.shape === 'truncated' || result.shape === 'unknown') {
    return {
      title: 'proof_ref not readable',
      text: 'The stored result is shortened or not in a shape the dashboard reads, so its proof_ref cannot be shown.',
    };
  }
  if (result.verdict === 'VERIFIED') {
    return {
      title: 'No proof_ref recorded',
      text: 'A VERIFIED result should carry one, but this stored result has none.',
    };
  }
  return { title: 'No proof_ref', text: 'Only a VERIFIED result carries one.' };
}

/** The admission as the Checks list shows it, with the stored word when it differs. */
function admissionValue(result: ParsedResult): string {
  if (result.admission && result.admissionStored) return `${result.admission} (stored as ${result.admissionStored})`;
  if (result.admission) return result.admission;
  if (result.admissionStored) return `${result.admissionStored} (not an admission the dashboard knows)`;
  return 'not recorded';
}

/** Why the admission reads as it does, when that needs saying. */
function AdmissionNote({ result }: Readonly<{ result: ParsedResult }>) {
  if (result.admission && result.admissionStored) {
    return (
      <p className="note">
        <strong>Shown as {result.admission}.</strong> The server stored this admission as {result.admissionStored}, the
        verify routes’ word for the decision a Verification Context calls DENY (qwed-verification #324). The stored
        result and the download keep what the server sent.
      </p>
    );
  }
  if (result.admissionStored) {
    return (
      <p className="note">
        <strong>Not an admission the dashboard knows.</strong> The server stored “{result.admissionStored}”, which is
        not ADMIT, DENY or BLOCKED, so it is shown as stored and not as a decision.
      </p>
    );
  }
  if (result.admission === null && result.shape !== 'verification-context') {
    return (
      <p className="note">
        <strong>Why admission is not recorded.</strong> The server keeps the admission its route decided with each
        record (qwed-verification #307). This route decides none (logic, stats, fact, image, RAG, process and consensus
        do not), or the record was written before the server kept one.
      </p>
    );
  }
  return null;
}

function Checks({ result }: Readonly<{ result: ParsedResult }>) {
  const proof = proofRefState(result);
  return (
    <section className="card" aria-labelledby="checks-title">
      <h2 id="checks-title">Checks</h2>
      <div className="check">
        <span className={result.proofRef ? 'mark pass' : 'mark unknown'}>
          <Icon name={result.proofRef ? 'check' : 'dash'} size={12} />
        </span>
        <div>
          <strong style={{ fontSize: 13 }}>{proof.title}</strong>
          <p className="hint" style={{ margin: '2px 0 0' }}>
            {proof.text}
          </p>
          {result.proofRef && (
            <p className="mono" style={{ margin: '4px 0 0', fontSize: 11.5, overflowWrap: 'anywhere' }}>
              {result.proofRef}
            </p>
          )}
        </div>
      </div>
      <dl className="kv">
        <dt>Admission</dt>
        <dd className="mono" style={{ fontSize: 12 }}>
          {admissionValue(result)}
        </dd>
        <dt>Authoritative</dt>
        <dd className="mono" style={{ fontSize: 12 }}>
          {result.isAuthoritative === null ? 'not recorded' : String(result.isAuthoritative)}
        </dd>
      </dl>
      <AdmissionNote result={result} />
    </section>
  );
}

export function RecordPage() {
  const { id = '' } = useParams();
  const log = useAuthedQuery(['log', id], (api, token) => api.getLog(token, id));
  // Only to name the key; a role that cannot list keys still sees the id.
  const keys = useAuthedQuery(['keys'], (api, token) => api.listKeys(token));
  const [tab, setTab] = useState<TabId>('result');
  const crumbs = [{ label: 'Decision ledger', to: '/ledger' }, { label: `Record ${id}` }];

  if (log.isPending) {
    return (
      <Shell crumbs={crumbs}>
        <div className="state" aria-busy="true">
          <span className="sk" style={{ width: 180, height: 22 }} />
          <span className="sk" style={{ width: '70%', height: 18 }} />
          <span className="sk" style={{ width: '40%' }} />
        </div>
      </Shell>
    );
  }

  // No data after loading means the first load failed. A failed refresh keeps
  // the record and shows a warning above it instead.
  if (!log.data) {
    return (
      <Shell crumbs={crumbs}>
        <div className="state" role="alert">
          <span className="state-icon">
            <Icon name="alert" size={20} />
          </span>
          <h2>This record could not be loaded</h2>
          <p className="sub">{describeError(log.error)}</p>
          <div>
            <Link className="btn" to="/ledger">
              Back to the ledger
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const data = log.data;
  const r = toRecord(data);
  const { result } = r;
  const multiline = r.query.includes('\n');
  const next = NEXT[result.verdict ?? 'none'];
  const noKey = data.api_key_id === null || data.api_key_id === undefined;

  return (
    <Shell crumbs={crumbs}>
      {log.isRefetchError && (
        <div style={{ paddingTop: 16 }}>
          <RefreshError what="This record" error={log.error} onRetry={() => log.refetch()} />
        </div>
      )}
      <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <VerdictChip verdict={result.verdict} admission={result.admission} admissionStored={result.admissionStored} large />
          <span className="spacer" />
          <CopyId id={r.id} />
          <button type="button" className="btn btn-sm" onClick={() => downloadRecord(data)}>
            Download .json
          </button>
          <Link className="btn btn-sm" to="/ledger">
            <Icon name="back" size={14} />
            Ledger
          </Link>
        </div>
        <h1 className={multiline ? 'statement code' : 'statement'}>{r.query}</h1>
        <section aria-label="Record details">
          <dl className="meta-row">
            <div className="meta">
              <dt className="k">Record</dt>
              <dd className="v mono" style={{ fontSize: 12 }}>
                {r.id}
              </dd>
            </div>
            <div className="meta">
              <dt className="k">Verifier</dt>
              <dd className="v">{r.domain.toLowerCase()}</dd>
            </div>
            <div className="meta">
              <dt className="k">Version</dt>
              <dd className="v mono" style={{ fontSize: 12 }}>
                {data.verifier_version ?? 'not recorded'}
              </dd>
            </div>
            <div className="meta">
              <dt className="k">API key</dt>
              <dd className="v">{keyLabel(data.api_key_id, { status: keys.status, data: keys.data })}</dd>
            </div>
            <div className="meta">
              <dt className="k">Received</dt>
              <dd className="v mono num" style={{ fontSize: 12 }}>
                {formatUtcLong(r.createdAt)}
              </dd>
            </div>
            <div className="meta">
              <dt className="k">Stored as</dt>
              <dd className="v">{SHAPE_LABEL[result.shape]}</dd>
            </div>
          </dl>
          {noKey && (
            <p className="hint" style={{ margin: '10px 0 0' }}>
              No API key is recorded for this row. The server records the key on rows it writes for an API key request;
              a row written before it did, or without a key (a signed-in session, an agent token), has none.
            </p>
          )}
        </section>
      </div>

      <div className="split">
        <section className="main" aria-label="Record">
          <Tabs tab={tab} onChange={setTab} />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'result' ? (
              <>
                <p className="sub" style={{ fontSize: 12.5, marginBottom: 10 }}>
                  The result the verifier returned, exactly as the server stored it in the audit row.
                </p>
                <JsonView value={result.value} fallback={r.raw} label="Stored result JSON" />
              </>
            ) : (
              <AuditEntry log={data} />
            )}
          </div>
        </section>

        <aside className="aside" aria-label="Details and checks">
          <section aria-labelledby="why-title" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 id="why-title" className="sub" style={{ fontSize: 12, fontWeight: 400 }}>
              Why
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }}>
              {result.agentMessage ?? 'No message recorded.'}
            </p>
            {result.error && <p className="note">{result.error}</p>}
          </section>

          <section className="card" aria-labelledby="next-title">
            <h2 id="next-title">{next.title}</h2>
            <p className="sub">{next.text}</p>
          </section>

          <Checks result={result} />
          <ChainCheck logId={r.id} />
        </aside>
      </div>
    </Shell>
  );
}
