/** Pretty JSON with line numbers. Text only: nothing from the record is rendered as HTML. */
export function JsonView({
  value,
  fallback,
  label = 'Stored result',
}: Readonly<{ value: unknown; fallback: string; label?: string }>) {
  const text = value === null || value === undefined ? fallback : JSON.stringify(value, null, 2);
  const lines = text.split('\n');
  return (
    <div className="code-box" role="region" aria-label={label} tabIndex={0}>
      {lines.map((line, i) => {
        const m = /^(\s*)("(?:[^"\\]|\\.)*")(:.*)$/.exec(line);
        return (
          <div className="ln" key={i}>
            <span className="no">{i + 1}</span>
            <span className="tx">
              {m ? (
                <>
                  {m[1]}
                  <span className="key">{m[2]}</span>
                  {m[3]}
                </>
              ) : (
                line
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
