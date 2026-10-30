const WHERE = {
  "drive-here": r => <>In Google Drive: <strong>{r.where} › Sorted by Face</strong></>,
  "drive-upload": r => <>In Google Drive: <strong>{r.where} › Sorted by Face</strong></>,
  folder: r => <>On this computer, in <strong>{r.where}</strong></>,
  zip: () => <>Downloaded as <strong>Sorted by Face.zip</strong></>,
};

export default function Done({ result, onAgain, onBack }) {
  return (
    <section className="card center-text">
      <div className="done-mark" aria-hidden="true">✓</div>
      <h1 className="card-title">Your folders are ready</h1>
      <p className="card-sub">{WHERE[result.kind](result)}</p>
      <p className="muted">
        {result.photoCount} photo{result.photoCount === 1 ? "" : "s"} sorted.
        {result.mode === "move" && " Each photo is stored once; photos with more than one person have shortcuts in the other folders."}
      </p>
      <ul className="count-list">
        {result.counts.map(([name, n]) => (
          <li key={name}><span>📁 {name}</span><span className="muted">{n} photo{n === 1 ? "" : "s"}</span></li>
        ))}
      </ul>
      <div className="actions center">
        {result.url && <a className="btn btn-primary" href={result.url} target="_blank" rel="noopener noreferrer">Open in Google Drive ↗</a>}
        <button className="btn btn-secondary" onClick={onBack}>Change names / save again</button>
        <button className="btn btn-ghost" onClick={onAgain}>Sort more photos</button>
      </div>
      <p className="muted small">Names are remembered in this browser, so these people are recognised next time.</p>
    </section>
  );
}
