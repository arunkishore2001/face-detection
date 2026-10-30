import { useEffect, useState } from "react";

export default function ResetDialog({ people, signedIn, onForgetOne, onConfirm, onClose }) {
  const [forget, setForget] = useState(false);
  const [logout, setLogout] = useState(false);

  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title" className="card-title">Start over?</h2>
        <p className="muted">This clears the current photos, faces and names on this page. Nothing in your Google Drive is deleted.</p>

        {people.length > 0 && (
          <div className="remembered">
            <p className="field-label">Remembered people</p>
            <div className="chips">
              {people.map(n => (
                <span className="chip" key={n}>{n}
                  <button onClick={() => onForgetOne(n)} aria-label={`Forget ${n}`} title="Forget">✕</button>
                </span>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={forget} onChange={e => setForget(e.target.checked)} />
              <span>Also forget all remembered people</span>
            </label>
          </div>
        )}
        {signedIn && (
          <label className="check">
            <input type="checkbox" checked={logout} onChange={e => setLogout(e.target.checked)} />
            <span>Also sign out of Google</span>
          </label>
        )}

        <div className="actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={() => onConfirm({ forget, logout })}>Start over</button>
        </div>
      </div>
    </div>
  );
}
