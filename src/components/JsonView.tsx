/** Pretty JSON with line numbers. Text only: nothing from the record is rendered as HTML. */
export function JsonView({
  value,
  fallback,
  label = 'Stored result',
}: Readonly<{ value: unknown; fallback: string; label?: string }>) {
  const text = value === null || value === undefined ? fallback : JSON.stringify(value, null, 2);
  // The line number is each line's identity in a numbered view.
  const lines = text.split('\n').map((line, i) => ({ no: i + 1, line }));
  return (
    <section className="code-box" aria-label={label}>
      {lines.map(({ no, line }) => {
        const m = /^(\s*)("(?:[^"\\]|\\.)*")(:.*)$/.exec(line);
        return (
          <div className="ln" key={no}>
            <span className="no">{no}</span>
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
    </section>
  );
}
