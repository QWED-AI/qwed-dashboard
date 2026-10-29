import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { agentsError, NO_AGENT_LIST, statusClass } from '../lib/agents';
import { formatUtcLong } from '../lib/format';
import { useAuthedQuery, useDataUnlessRefused } from '../lib/useAuthedQuery';

// The organisation's agents (#72), from GET /agents (qwed-verification
// #527): read only, oldest first, every status listed.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const listError = (err: unknown) => agentsError(err, NO_AGENT_LIST);

export function AgentsPage() {
  const agents = useAuthedQuery(['agents'], (api, token) => api.listAgents(token));
  // A failed refresh keeps the agents loaded before; a refusal (403) does not.
  const shown = useDataUnlessRefused(agents);
  const list = shown ?? [];

  return (
    <Shell crumbs={[{ label: 'Agents' }]}>
      <div className="page-head">
        <div>
          <h1 className="h1">Agents</h1>
          <p className="sub">
            The agents registered in your organisation, oldest first, as the server lists them, whatever their status.
            Open one to see what it did. The dashboard never displays an agent’s token.
          </p>
        </div>
      </div>

      {agents.isPending && (
        <div className="state" aria-busy="true">
          <span className="sr-only">Loading agents</span>
          <span className="sk" style={{ width: '60%' }} aria-hidden="true" />
          <span className="sk" style={{ width: '40%' }} aria-hidden="true" />
        </div>
      )}

      {agents.isError && !shown && (
        <div className="state" role="alert">
          <span className="state-icon">
            <Icon name="alert" size={20} />
          </span>
          <h2>The agents could not be loaded</h2>
          <p className="sub">{listError(agents.error)}</p>
          <div>
            <button type="button" className="btn" onClick={() => agents.refetch()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {agents.isRefetchError && shown && (
        <RefreshError what="The agents" error={agents.error} onRetry={() => agents.refetch()} formatError={listError} />
      )}

      {shown && list.length === 0 && (
        <div className="state">
          <span className="state-icon">
            <Icon name="agent" size={20} />
          </span>
          <h2>No agents</h2>
          <p className="sub">No agent is registered in your organisation.</p>
        </div>
      )}

      {shown && list.length > 0 && (
        <section className="card flush" aria-label="Agents" style={{ margin: '0 24px 24px' }}>
          <div className="table-wrap">
            <table className="tbl compact tbl-stack">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created (UTC)</th>
                  <th scope="col">Last active (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link className="row-link" to={`/agents/${encodeURIComponent(String(a.id))}`}>
                        <bdi>{a.name}</bdi>
                      </Link>
                    </td>
                    <td className="cell-small" data-label="Type">
                      {a.type}
                    </td>
                    <td className="cell-small" data-label="Status">
                      <span className={statusClass(a.status)}>{a.status}</span>
                    </td>
                    <td className="mono num muted cell-small" style={{ fontSize: 12 }} data-label="Created">
                      {formatUtcLong(a.created_at)}
                    </td>
                    <td className="mono num muted cell-small" style={{ fontSize: 12 }} data-label="Last active">
                      {a.last_active ? formatUtcLong(a.last_active) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span className="num">{plural(list.length, 'agent', 'agents')} in your organisation.</span>
          </div>
        </section>
      )}
    </Shell>
  );
}
