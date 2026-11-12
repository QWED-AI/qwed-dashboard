/**
 * True in a build made with VITE_SAMPLE_ONLY=true, as the hosted preview at
 * demo.qwedai.tech is (netlify.toml). Such a copy has no QWED server behind
 * it, so it offers the sample data only and never signs in: nobody types a
 * real password into a page with nothing behind it. Local and self-hosted
 * builds leave it unset and are unchanged.
 */
export function sampleOnly(): boolean {
  return import.meta.env.VITE_SAMPLE_ONLY === 'true';
}

/** What a sample-only copy says in place of the sign-in form. */
export const SAMPLE_ONLY_NOTE =
  'This is a hosted preview with sample data. There is no QWED server behind it, so it does not sign in.';
