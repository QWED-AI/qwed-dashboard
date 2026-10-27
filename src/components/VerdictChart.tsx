import { useState } from 'react';
import { bucketLabel, bucketName, niceScale, RANGES, type Bucket, type OverviewWindow, type VerdictCounts } from '../lib/overview';

// A column stacks either the stored verdicts or the stored admissions (#53).
// DENY cuts across the verdicts, so the two never share a stack.
type Key = Exclude<keyof VerdictCounts, 'total'>;
export type Grouping = 'verdict' | 'admission';

interface Series {
  key: Key;
  label: string;
  swatch: string;
}

// Bottom to top in each column. The legend repeats the dot shapes the
// chips use, so a verdict or an admission never depends on its colour alone.
const SERIES: Readonly<Record<Grouping, readonly Series[]>> = {
  verdict: [
    { key: 'verified', label: 'VERIFIED', swatch: 'sw-ok' },
    { key: 'unverifiable', label: 'UNVERIFIABLE', swatch: 'sw-un' },
    { key: 'blocked', label: 'BLOCKED', swatch: 'sw-bad' },
    { key: 'none', label: 'No verdict recorded', swatch: 'sw-none' },
  ],
  admission: [
    { key: 'admitted', label: 'ADMIT', swatch: 'sw-ok' },
    { key: 'denied', label: 'DENY', swatch: 'sw-deny' },
    { key: 'noAdmission', label: 'Admission not recorded', swatch: 'sw-none' },
  ],
};

const FILL: Record<Key, string> = {
  verified: 'var(--v-ok)',
  unverifiable: 'var(--v-un)',
  blocked: 'var(--v-bad)',
  none: 'var(--v-none)',
  admitted: 'var(--v-ok)',
  denied: 'var(--v-bad)',
  noAdmission: 'var(--v-none)',
};

const PLOT = 200;
const GAP = 2;

function describe(c: VerdictCounts, series: readonly Series[]): string {
  const parts = series.map((s) => `${c[s.key]} ${s.label}`).join(', ');
  const records = c.total === 1 ? 'record' : 'records';
  return `${c.total} ${records}: ${parts}`;
}

/**
 * A column's segments, top first, in px. The column's height stays
 * proportional to its total, so a smaller total never draws taller; the
 * gaps between segments fit inside it, and drop out of a column too short
 * to hold them.
 */
export function columnSegments(
  c: VerdictCounts,
  top: number,
  grouping: Grouping = 'verdict',
): { gap: number; segs: { key: Key; h: number }[] } {
  const parts = [...SERIES[grouping]].reverse().filter((s) => c[s.key] > 0);
  const height = (c.total / top) * PLOT;
  const gap = parts.length > 1 && height >= parts.length * 4 ? GAP : 0;
  const room = height - gap * (parts.length - 1);
  return { gap, segs: parts.map((s) => ({ key: s.key, h: (c[s.key] / c.total) * room })) };
}

/**
 * Records per hour or day in the window, stacked by stored verdict or by
 * stored admission. Hovering or focusing a column shows its counts above the
 * chart; the table view holds the same numbers.
 */
export function VerdictChart({ win }: Readonly<{ win: OverviewWindow }>) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [grouping, setGrouping] = useState<Grouping>('verdict');
  const series = SERIES[grouping];
  // Columns are known by their start time, which a refresh does not move,
  // and pointer and keyboard are kept apart: the pointer leaving a column
  // does not clear the one that has focus.
  const [hovered, setHovered] = useState<number | null>(null);
  const [focusedAt, setFocusedAt] = useState<number | null>(null);
  const { top, step } = niceScale(Math.max(...win.buckets.map((b) => b.total)));
  const ticks: number[] = [];
  for (let v = top; v >= 0; v -= step) ticks.push(v);
  const at = hovered ?? focusedAt;
  const focused = at === null ? undefined : win.buckets.find((b) => b.start === at);
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
          <h2 id="by-verdict-title">{grouping === 'verdict' ? 'Records by verdict' : 'Records by admission'}</h2>
          <p className="hint" style={{ margin: 0 }}>
            {win.range === '24h' ? 'Per hour, UTC.' : 'Per day, UTC.'} Hover or focus a column for its counts.
          </p>
        </div>
        <fieldset className="seg">
          <legend className="sr-only">Group the records by</legend>
          <button type="button" aria-pressed={grouping === 'verdict'} onClick={() => setGrouping('verdict')}>
            Verdict
          </button>
          <button type="button" aria-pressed={grouping === 'admission'} onClick={() => setGrouping('admission')}>
            Admission
          </button>
        </fieldset>
        <fieldset className="seg">
          <legend className="sr-only">Show the counts as</legend>
          <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
            Chart
          </button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
            Table
          </button>
        </fieldset>
      </div>

      <div className="vc-readout" aria-live="polite">
        <strong>{focused ? bucketName(focused, win.range) : `All ${name}`}</strong>
        <span className="mono num">
          {shown.total} {shown.total === 1 ? 'record' : 'records'}
        </span>
        <ul className="vc-legend">
          {series.map((s) => (
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
              {win.buckets.map((b) => {
                const { gap, segs } = columnSegments(b, top, grouping);
                return (
                  <button
                    key={b.start}
                    type="button"
                    className="vc-col"
                    aria-label={`${bucketName(b, win.range)}, ${describe(b, series)}`}
                    style={{ gap, opacity: focused && focused.start !== b.start ? 0.45 : 1 }}
                    onMouseEnter={() => setHovered(b.start)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => {
                      // A new focus wins over a pointer resting elsewhere.
                      setHovered(null);
                      setFocusedAt(b.start);
                    }}
                    onBlur={() => setFocusedAt(null)}
                  >
                    {segs.map((s) => (
                      <span key={s.key} className="vc-seg" style={{ height: s.h, background: FILL[s.key] }} />
                    ))}
                  </button>
                );
              })}
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
                {series.map((s) => (
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
                  {series.map((s) => (
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
