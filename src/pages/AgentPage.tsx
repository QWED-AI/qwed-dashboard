import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { agentsError, cost, NO_SUCH_AGENT, statusClass } from '../lib/agents';
import { formatUtcLong } from '../lib/format';
import { useAuthedQuery, useDataUnlessRefused } from '../lib/useAuthedQuery';

// One agent's activity (#72), from GET /agents/{agent_id}/activity read with
// the owner's session (qwed-verification #527), newest first. The route
// returns at most 200 activities.

const FIRST = 50;
const MOST = 200;
const activityError = (err: unknown) => agentsError(err, NO_SUCH_AGENT);

export function AgentPage() {
  const { agentId = '' } = useParams();
  const [limit, setLimit] = useState(FIRST);
  const activity = useAuthedQuery(['agent-activity', agentId, limit], (api, token) =>
    api.agentActivity(token, agentId, limit),
  );
  // A failed refresh keeps the activity loaded before; a refusal (403) does not.
  const data = useDataUnlessRefused(activity);

  return (
    <Shell crumbs={[{ label: 'Agents', to: '/agents' }, { label: data?.agent_name ?? 'Agent' }]}>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="h1" style={{ overflowWrap: 'anywhere' }}>
            {data ? <bdi>{data.agent_name}</bdi> : 'Agent'}
          </h1>
          <p className="sub">What this agent did, newest first, as the server recorded it.</p>
        </div>
        <Link className="btn" to="/agents">
          <Icon name="back" size={14} />
          Agents
        </Link>
      </div>

      {activity.isPending && (
        <div className="state" aria-busy="true">
          <span className="sr-only">Loading the activity</span>
          <span className="sk" style={{ width: '60%' }} aria-hidden="true" />
          <span className="sk" style={{ width: '40%' }} aria-hidden="true" />
        </div>
      )}

      {activity.isError && !data && (
        <div className="state" role="alert">
          <span className="state-icon">
            <Icon name="alert" size={20} />
          </span>
          <h2>The activity could not be loaded</h2>
          <p className="sub">{activityError(activity.error)}</p>
          <div>
            <button type="button" className="btn" onClick={() => activity.refetch()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {activity.isRefetchError && data && (
        <RefreshError
          what="The activity"
          error={activity.error}
          onRetry={() => activity.refetch()}
          formatError={activityError}
        />
      )}

      {data && (
        <div className="overview">
          <section aria-label="Spend" className="tiles">
            <div className="card tile">
              <span className="tile-label">Spent today</span>
              <span className="tile-value num">{cost(data.current_cost_today)}</span>
            </div>
            <div className="card tile">
              <span className="tile-label">Daily limit</span>
              <span className="tile-value num">{cost(data.max_cost_per_day)}</span>
            </div>
          </section>

          {data.activities.length === 0 ? (
            <div className="state">
              <h2>No activity recorded</h2>
              <p className="sub">The server has recorded nothing this agent did.</p>
            </div>
          ) : (
            <section className="card flush" aria-label="Activity">
              <div className="table-wrap">
                <table className="tbl compact tbl-stack">
                  <thead>
                    <tr>
                      <th scope="col">Time (UTC)</th>
                      <th scope="col">Activity</th>
                      <th scope="col">Status</th>
                      <th scope="col">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activities.map((a, i) => (
                      // The route gives activities no id; their order is the server's.
                      <tr key={`${a.timestamp}-${i}`}>
                        <td className="mono num muted cell-small" style={{ fontSize: 12 }} data-label="Time (UTC)">
                          {formatUtcLong(a.timestamp)}
                        </td>
                        <td>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <bdi>{a.description}</bdi>
                            <span className="mono muted" style={{ fontSize: 11 }}>
                              {a.type}
                            </span>
                          </span>
                        </td>
                        <td className="cell-small" data-label="Status">
                          <span className={statusClass(a.status)}>{a.status}</span>
                        </td>
                        <td className="mono num cell-small" data-label="Cost">
                          {cost(a.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-foot">
                <span className="num">
                  The newest {data.activities.length} {data.activities.length === 1 ? 'activity' : 'activities'}.
                </span>
                {limit < MOST && data.activities.length >= limit && (
                  <button type="button" className="btn btn-sm" disabled={activity.isFetching} onClick={() => setLimit(MOST)}>
                    Show the newest {MOST}
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}
