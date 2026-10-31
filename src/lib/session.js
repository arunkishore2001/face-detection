// Unfinished work kept in this browser (IndexedDB), so a page refresh can continue where it stopped.
import { createStore, get, set, del, clear, keys } from "idb-keyval";

const scanStore = createStore("face-sorter-scan", "results"); // one entry per scanned photo
const SCAN_KEY = "scan-session";
const SAVE_KEY = "save-job";

const quiet = promise => promise.catch(() => undefined); // storage can be unavailable (private window etc.)

/** { source, label, link, total, complete } plus how many photos are already scanned, or null. */
export async function loadScanSession() {
  const s = await quiet(get(SCAN_KEY));
  if (!s) return null;
  return { ...s, done: (await quiet(keys(scanStore)))?.length || 0 };
}

/** Starts or continues a scan; saved results of a different source are dropped. */
export async function beginScan(meta) {
  const old = await quiet(get(SCAN_KEY));
  if (old?.source !== meta.source) await quiet(clear(scanStore));
  await quiet(set(SCAN_KEY, { ...meta, complete: false }));
}

export async function finishScan() {
  const s = await quiet(get(SCAN_KEY));
  if (s) await quiet(set(SCAN_KEY, { ...s, complete: true }));
}

export async function discardScan() {
  await quiet(del(SCAN_KEY));
  await quiet(clear(scanStore));
}

/** Per-photo results: { faces: [{ embedding, crop }], preview }, keyed by the photo's cacheKey. */
export const scanCache = {
  get: key => quiet(get(key, scanStore)),
  put: (key, result) => quiet(set(key, result, scanStore)),
};

/** A Drive save in progress: { folderId, folderName, mode, items: [{ driveId, name, names }] }. */
export const loadSaveJob = () => quiet(get(SAVE_KEY)).then(j => j || null);
export const storeSaveJob = job => quiet(set(SAVE_KEY, job));
export const discardSaveJob = () => quiet(del(SAVE_KEY));
