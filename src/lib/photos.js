// Google Photos: the user chooses photos in Google's own picker window, and only those photos can be read.
import { authFetch } from "./google.js";

const API = "https://photospicker.googleapis.com/v1";
const URL_LIFETIME = 50 * 60_000; // a chosen photo's download address works for 60 minutes
export const SCAN_SIZE = 1600;    // matches MAX_SIDE in faceWorker.js

const json = (url, opts) => authFetch(url, opts).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seconds = d => (parseFloat(d) || 0) * 1000; // "5s" -> 5000

async function listItems(sessionId) {
  const items = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ sessionId, pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const r = await json(`${API}/mediaItems?${params}`);
    for (const m of r.mediaItems || []) {
      if (m.type === "VIDEO") continue;
      items.push({ id: m.id, name: m.mediaFile.filename || `${m.id}.jpg`, baseUrl: m.mediaFile.baseUrl });
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  return items;
}

/** The photos chosen in one picker session. Download addresses are renewed when they get old. */
class Selection {
  constructor(sessionId, items) {
    this.sessionId = sessionId;
    this.items = items;
    this.setUrls(items);
  }

  setUrls(items) {
    this.urls = new Map(items.map(m => [m.id, m.baseUrl]));
    this.listedAt = Date.now();
  }

  async url(id) {
    if (Date.now() - this.listedAt > URL_LIFETIME) {
      this.renewing ??= listItems(this.sessionId).then(items => this.setUrls(items)).finally(() => { this.renewing = null; });
      await this.renewing;
    }
    return this.urls.get(id);
  }

  /** The original photo, or a version at most `size` pixels on its longest side. */
  async download(id, size) {
    const suffix = size ? `=w${size}-h${size}` : "=d";
    return (await authFetch(`${await this.url(id)}${suffix}`)).blob();
  }
}

/**
 * Shows the Google Photos picker in `win` (opened during the click) and waits until the user clicks Done.
 * onOpen(url) gets the picker's address, so it can be opened again if the window gets lost.
 * Google's page cuts the link to its window (Cross-Origin-Opener-Policy), so `win.closed` reads true even
 * while it is open: only the session tells us when the user is done, and `signal` cancels the wait.
 */
export async function pickPhotos(win, { signal, onOpen } = {}) {
  const session = await json(`${API}/sessions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  if (win.closed) throw new Error("Your browser blocked the Google Photos window. Allow pop-ups for this site and try again.");
  const url = `${session.pickerUri}/autoclose`;
  win.location.href = url;
  onOpen?.(url);

  const interval = Math.max(seconds(session.pollingConfig?.pollInterval), 2000);
  const deadline = Date.now() + (seconds(session.pollingConfig?.timeoutIn) || 30 * 60_000);
  while (Date.now() < deadline) {
    await sleep(interval);
    if (signal?.aborted) {
      authFetch(`${API}/sessions/${session.id}`, { method: "DELETE" }).catch(() => {});
      throw new DOMException("Cancelled", "AbortError");
    }
    const s = await json(`${API}/sessions/${session.id}`);
    if (s.mediaItemsSet) {
      const items = await listItems(session.id);
      if (!items.length) throw new Error("No photos were chosen (videos are skipped).");
      return new Selection(session.id, items);
    }
  }
  throw new Error("Choosing photos took too long. Please try again.");
}
