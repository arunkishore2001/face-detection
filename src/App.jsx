import { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import Stepper from "./components/Stepper.jsx";
import ChoosePhotos from "./components/ChoosePhotos.jsx";
import Progress from "./components/Progress.jsx";
import NameFaces from "./components/NameFaces.jsx";
import SavePhotos from "./components/SavePhotos.jsx";
import Done from "./components/Done.jsx";
import ResetDialog from "./components/ResetDialog.jsx";
import Viewer from "./components/Viewer.jsx";
import Resume from "./components/Resume.jsx";
import {
  getAccount, getFolder, listPhotos, downloadFile, downloadForScan, parseFolderId, signIn, signOut, hasPhotosAccess,
} from "./lib/google.js";
import { pickPhotos, SCAN_SIZE as PHOTOS_SCAN } from "./lib/photos.js";
import { scanPhotos, makeGroups } from "./lib/faces.js";
import { loadPeople, rememberPeople, forgetEveryone, forgetPerson } from "./lib/people.js";
import { saveToDrive, saveToComputerFolder, saveAsZip } from "./lib/save.js";
import {
  beginScan, finishScan, discardScan, scanCache, loadScanSession, loadSaveJob, storeSaveJob, discardSaveJob,
} from "./lib/session.js";
import { DEFAULT_GROUPING, GROUP_FOLDER, GROUP_MIN_PEOPLE, UNKNOWN_FOLDER, SPECIAL_FOLDERS, cleanName } from "./lib/constants.js";

const stored = key => { try { return localStorage.getItem(key); } catch { return null; } };

function buildTree(embeddings) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./lib/clusterWorker.js", import.meta.url), { type: "module" });
    w.onmessage = ({ data }) => { w.terminate(); resolve(data); };
    w.onerror = e => { w.terminate(); reject(new Error(e.message)); };
    w.postMessage({ embeddings });
  });
}

