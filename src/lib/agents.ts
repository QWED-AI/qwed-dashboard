import { ApiError, refusedForRole } from '../api/http';
import { describeError } from './useAuthedQuery';

// The organisation's agents and their activity (#72), from qwed-verification
// #527. Owners and admins only; the server never returns an agent's token.

/** Why the agents or an agent's activity could not be loaded; `notFound` is what a 404 means there. */
export function agentsError(err: unknown, notFound: string): string {
  if (refusedForRole(err)) return 'Only owners and admins can see the organisation’s agents.';
  // Another 403 has its own reason, such as an inactive user or organisation.
  if (err instanceof ApiError && err.status === 403) return `The server refused: ${err.message}.`;
  if (err instanceof ApiError && err.status === 404) return notFound;
  return describeError(err);
}

export const NO_AGENT_LIST = 'This server does not list agents. That needs a qwed-verification release with #527.';
export const NO_SUCH_AGENT = 'Your organisation has no agent with this id.';

/** A status that stands out: an agent not active, or an activity the server blocked or that failed. */
export function statusClass(status: string): string {
  return ['suspended', 'deactivated', 'blocked', 'failed', 'BLOCKED'].includes(status) ? 'tag sev-high' : 'tag';
}

// At least two decimals, and every further one the server stored, so a
// small charge such as 0.001 never reads as 0.00. No grouping or exponent.
const COST = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 20, useGrouping: false });

/** A cost as the server stores it: a plain number, in no currency the server names. */
export const cost = (n: number) => COST.format(n);
