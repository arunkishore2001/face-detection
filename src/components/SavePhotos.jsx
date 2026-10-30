import { useState } from "react";
import { googleConfigured } from "../lib/google.js";
import { canPickFolder } from "../lib/save.js";
import { GROUP_FOLDER, GROUP_MIN_PEOPLE, UNKNOWN_FOLDER } from "../lib/constants.js";

const MODES_DRIVE = [
  ["copy", "Copy (recommended)", "Each folder gets its own real copy of the photo. Uses Drive storage for the copies."],
  ["shortcut", "Shortcuts only", "Each folder gets a shortcut to the photo. Uses no extra storage, but shortcuts can't be downloaded as files."],
];
const MODES_UPLOAD = [
  ["once", "Upload once (recommended)", "Each photo is uploaded once; other people's folders get a shortcut to it."],
  ["copy", "Upload to every folder", "Every folder gets its own copy. Slower and uses more storage."],
];

const GROUP_OPTIONS = [
  ["only", "Only in Group Photos (not in each person's folder)"],
  ["both", "In Group Photos and in each person's folder"],
  ["off", "Don't make a Group Photos folder"],
];

export default function SavePhotos({
  perName, photos, driveFolder, groupMode, setGroupMode, groupPhotoCount, unknownFolder, setUnknownFolder, unknownCount,
  canSave, folderCounts, account, onSignIn, onBack, onSave,
}) {
  const [uploadLink, setUploadLink] = useState("");
  const [mode, setMode] = useState(driveFolder ? "copy" : "once");
  const chooseMode = setMode;
  const modeChoice = (
    <fieldset className="mode-choice">
      <legend className="sr-only">How to save in Google Drive</legend>
      {(driveFolder ? MODES_DRIVE : MODES_UPLOAD).map(([value, title, text]) => (
        <label key={value} className={`mode ${mode === value ? "selected" : ""}`}>
          <input type="radio" name="drive-mode" value={value} checked={mode === value} onChange={() => chooseMode(value)} />
          <span><strong>{title}</strong><br /><span className="muted small">{text}</span></span>
        </label>
      ))}
    </fieldset>
  );
  const people = Object.entries(perName).sort((a, b) => (folderCounts[b[0]] || 0) - (folderCounts[a[0]] || 0));

  return (
    <section className="card">
      <h1 className="card-title">Save into folders</h1>
      <p className="card-sub">
        Each person gets a folder. Photos with {GROUP_MIN_PEOPLE} or more people go into <strong>{GROUP_FOLDER}</strong>,
        and photos where nobody you named was found go into <strong>{UNKNOWN_FOLDER}</strong>.
      </p>

      <ul className="people-list">
        {people.map(([name, v]) => {
          const cover = v.faces[0];
          return (
            <li key={name}>
              <img src={cover.crop} alt="" />
              <span className="people-name">{name}</span>
              <span className="muted small">{folderCounts[name] || 0} photo{folderCounts[name] === 1 ? "" : "s"}</span>
            </li>
          );
        })}
        {groupPhotoCount > 0 && groupMode !== "off" && (
          <li>
            <span className="group-icon" aria-hidden="true">👥</span>
            <span className="people-name">{GROUP_FOLDER}</span>
            <span className="muted small">{groupPhotoCount} photo{groupPhotoCount === 1 ? "" : "s"}</span>
          </li>
        )}
        {unknownCount > 0 && unknownFolder && (
          <li>
            <span className="group-icon" aria-hidden="true">❔</span>
            <span className="people-name">{UNKNOWN_FOLDER}</span>
            <span className="muted small">{unknownCount} photo{unknownCount === 1 ? "" : "s"}</span>
          </li>
        )}
      </ul>

      {unknownCount > 0 && (
        <label className="check unknown-option">
          <input type="checkbox" checked={unknownFolder} onChange={e => setUnknownFolder(e.target.checked)} />
          <span>
            Put the {unknownCount} photo{unknownCount === 1 ? "" : "s"} where no named person was found into
            a <strong>{UNKNOWN_FOLDER}</strong> folder
          </span>
        </label>
      )}

      {groupPhotoCount > 0 && (
        <fieldset className="group-option">
          <legend className="field-label">
            Group photos <span className="muted small">({groupPhotoCount} photo{groupPhotoCount === 1 ? "" : "s"} with {GROUP_MIN_PEOPLE} or more people)</span>
          </legend>
          {GROUP_OPTIONS.map(([value, label]) => (
            <label key={value} className="check">
              <input type="radio" name="group-mode" value={value} checked={groupMode === value}
                     onChange={() => setGroupMode(value)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="dest-list">
        {driveFolder ? (
          <div className="dest primary column">
            <div>
              <h2 className="dest-title">Save in Google Drive</h2>
              <p className="muted small">Creates <strong>Sorted by Face</strong> inside “{driveFolder.name}”, with a folder per person.</p>
              <p className="safe small">✓ Your original photos are not moved, renamed or changed.</p>
              {!driveFolder.canAdd && <p className="note warn small">You may not have permission to add folders here.</p>}
            </div>
            {modeChoice}
            <div className="row end">
              <button className="btn btn-primary" disabled={!canSave} onClick={() => onSave("drive-here", null, mode)}>
                {mode === "shortcut" ? "Add shortcuts" : "Copy into folders"}
              </button>
            </div>
          </div>
        ) : googleConfigured && (
          <div className="dest primary column">
            <div className="grow">
              <h2 className="dest-title">Upload to Google Drive</h2>
              {account ? (
                <label className="field">
                  <span className="muted small">Paste the link of the Drive folder to put them in:</span>
                  <input type="url" placeholder="https://drive.google.com/drive/folders/…"
                         value={uploadLink} onChange={e => setUploadLink(e.target.value)} />
                </label>
              ) : <p className="muted small">Sign in to upload the folders to your Drive.</p>}
            </div>
            {account && modeChoice}
            <div className="row end">
              {account
                ? <button className="btn btn-primary" disabled={!canSave || !uploadLink.trim()} onClick={() => onSave("drive-upload", uploadLink, mode)}>Upload</button>
                : <button className="btn btn-secondary" onClick={onSignIn}>Sign in with Google</button>}
            </div>
          </div>
        )}

        {canPickFolder && (
          <div className="dest">
            <div>
              <h2 className="dest-title">Save to a folder on this computer</h2>
              <p className="muted small">Choose a folder; a sub-folder is made for each person.</p>
            </div>
            <button className="btn btn-secondary" disabled={!canSave} onClick={() => onSave("folder")}>Choose folder</button>
          </div>
        )}

        <div className="dest">
          <div>
            <h2 className="dest-title">Download as ZIP</h2>
            <p className="muted small">One file with a folder per person{driveFolder ? " (photos are downloaded from Drive first)" : ""}.</p>
          </div>
          <button className="btn btn-secondary" disabled={!canSave} onClick={() => onSave("zip")}>Download ZIP</button>
        </div>
      </div>

      <div className="actions start">
        <button className="btn btn-ghost" onClick={onBack}>← Back to names</button>
      </div>
      <p className="muted small">{photos.length} photos scanned · {groupPhotoCount} with {GROUP_MIN_PEOPLE}+ people.</p>
    </section>
  );
}
