import { useState } from "react";

export default function FaceCard({ group, name, onName, excluded, toggleExcluded, photos, onView }) {
  const [open, setOpen] = useState(false);
  const kept = group.faces.filter(f => !excluded.has(f.id));
  const cover = kept[0] || group.faces[0];
  const photoCount = new Set(kept.map(f => f.photo)).size;
  const named = Boolean(name.trim());
  const view = f => onView(photos[f.photo]?.preview || f.crop);

  return (
    <article className={`face-card ${named ? "named" : ""}`}>
      <button className="face-cover" onClick={() => view(cover)} aria-label="View photo">
        <img src={cover.crop} alt="" loading="lazy" />
        {named && <span className="face-check" aria-hidden="true">✓</span>}
      </button>
      <p className="muted small">{photoCount} photo{photoCount === 1 ? "" : "s"}</p>
      <input className="name-input" type="text" placeholder="Who is this?" list="known-names" maxLength={60}
             value={name} onChange={e => onName(e.target.value)} aria-label="Name for this person" />
      {group.suggestion && name === group.suggestion && <p className="hint">Recognised from before</p>}
      {group.faces.length > 1 && (
        <button className="btn btn-link small" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? "Hide" : `See all ${group.faces.length}`}
        </button>
      )}
      {open && (
        <div className="face-strip">
          {group.faces.map(f => {
            const off = excluded.has(f.id);
            return (
              <div key={f.id} className={`face-mini ${off ? "off" : ""}`}>
                <img src={f.crop} alt="" loading="lazy" onClick={() => view(f)} />
                <button onClick={() => toggleExcluded(f.id)} title={off ? "Put back" : "Not this person"}
                        aria-label={off ? "Put back" : "Not this person"}>{off ? "↺" : "✕"}</button>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
