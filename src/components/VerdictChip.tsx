import type { Admission, Verdict } from '../api/types';

/** What the chip says about the admission, in words for the label and the tooltip. */
function admissionWords(admission: Admission | null, stored: string | null): string {
  if (admission && stored) return `admission ${admission}, stored as ${stored}`;
  if (admission) return `admission ${admission}`;
  if (stored) return `admission stored as ${stored}, not one the dashboard knows`;
  return 'admission not recorded';
}

/**
 * Verdict and admission as one pair, e.g. "VERIFIED · ADMIT". A missing value
 * is shown as missing; it is never filled in from the other one. A stored
 * BLOCKED admission reads DENY (see readAdmission), and the label says what
 * was stored.
 */
export function VerdictChip({
  verdict,
  admission,
  admissionStored = null,
  large = false,
}: Readonly<{
  verdict: Verdict | null;
  admission: Admission | null;
  admissionStored?: string | null;
  large?: boolean;
}>) {
  const label = `${verdict ?? 'No verdict recorded'}, ${admissionWords(admission, admissionStored)}`;
  const dot = verdict ? `d-${verdict}` : 'd-none';
  let shown = <span className="none">not recorded</span>;
  if (admission) shown = <span className={`a-${admission}`}>{admission}</span>;
  else if (admissionStored) shown = <span className="none">{admissionStored}</span>;
  return (
    <span className={large ? 'chip lg' : 'chip'} aria-label={label} title={label}>
      <span className={`dot ${dot}`} aria-hidden="true" />
      {verdict ?? <span className="none">no verdict</span>}
      <span className="sep" aria-hidden="true">
        ·
      </span>
      {shown}
    </span>
  );
}
