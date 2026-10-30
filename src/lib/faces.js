// Main-thread side of face finding: a small pool of workers, and turning clusters into face cards.
import { cutTree, dot, normalise } from "./cluster.js";
import { suggestName } from "./people.js";

const BASE = import.meta.env.BASE_URL;

class Pool {
  constructor(size) {
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL("./faceWorker.js", import.meta.url), { type: "module" });
      w.pending = new Map();
      w.onmessage = ({ data }) => {
        const p = w.pending.get(data.id);
        w.pending.delete(data.id);
        data.ok ? p.resolve(data.result) : p.reject(new Error(data.error));
      };
      return w;
    });
    this.idle = [...this.workers];
    this.waiting = [];
    this.nextId = 1;
  }

  call(worker, msg) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      worker.pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id });
    });
  }

  init() {
    return Promise.all(this.workers.map(w => this.call(w, { type: "init", base: new URL(BASE, location.href).href })));
  }

  async process(blob) {
    const worker = this.idle.pop() || await new Promise(r => this.waiting.push(r));
    try {
      return await this.call(worker, { type: "process", blob });
    } finally {
      const next = this.waiting.shift();
      next ? next(worker) : this.idle.push(worker);
    }
  }
}

let poolPromise = null;
export function getPool() {
  if (!poolPromise) {
    const size = Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
    const pool = new Pool(size);
    poolPromise = pool.init().then(() => pool, err => { poolPromise = null; throw err; });
  }
  return poolPromise;
}

async function toReadableBlob(blob, name) {
  if (/\.(heic|heif)$/i.test(name) || /hei[cf]/i.test(blob.type)) {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
    return Array.isArray(out) ? out[0] : out;
  }
  return blob;
}

/**
 * Finds faces in every photo.
 * photos: [{ name, getBlob: () => Promise<Blob> }]
 * Returns { photos: [{ name, preview, failed }], faces: [{ id, photo, crop, embedding }] }
 */
export async function scanPhotos(photos, { onProgress, signal }) {
  const pool = await getPool();
  const results = new Array(photos.length);
  let next = 0, done = 0;

  async function runner() {
    while (next < photos.length && !signal?.aborted) {
      const i = next++;
      try {
        const blob = await toReadableBlob(await photos[i].getBlob(), photos[i].name);
        results[i] = await pool.process(blob);
      } catch (err) {
        console.warn("Could not read", photos[i].name, err);
        results[i] = { faces: [], preview: null, failed: true };
      }
      done++;
      onProgress?.({ done, total: photos.length, current: photos[i].name, preview: results[i].preview });
    }
  }
  // a few more runners than workers so downloads overlap with face finding
  await Promise.all(Array.from({ length: pool.workers.length + 2 }, runner));
  if (signal?.aborted) throw new DOMException("Stopped", "AbortError");

  const faces = [];
  const outPhotos = photos.map((p, i) => {
    const r = results[i];
    r.faces.forEach(f => faces.push({
      id: faces.length, photo: i, crop: URL.createObjectURL(f.crop), embedding: f.embedding,
    }));
    return { name: p.name, preview: r.preview ? URL.createObjectURL(r.preview) : null, failed: !!r.failed };
  });
  return { photos: outPhotos, faces };
}

/** Face cards for a given grouping value, biggest group first, with a suggested name for each. */
export function makeGroups(faces, tree, grouping, people) {
  const labels = cutTree(tree, grouping);
  const byLabel = new Map();
  faces.forEach((f, i) => {
    if (!byLabel.has(labels[i])) byLabel.set(labels[i], []);
    byLabel.get(labels[i]).push(f);
  });

  const groups = [...byLabel.values()].map(members => {
    const centre = normalise(members.reduce((acc, f) => acc.map((x, k) => x + f.embedding[k]), new Float32Array(128)));
    const sorted = [...members].sort((a, b) => dot(b.embedding, centre) - dot(a.embedding, centre));
    return {
      key: sorted[0].id, // the clearest face identifies the card
      faces: sorted,
      photoCount: new Set(members.map(f => f.photo)).size,
      suggestion: suggestName(centre, people),
    };
  });
  return groups.sort((a, b) => b.photoCount - a.photoCount || b.faces.length - a.faces.length);
}
