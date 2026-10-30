// Saving the sorted photos: into Google Drive, or onto this computer (folder or ZIP).
import { downloadZip } from "client-zip";
import { DriveWriter, folderUrl } from "./google.js";

/** assignments: [{ photo, names: string[] }] */
export async function saveToDrive({ parentId, assignments, photos, onProgress }) {
  const writer = await DriveWriter.create(parentId);
  let done = 0;
  const total = assignments.reduce((n, a) => n + a.names.length, 0);
  for (const { photo, names } of assignments) {
    const p = photos[photo];
    for (const name of names) {
      if (p.driveId) await writer.copy(p.driveId, p.name, name);
      else await writer.upload(p.file, name);
      onProgress?.({ done: ++done, total, current: `${name} / ${p.name}` });
    }
  }
  return folderUrl(writer.root);
}

export const canPickFolder = typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Writes "<chosen folder>/<name>/<photo>" using the browser's folder access (Chrome / Edge). */
export async function saveToComputerFolder({ assignments, photos, onProgress }) {
  const root = await window.showDirectoryPicker({ mode: "readwrite", id: "face-sorter" });
  const dirs = new Map();
  let done = 0;
  const total = assignments.reduce((n, a) => n + a.names.length, 0);
  for (const { photo, names } of assignments) {
    const p = photos[photo];
    for (const name of names) {
      if (!dirs.has(name)) dirs.set(name, await root.getDirectoryHandle(name, { create: true }));
      const handle = await dirs.get(name).getFileHandle(p.name, { create: true });
      const out = await handle.createWritable();
      await out.write(await p.getBlob());
      await out.close();
      onProgress?.({ done: ++done, total, current: `${name} / ${p.name}` });
    }
  }
  return root.name;
}

/** Downloads one ZIP with a folder per person. */
export async function saveAsZip({ assignments, photos, onProgress }) {
  let done = 0;
  const total = assignments.reduce((n, a) => n + a.names.length, 0);
  async function* entries() {
    for (const { photo, names } of assignments) {
      const p = photos[photo];
      const blob = await p.getBlob();
      for (const name of names) {
        yield { name: `${name}/${p.name}`, input: blob, lastModified: p.file?.lastModified };
        onProgress?.({ done: ++done, total, current: `${name} / ${p.name}` });
      }
    }
  }
  const blob = await downloadZip(entries()).blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "Sorted by Face.zip" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
