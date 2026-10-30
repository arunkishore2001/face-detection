// Google sign-in (Google Identity Services) and the Google Drive calls the app needs.
const CLIENT_ID = __GOOGLE_CLIENT_ID__; // set from GOOGLE_CLIENT_ID at build time (vite.config.js)
const SCOPE = "https://www.googleapis.com/auth/drive";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";
const FOLDER = "application/vnd.google-apps.folder";
const TOKEN_KEY = "fs-google-token";
export const OUTPUT_FOLDER = "Sorted by Face";
export const IMAGE_RE = /\.(jpe?g|png|webp|bmp|gif|heic|heif)$/i;

export const googleConfigured = Boolean(CLIENT_ID);

let token = null;
try { token = JSON.parse(sessionStorage.getItem(TOKEN_KEY)); } catch { /* storage unavailable */ }

let gisPromise = null;
function loadGis() {
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { gisPromise = null; reject(new Error("Could not load Google sign-in.")); };
    document.head.append(s);
  });
  return gisPromise;
}

function saveToken(t) {
  token = t;
  try { t ? sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export const hasValidToken = () => Boolean(token && token.expiresAt > Date.now() + 60_000);

/** Opens Google's sign-in popup. Must be called from a click. */
export async function signIn(prompt = "") {
  if (!googleConfigured) throw new Error("Google sign-in is not set up (GOOGLE_CLIENT_ID is missing).");
  await loadGis();
  const response = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: r => (r.error ? reject(new Error(r.error_description || r.error)) : resolve(r)),
      error_callback: e => reject(new Error(e.type === "popup_closed" ? "Sign-in was cancelled." : e.message || e.type)),
    });
    client.requestAccessToken({ prompt });
  });
  if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
    throw new Error("Please tick the Google Drive permission so Face Sorter can read and sort your photos.");
  }
  saveToken({ value: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 });
  return getAccount();
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value, () => {});
  saveToken(null);
}

async function authFetch(url, opts = {}, retry = true) {
  if (!hasValidToken()) {
    try { await signIn(""); } catch { throw new Error("Your Google sign-in expired. Click “Sign in with Google” again."); }
  }
  const res = await fetch(url, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token.value}` } });
  if (res.status === 401 && retry) {
    saveToken(null);
    return authFetch(url, opts, false);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.error?.message || res.statusText;
    if (res.status === 404) throw new Error("Folder or file not found. Check the link and that this Google account can open it.");
    throw new Error(`Google Drive: ${msg}`);
  }
  return res;
}

const json = (url, opts) => authFetch(url, opts).then(r => r.json());
const q = s => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function getAccount() {
  if (!hasValidToken()) return null;
  try {
    const { user } = await json(`${API}/about?fields=user(emailAddress,displayName,photoLink)`);
    return { email: user.emailAddress, name: user.displayName, photo: user.photoLink };
  } catch {
    return null;
  }
}

export function parseFolderId(link) {
  const s = (link || "").trim();
  const m = s.match(/\/folders\/([\w-]+)/) || s.match(/[?&]id=([\w-]+)/);
  if (m) return m[1];
  if (/^[\w-]{15,}$/.test(s)) return s;
  throw new Error("That doesn't look like a Google Drive folder link.");
}

export const folderUrl = id => `https://drive.google.com/drive/folders/${id}`;

async function children(folderId, extra = "") {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false${extra}`,
      fields: "nextPageToken, files(id, name, mimeType, size)",
      pageSize: "1000", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const r = await json(`${API}/files?${params}`);
    files.push(...r.files);
    pageToken = r.nextPageToken;
  } while (pageToken);
  return files;
}

export async function getFolder(folderId) {
  const f = await json(`${API}/files/${folderId}?fields=id,name,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`);
  if (f.mimeType !== FOLDER) throw new Error("That link is a file, not a folder.");
  return f;
}

/** All photos in a folder and its sub-folders (skipping our own output folder). */
export async function listPhotos(folderId, onFound) {
  const photos = [], pending = [folderId];
  while (pending.length) {
    for (const f of await children(pending.pop())) {
      if (f.mimeType === FOLDER) {
        if (f.name !== OUTPUT_FOLDER) pending.push(f.id);
      } else if (f.mimeType.startsWith("image/") || IMAGE_RE.test(f.name)) {
        photos.push(f);
        onFound?.(photos.length);
      }
    }
  }
  return photos.sort((a, b) => a.name.localeCompare(b.name));
}

export const downloadFile = id =>
  authFetch(`${API}/files/${id}?alt=media&supportsAllDrives=true`).then(r => r.blob());

/** Creates "<parent>/Sorted by Face/<name>/" folders and puts photos into them. */
export class DriveWriter {
  static async create(parentId) {
    const w = new DriveWriter();
    w.root = await w.folder(OUTPUT_FOLDER, parentId);
    w.folders = new Map();
    return w;
  }

  async folder(name, parent) {
    const found = await children(parent, ` and mimeType = '${FOLDER}' and name = '${q(name)}'`);
    if (found.length) return found[0].id;
    const r = await json(`${API}/files?supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
    });
    return r.id;
  }

  async target(name) {
    if (!this.folders.has(name)) {
      const id = await this.folder(name, this.root);
      const existing = new Set((await children(id)).map(f => f.name));
      this.folders.set(name, { id, existing });
    }
    return this.folders.get(name);
  }

  /** Copy a photo that is already in Drive (no re-upload). */
  async copy(fileId, fileName, person) {
    const t = await this.target(person);
    if (t.existing.has(fileName)) return;
    await json(`${API}/files/${fileId}/copy?supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fileName, parents: [t.id] }),
    });
    t.existing.add(fileName);
  }

  /** Upload a photo from this computer. */
  async upload(file, person) {
    const t = await this.target(person);
    if (t.existing.has(file.name)) return;
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name: file.name, parents: [t.id] })], { type: "application/json" }));
    form.append("file", file);
    await authFetch(UPLOAD, { method: "POST", body: form });
    t.existing.add(file.name);
  }
}
