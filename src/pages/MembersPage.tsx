import { ApiError } from '../api/http';
import { useSession } from '../auth/session';
import { Icon } from '../components/Icon';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { formatUtcLong } from '../lib/format';
import { describeError, useAuthedQuery } from '../lib/useAuthedQuery';

// The organisation's users (#66), from GET /auth/users (qwed-verification
// #507): read only, as the route is. Owners and admins may list them.

const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The server's word for a role that may not list members; its other 403s name another reason. */
const INSUFFICIENT_ROLE = 'Insufficient permissions for this operation';

const refused = (err: unknown): err is ApiError => err instanceof ApiError && err.status === 403;

export function membersError(err: unknown): string {
  if (refused(err)) {
    // An inactive user or organisation is refused too, for its own reason.
    if (err.message === INSUFFICIENT_ROLE) return 'Only owners and admins can see the organisation’s members.';
    return `The server refused: ${err.message}.`;
  }
  if (err instanceof ApiError && err.status === 404) {
    return 'This server does not list members. That needs a qwed-verification release with #507.';
  }
  return describeError(err);
}

export function MembersPage() {
  const { user } = useSession();
  const users = useAuthedQuery(['users'], (api, token) => api.listUsers(token));
  // A failed refresh keeps the members loaded before, marked as maybe out of
  // date; a refusal (403) does not, as the signed-in user may no longer see them.
  const shown = refused(users.error) ? undefined : users.data;
  const list = shown ?? [];
  const active = list.filter((u) => u.is_active);
  // A role the dashboard does not know is counted apart, as stored.
  const roleCount = (role: string) => active.filter((u) => u.role === role).length;
  const otherRoles = active.filter((u) => !(ROLES as readonly string[]).includes(u.role)).length;

  return (
    <Shell crumbs={[{ label: 'Settings' }, { label: 'Members' }]}>
      <div className="page-head">
        <div>
          <h1 className="h1">Members</h1>
          <p className="sub">
            The users of your organisation, oldest first, as the server lists them. Deactivated users stay on the list.
            Inviting users and changing roles are not part of the server’s route, so this screen only reads.
          </p>
        </div>
      </div>

      {users.isPending && (
        <div className="state" aria-busy="true">
          <span className="sr-only">Loading members</span>
          <span className="sk" style={{ width: '60%' }} aria-hidden="true" />
          <span className="sk" style={{ width: '40%' }} aria-hidden="true" />
        </div>
      )}

      {users.isError && !shown && (
        <div className="state" role="alert">
          <span className="state-icon">
            <Icon name="alert" size={20} />
          </span>
          <h2>The members could not be loaded</h2>
          <p className="sub">{membersError(users.error)}</p>
          <div>
            <button type="button" className="btn" onClick={() => users.refetch()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {users.isRefetchError && shown && (
        <RefreshError what="The members" error={users.error} onRetry={() => users.refetch()} formatError={membersError} />
      )}

      {shown && list.length === 0 && (
        <div className="state">
          <h2>No members listed</h2>
          <p className="sub">The server listed no users for your organisation.</p>
        </div>
      )}

      {shown && list.length > 0 && (
        <div className="overview">
          <section aria-label="Members by role" className="tiles">
            <div className="card tile">
              <span className="tile-label">Active members</span>
              <span className="tile-value num">{active.length}</span>
            </div>
            {ROLES.map((role) => (
              <div className="card tile" key={role}>
                <span className="tile-label" style={{ textTransform: 'capitalize' }}>
                  {role}
                </span>
                <span className="tile-value num">{roleCount(role)}</span>
              </div>
            ))}
            {otherRoles > 0 && (
              <div className="card tile">
                <span className="tile-label">Another role</span>
                <span className="tile-value num">{otherRoles}</span>
              </div>
            )}
            <div className="card tile">
              <span className="tile-label">Deactivated</span>
              <span className="tile-value num">{list.length - active.length}</span>
            </div>
          </section>

          <section className="card flush" aria-label="Members">
            <div className="table-wrap">
              <table className="tbl compact tbl-stack">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Joined (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id}>
                      <td style={{ color: 'var(--ink)', fontWeight: 500 }}>
                        <bdi>{u.email}</bdi>
                        {u.id === user?.id && (
                          <>
                            {' '}
                            <span className="muted">(you)</span>
                          </>
                        )}
                      </td>
                      <td className="cell-small" style={{ textTransform: 'capitalize' }} data-label="Role">
                        {u.role}
                      </td>
                      <td className="cell-small" data-label="Status">
                        {u.is_active ? 'Active' : <span className="tag">Deactivated</span>}
                      </td>
                      <td className="mono num muted cell-small" style={{ fontSize: 12 }} data-label="Joined">
                        {formatUtcLong(u.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="num">{plural(list.length, 'user', 'users')} in your organisation.</span>
            </div>
          </section>
        </div>
      )}
    </Shell>
  );
}