function uniqueNames(items) {
  const used = new Set();
  return items.map(it => {
    let name = it.name;
    const dot = name.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`;
    used.add(name.toLowerCase());
    return { ...it, name };
  });
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [step, setStep] = useState("photos"); // photos | scanning | faces | saving | done
  const [source, setSource] = useState(() => stored("fs-source") || "drive");
  const [driveLink, setDriveLink] = useState(() => stored("fs-drive-link") || "");
  const [localFiles, setLocalFiles] = useState([]);
  const [photosPick, setPhotosPick] = useState(null); // photos chosen in the Google Photos picker
  const [photosAllowed, setPhotosAllowed] = useState(hasPhotosAccess);
  const [picking, setPicking] = useState(false);
  const [driveFolder, setDriveFolder] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [faces, setFaces] = useState([]);
  const [tree, setTree] = useState(null);
  const [grouping, setGrouping] = useState(DEFAULT_GROUPING);
  const [people, setPeople] = useState({});
  const [names, setNames] = useState({});
  const [excluded, setExcluded] = useState(() => new Set());
  const [groupMode, setGroupMode] = useState(() => stored("fs-group-mode-v2") || "only"); // only | both | off
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [resume, setResume] = useState(null); // unfinished scan / save from before a page refresh
  const abortRef = useRef(null);

  useEffect(() => { getAccount().then(setAccount); loadPeople().then(setPeople); }, []);
  useEffect(() => {
    if (step !== "photos") return;
    Promise.all([loadScanSession(), loadSaveJob()]).then(([scan, save]) => setResume(scan || save ? { scan, save } : null));
  }, [step]);
  useEffect(() => { try { localStorage.setItem("fs-source", source); } catch { /* ignore */ } }, [source]);
  useEffect(() => { try { localStorage.setItem("fs-group-mode-v2", groupMode); } catch { /* ignore */ } }, [groupMode]);
  const [unknownFolder, setUnknownFolder] = useState(() => stored("fs-unknown-folder") !== "off");
  useEffect(() => { try { localStorage.setItem("fs-unknown-folder", unknownFolder ? "on" : "off"); } catch { /* ignore */ } }, [unknownFolder]);

  const busy = step === "scanning" || step === "saving";
  const hasWork = faces.length > 0 && step !== "done";
  useEffect(() => {
    if (!busy && !hasWork) return;
    const warn = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, hasWork]);

  const groups = useMemo(
    () => (tree ? makeGroups(faces, tree, grouping, people) : []),
    [faces, tree, grouping, people],
  );
  const nameOf = g => names[g.key] ?? g.suggestion;

  // Which folders each photo goes into: the typed names (same name on two cards = same person),
  // plus "Group Photos" for photos with GROUP_MIN_PEOPLE or more faces.
  const { assignments, perName, groupPhotoCount, unknownCount, folderCounts } = useMemo(() => {
    const byPhoto = new Map(), perName = {};
    for (const g of groups) {
      const name = cleanName(nameOf(g));
      if (!name) continue;
      for (const f of g.faces) {
        if (excluded.has(f.id)) continue;
        if (!byPhoto.has(f.photo)) byPhoto.set(f.photo, new Set());
        byPhoto.get(f.photo).add(name);
        (perName[name] ||= { faces: [], photos: new Set() }).faces.push(f);
        perName[name].photos.add(f.photo);
      }
    }

    const facesPerPhoto = new Map();
    faces.forEach(f => facesPerPhoto.set(f.photo, (facesPerPhoto.get(f.photo) || 0) + 1));
    let groupPhotoCount = 0;
    for (const [photo, count] of facesPerPhoto) {
      if (count < GROUP_MIN_PEOPLE) continue;
      groupPhotoCount++;
      if (groupMode === "off") continue;
      const set = groupMode === "only" ? new Set() : byPhoto.get(photo) || new Set();
      set.add(GROUP_FOLDER);
      byPhoto.set(photo, set);
    }

    // everything nobody was found in goes to "Not Recognised"
    let unknownCount = 0;
    for (let i = 0; i < photos.length; i++) {
      if (byPhoto.has(i)) continue;
      unknownCount++;
      if (unknownFolder) byPhoto.set(i, new Set([UNKNOWN_FOLDER]));
    }

    const assignments = [...byPhoto].map(([photo, set]) => ({ photo, names: [...set].sort() }));
    const folderCounts = {};
    assignments.forEach(a => a.names.forEach(n => { folderCounts[n] = (folderCounts[n] || 0) + 1; }));
    return { assignments, perName, groupPhotoCount, unknownCount, folderCounts };
  }, [groups, names, excluded, faces, photos, groupMode, unknownFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignIn() {
    setError(null);
    try { setAccount(await signIn("select_account")); } catch (e) { setError(e.message); }
  }

  function handleSignOut() {
    signOut();
    setAccount(null);
    setPhotosAllowed(false);
    setPhotosPick(null);
  }

  async function allowPhotos() {
    setError(null);
    try {
      setAccount(await signIn("", true));
      setPhotosAllowed(true);
    } catch (e) { setError(e.message); }
  }

  // `win` is opened during the click, so the browser doesn't block it as a popup
  async function choosePhotos(win) {
    setError(null);
    setPicking(true);
    try {
      setPhotosPick(await pickPhotos(win));
    } catch (e) {
      if (!win.closed) win.close();
      setError(e.message);
    } finally {
      setPicking(false);
    }
  }

  // `from` continues an earlier Drive scan: { link }
  async function findFaces(from) {
    setError(null);
    let items, session;
    const link = from?.link ?? driveLink;
    if (from) { setSource("drive"); setDriveLink(link); }
    try {
      if (!from && source === "photos") {
        if (!photosPick?.items.length) throw new Error("Choose some photos in Google Photos first.");
        setDriveFolder(null);
        setStep("scanning");
        items = photosPick.items.map(m => ({
          name: m.name, cacheKey: `photos|${m.id}`,
          getBlob: () => photosPick.download(m.id), getScanBlob: () => photosPick.download(m.id, PHOTOS_SCAN),
        }));
        session = { source: "photos", label: "photos from Google Photos" };
      } else if (from || source === "drive") {
        const id = parseFolderId(link);
        try { localStorage.setItem("fs-drive-link", link.trim()); } catch { /* ignore */ }
        setStep("scanning");
        setProgress({ title: "Opening your Google Drive folder…" });
        const folder = await getFolder(id);
        setDriveFolder({ id, name: folder.name, canAdd: folder.capabilities?.canAddChildren !== false });
        const files = await listPhotos(id, n => setProgress({ title: `Finding photos in “${folder.name}”…`, found: n }));
        if (!files.length) throw new Error(`No photos found in “${folder.name}”.`);
        items = files.map(f => ({
          name: f.name, driveId: f.id, cacheKey: f.id,
          getBlob: () => downloadFile(f.id), getScanBlob: () => downloadForScan(f),
        }));
        session = { source: `drive:${id}`, label: folder.name, link: link.trim() };
      } else {
        if (!localFiles.length) throw new Error("Choose some photos first.");
        setDriveFolder(null);
        setStep("scanning");
        items = localFiles.map(f => ({
          name: f.name, file: f, cacheKey: `local|${f.name}|${f.size}|${f.lastModified}`, getBlob: async () => f,
        }));
        session = { source: "local", label: "photos from this computer" };
      }
      items = uniqueNames(items);
      await beginScan({ ...session, total: items.length });

      abortRef.current = new AbortController();
      let lastPreview = null;
      const scan = await scanPhotos(items, {
        signal: abortRef.current.signal,
        cache: scanCache,
        onProgress: p => {
          if (p.preview) {
            if (lastPreview) URL.revokeObjectURL(lastPreview);
            lastPreview = URL.createObjectURL(p.preview);
          }
          setProgress({ title: "Looking for faces", done: p.done, total: p.total, current: p.current, preview: lastPreview });
        },
      });
      setProgress({ title: "Grouping faces of the same person…" });
      const builtTree = await buildTree(scan.faces.map(f => f.embedding));
      if (lastPreview) URL.revokeObjectURL(lastPreview);
      await finishScan();

      releaseUrls();
      setPhotos(items.map((it, i) => ({ ...it, ...scan.photos[i] })));
      setFaces(scan.faces);
      setTree(builtTree);
      setNames({});
      setExcluded(new Set());
      setPeople(await loadPeople());
      setStep("faces");
    } catch (e) {
      setStep("photos");
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setProgress(null);
    }
  }

  async function save(kind, uploadLink, mode = "copy") {
    if (kind === "drive-here") {
      // kept until the save finishes, so a page refresh can continue it (photos already done are skipped)
      await storeSaveJob({
        folderId: driveFolder.id, folderName: driveFolder.name, mode,
        items: assignments.map(a => ({ driveId: photos[a.photo].driveId, name: photos[a.photo].name, names: a.names })),
      });
    }
    // remembered before saving, so the names are not lost if the page is refreshed while saving
    setPeople(await rememberPeople(
      Object.fromEntries(Object.entries(perName).map(([n, v]) => [n, v.faces.map(f => f.embedding)])),
    ));
    await runSave({ kind, uploadLink, mode, assignments, photos, folder: driveFolder });
  }

  function continueSave(job) {
    return runSave({
      kind: "drive-here", mode: job.mode, folder: { id: job.folderId, name: job.folderName }, resumed: true,
      photos: job.items.map(({ driveId, name }) => ({ driveId, name })),
      assignments: job.items.map((it, i) => ({ photo: i, names: it.names })),
    });
  }

  async function discardResume() {
    await discardSaveJob();
    await discardScan();
    setResume(null);
  }

  async function runSave({ kind, uploadLink, mode, assignments, photos, folder, resumed = false }) {
    setError(null);
    const total = assignments.length;
    setStep("saving");
    setProgress({ title: "Saving…", done: 0, total });
    const toDrive = kind.startsWith("drive");
    const title = "Saving your folders";
    const onProgress = p => setProgress({ title, ...p });
    try {
      const counts = {};
      assignments.forEach(a => a.names.forEach(n => { counts[n] = (counts[n] || 0) + 1; }));
      const out = { kind, resumed, mode: toDrive ? mode : "copy", photoCount: assignments.length, counts: Object.entries(counts).sort((a, b) => SPECIAL_FOLDERS.indexOf(a[0]) - SPECIAL_FOLDERS.indexOf(b[0]) || b[1] - a[1]) };
      if (kind === "drive-here") {
        out.url = await saveToDrive({ parentId: folder.id, assignments, photos, mode, onProgress });
        out.where = folder.name;
      } else if (kind === "drive-upload") {
        const id = parseFolderId(uploadLink);
        const folder = await getFolder(id);
        out.url = await saveToDrive({ parentId: id, assignments, photos, mode, onProgress });
        out.where = folder.name;
      } else if (kind === "folder") {
        out.where = await saveToComputerFolder({ assignments, photos, onProgress });
      } else {
        await saveAsZip({ assignments, photos, onProgress });
      }
      await discardSaveJob();
      await discardScan();
      setResume(null);
      setResult(out);
      setStep("done");
    } catch (e) {
      setStep(resumed ? "photos" : "faces");
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setProgress(null);
    }
  }

  function releaseUrls() {
    photos.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
    faces.forEach(f => URL.revokeObjectURL(f.crop));
  }

  async function reset({ forget, logout }) {
    abortRef.current?.abort();
    releaseUrls();
    setPhotos([]); setFaces([]); setTree(null); setNames({}); setExcluded(new Set());
    setGrouping(DEFAULT_GROUPING); setLocalFiles([]); setPhotosPick(null); setDriveFolder(null); setResult(null); setError(null);
    setStep("photos");
    await discardResume();
    if (forget) { await forgetEveryone(); setPeople({}); }
    if (logout) handleSignOut();
    setResetOpen(false);
  }

  const stepIndex = { photos: 0, scanning: 1, faces: 1, save: 2, saving: 2, done: 2 }[step];

  return (
    <div className="app">
      <Header account={account} onSignIn={handleSignIn} onSignOut={handleSignOut}
              onReset={() => setResetOpen(true)} />
      <main className="main">
        <Stepper current={stepIndex} done={step === "done"} />
        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {step === "photos" && resume && (
          <Resume
            resume={resume} account={account} onSignIn={handleSignIn}
            onContinueScan={() => findFaces({ link: resume.scan.link })}
            onContinueSave={() => continueSave(resume.save)}
            onDiscard={discardResume}
          />
        )}

        {step === "photos" && (
          <ChoosePhotos
            source={source} setSource={setSource}
            account={account} onSignIn={handleSignIn}
            driveLink={driveLink} setDriveLink={setDriveLink}
            localFiles={localFiles} setLocalFiles={setLocalFiles}
            photosAllowed={photosAllowed} onAllowPhotos={allowPhotos}
            photosPick={photosPick} onChoosePhotos={choosePhotos} onClearPhotos={() => setPhotosPick(null)} picking={picking}
            onNext={() => findFaces()}
          />
        )}

        {busy && progress && (
          <Progress {...progress} onStop={step === "scanning" ? () => abortRef.current?.abort() : null} />
        )}

        {step === "faces" && (
          <NameFaces
            groups={groups} photoCount={photos.length} photos={photos}
            grouping={grouping} setGrouping={setGrouping}
            nameOf={nameOf} setName={(key, v) => setNames(n => ({ ...n, [key]: v }))}
            excluded={excluded}
            toggleExcluded={id => setExcluded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
            knownNames={Object.keys(people)}
            namedCount={Object.keys(perName).length} canContinue={assignments.length > 0}
            onView={setViewing}
            onBack={() => setStep("photos")}
            onNext={() => setStep("save")}
          />
        )}

        {step === "save" && (
          <SavePhotos
            perName={perName} photos={photos} driveFolder={driveFolder}
            groupMode={groupMode} setGroupMode={setGroupMode} groupPhotoCount={groupPhotoCount}
            unknownFolder={unknownFolder} setUnknownFolder={setUnknownFolder} unknownCount={unknownCount}
            canSave={assignments.length > 0} folderCounts={folderCounts}
            account={account} onSignIn={handleSignIn}
            onBack={() => setStep("faces")} onSave={save}
          />
        )}

        {step === "done" && result && (
          <Done result={result} onAgain={() => reset({})} onBack={result.resumed ? null : () => setStep("faces")} />
        )}
      </main>

      <footer className="footer">
        Your photos are processed in this browser. They only go to your own Google Drive.
      </footer>

      {resetOpen && (
        <ResetDialog
          people={Object.keys(people)} signedIn={!!account}
          onForgetOne={async n => setPeople(await forgetPerson(n))}
          onConfirm={reset} onClose={() => setResetOpen(false)}
        />
      )}
      {viewing && <Viewer src={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
