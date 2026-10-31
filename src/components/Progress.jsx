import { useRef } from "react";

const WINDOW_MS = 30_000; // the estimate follows the speed of the last 30 seconds

function formatLeft(ms) {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "less than a minute left";
  if (min < 60) return `about ${min} min left`;
  return `about ${Math.floor(min / 60)} h ${min % 60} min left`;
}

// Time left from recent speed, so photos skipped quickly (already done before a refresh) don't skew it.
function useTimeLeft(title, done, total) {
  const samples = useRef({ key: "", list: [] });
  const key = `${title}|${total}`;
  if (samples.current.key !== key) samples.current = { key, list: [] };
  if (!total) return null;
  const now = Date.now(), list = samples.current.list;
  if (!list.length || list[list.length - 1].done !== done) list.push({ t: now, done });
  while (list.length > 2 && now - list[1].t > WINDOW_MS) list.shift();
  const first = list[0], made = done - first.done, spent = now - first.t;
  if (made < 3 || spent < 3000) return null;
  return formatLeft(((total - done) * spent) / made);
}

export default function Progress({ title, done, total, current, preview, found, onStop }) {
  const pct = total ? Math.round((done / total) * 100) : null;
  const left = useTimeLeft(title, done, total);
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
          <p className="muted">{done} of {total} · {pct}%{done < total && ` · ${left || "working out time left…"}`}</p>
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
