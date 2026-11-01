import type { ReactNode } from 'react';
import { Link } from 'react-router';

const W = 96;
const H = 32;

/** A small trend line, oldest left; the newest point carries the accent. Decoration only: the tile says the number. */
export function Sparkline({ values }: Readonly<{ values: readonly number[] }>) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => [2 + (i / (values.length - 1)) * (W - 4), H - 3 - (v / max) * (H - 8)] as const);
  const last = points.at(-1);
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      {last && <circle cx={last[0]} cy={last[1]} r={3.5} />}
    </svg>
  );
}

/**
 * One headline number with its label, an optional trend and a line of
 * context. With `to`, the number links there, and the whole tile takes the
 * click (#90); `linkLabel` names the link, since a number alone says little.
 */
export function StatTile({
  label,
  dot,
  value,
  trend,
  to,
  linkLabel,
  children,
  after,
}: Readonly<{
  label: string;
  dot?: string;
  value: ReactNode;
  trend?: readonly number[];
  to?: string;
  linkLabel?: string;
  /** The line of context under the number. */
  children?: ReactNode;
  /** Anything below that line, such as a refresh warning. */
  after?: ReactNode;
}>) {
  return (
    <section className={to ? 'card tile tile-link' : 'card tile'} aria-label={label}>
      <span className="tile-label">
        {dot && <span className={`dot ${dot}`} aria-hidden="true" />}
        {label}
      </span>
      <span className="tile-row">
        <span className="tile-value">
          {to ? (
            <Link to={to} aria-label={linkLabel}>
              {value}
            </Link>
          ) : (
            value
          )}
        </span>
        {trend && <Sparkline values={trend} />}
      </span>
      {children && <p className="tile-note">{children}</p>}
      {after}
    </section>
  );
}

export interface BarRow {
  key: string;
  label: ReactNode;
  n: number;
  note?: ReactNode;
  /** Where the row's label links (#90), when it is not a link already. */
  to?: string;
}

/** Counts as bars on one scale, most first. */
export function BarList({ rows }: Readonly<{ rows: readonly BarRow[] }>) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="bars-head">
            <span className="bars-label">{r.to ? <Link to={r.to}>{r.label}</Link> : r.label}</span>
            <span className="num">{r.n}</span>
          </span>
          <span className="bars-track" aria-hidden="true">
            <span style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          {r.note && <span className="hint">{r.note}</span>}
        </li>
      ))}
    </ul>
  );
}
