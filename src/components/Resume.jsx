// Offers to continue a scan or save that was interrupted by a page refresh.
const MODE_VERB = { copy: "copied", shortcut: "added as shortcuts", move: "moved" };

export default function Resume({ resume, account, onSignIn, onContinueScan, onContinueSave, onDiscard }) {
  const { scan, save } = resume;
  const signInFirst = !account && <button className="btn btn-secondary" onClick={onSignIn}>Sign in with Google to continue</button>;

  if (save) {
    return (
      <section className="card resume">
        <h2 className="dest-title">Saving was interrupted</h2>
        <p className="muted small">
          {save.items.length} photo{save.items.length === 1 ? " was" : "s were"} being {MODE_VERB[save.mode] || "saved"} into
          {" "}<strong>{save.folderName} › Sorted by Face</strong>. Continuing skips the photos that are already there.
        </p>
        <div className="row end">
          <button className="btn btn-ghost" onClick={onDiscard}>Discard</button>
          {signInFirst || <button className="btn btn-primary" onClick={onContinueSave}>Continue saving</button>}
        </div>
      </section>
    );
  }

  const fromDrive = scan.source.startsWith("drive:");
  return (
    <section className="card resume">
      <h2 className="dest-title">
        {scan.complete ? <>Your scan of “{scan.label}” is ready</> : <>Finding faces in “{scan.label}” was interrupted</>}
      </h2>
      <p className="muted small">
        {scan.complete
          ? "Continue to name the faces; nothing needs to be downloaded again."
          : `${scan.done} of ${scan.total} photos are done; only the rest will be scanned.`}
        {scan.source === "local" && " Add the same photos again below, then click Find faces."}
        {scan.source === "photos" && " Choose the same photos in Google Photos again, then click Find faces."}
      </p>
      <div className="row end">
        <button className="btn btn-ghost" onClick={onDiscard}>Discard</button>
        {fromDrive && (signInFirst || <button className="btn btn-primary" onClick={onContinueScan}>Continue</button>)}
      </div>
    </section>
  );
}
