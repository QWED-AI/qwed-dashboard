import type { Admission, Verdict } from '../api/types';

/**
 * Verdict and admission as one pair, e.g. "VERIFIED · ADMIT". A missing value
 * is shown as missing; it is never filled in from the other one.
 */
export function VerdictChip({
  verdict,
  admission,
  large = false,
}: {
  verdict: Verdict | null;
  admission: Admission | null;
  large?: boolean;
}) {
  const label = `${verdict ?? 'No verdict recorded'}, ${admission ? `admission ${admission}` : 'admission not recorded'}`;
  return (
    <span className={large ? 'chip lg' : 'chip'} aria-label={label} title={label}>
      <span className={`dot ${verdict ? `d-${verdict}` : 'd-none'}`} aria-hidden="true" />
      {verdict ?? <span className="none">no verdict</span>}
      <span className="sep" aria-hidden="true">
        ·
      </span>
      {admission ? <span className={`a-${admission}`}>{admission}</span> : <span className="none">not recorded</span>}
    </span>
  );
}
