import { useRef, useState } from "react";
import { googleConfigured, IMAGE_RE } from "../lib/google.js";

const isImage = f => f.type.startsWith("image/") || IMAGE_RE.test(f.name);

export default function ChoosePhotos({
  source, setSource, account, onSignIn, driveLink, setDriveLink, localFiles, setLocalFiles, onNext,
}) {
  const [dragging, setDragging] = useState(false);
  const filesInput = useRef(null);
  const folderInput = useRef(null);

  function addFiles(list) {
    const incoming = [...list].filter(isImage);
    setLocalFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}|${f.size}|${f.lastModified}`));
      return [...prev, ...incoming.filter(f => !seen.has(`${f.name}|${f.size}|${f.lastModified}`))];
    });
  }

  const ready = source === "drive" ? account && driveLink.trim() : localFiles.length > 0;

  return (
    <section className="card">
      <h1 className="card-title">Where are your photos?</h1>
      <p className="card-sub">Face Sorter finds every face, you name them, and each person gets their own folder.</p>

      <div className="choice-grid" role="radiogroup" aria-label="Photo source">
        <button role="radio" aria-checked={source === "drive"}
                className={`choice ${source === "drive" ? "selected" : ""}`} onClick={() => setSource("drive")}>
          <span className="choice-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 3h8l6 10-4 7H6l-4-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M8 3l6 10H2M16 3l-6 10M14 13h8M18 20l-4-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
          </span>
          <span className="choice-title">Google Drive folder</span>
          <span className="choice-text">Paste a folder link. Sorted folders are created inside it.</span>
        </button>
        <button role="radio" aria-checked={source === "local"}
                className={`choice ${source === "local" ? "selected" : ""}`} onClick={() => setSource("local")}>
          <span className="choice-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </span>
          <span className="choice-title">This computer or phone</span>
          <span className="choice-text">Pick photos or a whole folder from this device.</span>
        </button>
      </div>

      {source === "drive" && (
        <div className="panel">
          {!googleConfigured ? (
            <p className="note warn">Google sign-in isn't set up for this site yet (missing <code>VITE_GOOGLE_CLIENT_ID</code>).</p>
          ) : !account ? (
            <div className="signin-box">
              <p>Sign in so Face Sorter can read the folder and create the person folders in it.</p>
              <button className="btn btn-primary" onClick={onSignIn}>Sign in with Google</button>
            </div>
          ) : (
            <label className="field">
              <span className="field-label">Google Drive folder link</span>
              <input type="url" inputMode="url" placeholder="https://drive.google.com/drive/folders/…"
                     value={driveLink} onChange={e => setDriveLink(e.target.value)} />
              <span className="field-help">In Drive, open the folder and copy the address from the browser bar, or use Share → Copy link.</span>
            </label>
          )}
        </div>
      )}

      {source === "local" && (
        <div className="panel">
          <div
            className={`dropzone ${dragging ? "over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          >
            <p className="dropzone-title">Drop photos here</p>
            <div className="row center">
              <button className="btn btn-secondary" onClick={() => filesInput.current.click()}>Choose photos</button>
              <button className="btn btn-secondary" onClick={() => folderInput.current.click()}>Choose a folder</button>
            </div>
            <input ref={filesInput} type="file" multiple accept="image/*,.heic,.heif" hidden
                   onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={folderInput} type="file" webkitdirectory="" hidden
                   onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {localFiles.length > 0 && (
            <div className="row between selected-files">
              <span><strong>{localFiles.length}</strong> photo{localFiles.length === 1 ? "" : "s"} selected</span>
              <button className="btn btn-link danger" onClick={() => setLocalFiles([])}>Clear</button>
            </div>
          )}
        </div>
      )}

      <div className="actions">
        <button className="btn btn-primary btn-lg" disabled={!ready} onClick={onNext}>Find faces →</button>
      </div>
    </section>
  );
}
