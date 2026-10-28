import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { agentsError, cost, NO_SUCH_AGENT, statusClass } from '../lib/agents';
import { formatUtcLong } from '../lib/format';
import { useAuthedQuery, useRefused } from '../lib/useAuthedQuery';

// One agent's activity (#72), from GET /agents/{agent_id}/activity read with
// the owner's session (qwed-verification #527), newest first. The route
// returns at most 200 activities. The newest 50 load first; the newest 200
// load apart, on request, so the 50 stay shown while they load and if they
// fail.

const FIRST = 50;
const MOST = 200;
const activityError = (err: unknown) => agentsError(err, NO_SUCH_AGENT);

export function AgentPage() {
  const { agentId = '' } = useParams();
  const [wantMost, setWantMost] = useState(false);
  const first = useAuthedQuery(['agent-activity', agentId, FIRST], (api, token) =>
    api.agentActivity(token, agentId, FIRST),
  );
  const most = useAuthedQuery(['agent-activity', agentId, MOST], (api, token) => api.agentActivity(token, agentId, MOST), {
    enabled: wantMost,
  });
  // A failed refresh keeps the activity loaded before; a refusal (403) of
  // either request hides it, whichever was shown.
  const firstRefused = useRefused(first);
  const mostRefused = useRefused(most);
  const mostData = most.data;
  const data = firstRefused || mostRefused ? undefined : (mostData ?? first.data);
  // The request whose activity is shown, or whose refusal hides it.
  let activity = first;
  if (mostRefused || (!firstRefused && mostData)) activity = most;

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

      {first.isPending && (
        <div className="state" aria-busy="true">
          <span className="sr-only">Loading the activity</span>
          <span className="sk" style={{ width: '60%' }} aria-hidden="true" />
          <span className="sk" style={{ width: '40%' }} aria-hidden="true" />
        </div>
      )}

      {!first.isPending && activity.isError && !data && (
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
                {!mostData && data.activities.length >= FIRST && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={most.isFetching}
                    onClick={() => (wantMost ? most.refetch() : setWantMost(true))}
                  >
                    {most.isFetching ? 'Loading…' : `Show the newest ${MOST}`}
                  </button>
                )}
              </div>
              {most.isError && !mostData && !mostRefused && (
                <p className="note" role="alert" style={{ margin: '0 24px 16px' }}>
                  The newest {MOST} could not be loaded, so the newest {data.activities.length} are shown.{' '}
                  {activityError(most.error)}
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}
