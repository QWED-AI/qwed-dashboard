/** The QWED mark in white, for the cobalt tile. */
export function Mark({ width = 20 }: { width?: number }) {
  return (
    <svg viewBox="0 0 80 64" width={width} height={(width * 64) / 80} aria-hidden="true">
      <g fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 32 L13 32" strokeWidth="7" />
        <path d="M67 32 L78 32" strokeWidth="7" />
        <circle cx="40" cy="32" r="26" strokeWidth="5" />
        <path
          d="M22 24 C28 14 40 10 50 14 M20 34 C24 22 38 16 52 20 M24 44 C26 32 40 24 56 28 M34 52 C32 42 44 34 60 38"
          strokeWidth="4"
        />
      </g>
    </svg>
  );
}
