import { useState } from 'react';
import { bucketLabel, bucketName, niceScale, RANGES, type Bucket, type OverviewWindow, type VerdictCounts } from '../lib/overview';

type Key = Exclude<keyof VerdictCounts, 'total'>;

// Bottom to top in each column. The legend repeats the dot shapes the
// verdict chips use, so a verdict never depends on its colour alone.
const SERIES: readonly { key: Key; label: string; swatch: string }[] = [
  { key: 'verified', label: 'VERIFIED', swatch: 'sw-ok' },
  { key: 'unverifiable', label: 'UNVERIFIABLE', swatch: 'sw-un' },
  { key: 'blocked', label: 'BLOCKED', swatch: 'sw-bad' },
  { key: 'none', label: 'No verdict recorded', swatch: 'sw-none' },
];

const FILL: Record<Key, string> = {
  verified: 'var(--v-ok)',
  unverifiable: 'var(--v-un)',
  blocked: 'var(--v-bad)',
  none: 'var(--v-none)',
};

const PLOT = 200;

const describe = (c: VerdictCounts) =>
  `${c.total} ${c.total === 1 ? 'record' : 'records'}: ${SERIES.map((s) => `${c[s.key]} ${s.label}`).join(', ')}`;

/**
 * Records per hour or day in the window, stacked by stored verdict. Hovering
 * or focusing a column shows its counts above the chart; the table view
 * holds the same numbers.
 */
export function VerdictChart({ win }: Readonly<{ win: OverviewWindow }>) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [hover, setHover] = useState<number | null>(null);
  const { top, step } = niceScale(Math.max(...win.buckets.map((b) => b.total)));
  const ticks: number[] = [];
  for (let v = top; v >= 0; v -= step) ticks.push(v);
  const focused = hover === null ? undefined : win.buckets[hover];
  const shown: VerdictCounts = focused ?? win.totals;
  const name = RANGES[win.range].name;
  // Hours are labelled every three, by the hour alone, so the labels fit a phone.
  const tick = (b: Bucket, i: number) => {
    const label = bucketLabel(b, win.range);
    if (win.range === '7d') return label;
    return i % 3 === 0 ? label.slice(0, 2) : '';
  };

  return (
    <section className="card" aria-labelledby="by-verdict-title">
      <div className="card-head">
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <h2 id="by-verdict-title">Records by verdict</h2>
          <p className="hint" style={{ margin: 0 }}>
            {win.range === '24h' ? 'Per hour, UTC.' : 'Per day, UTC.'} Hover or focus a column for its counts.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Show the counts as">
          <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
            Chart
          </button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
            Table
          </button>
        </div>
      </div>

      <div className="vc-readout" aria-live="polite">
        <strong>{focused ? bucketName(focused, win.range) : `All ${name}`}</strong>
        <span className="mono num">
          {shown.total} {shown.total === 1 ? 'record' : 'records'}
        </span>
        <ul className="vc-legend">
          {SERIES.map((s) => (
            <li key={s.key}>
              <span className={`sw ${s.swatch}`} aria-hidden="true" />
              {s.label} <b>{shown[s.key]}</b>
            </li>
          ))}
        </ul>
      </div>

      {view === 'chart' ? (
        <div className="vc-plot">
          <div className="vc-axis" aria-hidden="true">
            {ticks.map((v) => (
              <span key={v} style={{ top: (1 - v / top) * PLOT }}>
                {v}
              </span>
            ))}
          </div>
          <div className="vc-area">
            {ticks.map((v) => (
              <span key={v} className="vc-grid" aria-hidden="true" style={{ top: (1 - v / top) * PLOT }} />
            ))}
            <div className="vc-cols">
              {win.buckets.map((b, i) => (
                <button
                  key={b.start}
                  type="button"
                  className="vc-col"
                  aria-label={`${bucketName(b, win.range)}, ${describe(b)}`}
                  style={{ opacity: hover !== null && hover !== i ? 0.45 : 1 }}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onBlur={() => setHover(null)}
                >
                  {[...SERIES]
                    .reverse()
                    .filter((s) => b[s.key] > 0)
                    .map((s) => (
                      <span
                        key={s.key}
                        className="vc-seg"
                        style={{ height: Math.max(2, Math.round((b[s.key] / top) * PLOT) - 2), background: FILL[s.key] }}
                      />
                    ))}
                </button>
              ))}
            </div>
          </div>
          <div className="vc-ticks" aria-hidden="true">
            {win.buckets.map((b, i) => (
              <span key={b.start}>{tick(b, i)}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="table-wrap vc-table">
          <table className="tbl" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th scope="col">{win.range === '24h' ? 'Hour (UTC)' : 'Day (UTC)'}</th>
                {SERIES.map((s) => (
                  <th key={s.key} scope="col">
                    {s.label}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {win.buckets.map((b) => (
                <tr key={b.start}>
                  <th scope="row" className="mono" style={{ fontWeight: 400 }}>
                    {bucketName(b, win.range).replace(' UTC', '')}
                  </th>
                  {SERIES.map((s) => (
                    <td key={s.key} className="num">
                      {b[s.key]}
                    </td>
                  ))}
                  <td className="num" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                    {b.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
