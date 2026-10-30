export default function Progress({ title, done, total, current, preview, found, onStop }) {
  const pct = total ? Math.round((done / total) * 100) : null;
  return (
    <section className="card progress-card" aria-live="polite">
      <div className="progress-visual">
        {preview ? <img src={preview} alt="" className="progress-preview" /> : <div className="spinner" aria-hidden="true" />}
      </div>
      <h1 className="card-title">{title}</h1>
      {total ? (
        <>
          <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="muted">{done} of {total} · {pct}%</p>
          {current && <p className="muted small ellipsis">{current}</p>}
        </>
      ) : found ? (
        <p className="muted">{found} photos found so far…</p>
      ) : (
        <p className="muted">This can take a moment.</p>
      )}
      <p className="muted small">Keep this tab open until it finishes.</p>
      {onStop && <button className="btn btn-secondary" onClick={onStop}>Stop</button>}
    </section>
  );
}
