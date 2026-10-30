import { useState } from "react";
import FaceCard from "./FaceCard.jsx";

export default function NameFaces({
  groups, photoCount, photos, grouping, setGrouping, nameOf, setName, excluded, toggleExcluded,
  knownNames, namedCount, canContinue, onView, onBack, onNext,
}) {
  const [showRare, setShowRare] = useState(false);
  const common = groups.filter(g => g.photoCount > 1);
  const rare = groups.filter(g => g.photoCount === 1);
  const visible = showRare || !common.length ? groups : common;

  if (!groups.length) {
    return (
      <section className="card center-text">
        <h1 className="card-title">No faces found</h1>
        <p className="card-sub">None of the {photoCount} photos had a clear face. Try other photos.</p>
        <div className="actions"><button className="btn btn-secondary" onClick={onBack}>← Choose other photos</button></div>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <h1 className="card-title">Who is who?</h1>
        <p className="card-sub">
          Found <strong>{groups.length}</strong> different face{groups.length === 1 ? "" : "s"} in {photoCount} photos.
          Type a name under each person you want a folder for. Leave the rest empty.
        </p>
        <div className="toolbar">
          <ul className="tips">
            <li><strong>Same person on two cards?</strong> Give both the same name.</li>
            <li><strong>Wrong face on a card?</strong> Open “See all” and tap ✕ on it.</li>
          </ul>
          <label className="slider">
            <span className="field-label">Grouping</span>
            <span className="slider-row">
              <span className="muted small">Split more</span>
              <input type="range" min="0.2" max="0.55" step="0.01" value={grouping}
                     onChange={e => setGrouping(1.0 * e.target.value)} />
              <span className="muted small">Join more</span>
            </span>
          </label>
        </div>
      </section>

      <div className="face-grid">
        {visible.map(g => (
          <FaceCard key={g.key} group={g} name={nameOf(g)} onName={v => setName(g.key, v)}
                    excluded={excluded} toggleExcluded={toggleExcluded} photos={photos} onView={onView} />
        ))}
      </div>
      <datalist id="known-names">{knownNames.map(n => <option key={n} value={n} />)}</datalist>

      {common.length > 0 && rare.length > 0 && (
        <div className="center-text">
          <button className="btn btn-link" onClick={() => setShowRare(s => !s)}>
            {showRare ? "Hide faces seen in only one photo" : `Show ${rare.length} more face${rare.length === 1 ? "" : "s"} seen in only one photo`}
          </button>
        </div>
      )}

      <div className="sticky-bar">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <span className="muted">
          {namedCount ? `${namedCount} ${namedCount === 1 ? "person" : "people"} named`
            : canContinue ? "No names yet – photos go to Group Photos / Not Recognised" : "Name at least one person"}
        </span>
        <button className="btn btn-primary" disabled={!canContinue} onClick={onNext}>Continue →</button>
      </div>
    </>
  );
}
