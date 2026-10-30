// Saving the sorted photos: into Google Drive, or onto this computer (folder or ZIP).
import { downloadZip } from "client-zip";
import { DriveWriter, folderUrl } from "./google.js";
import { GROUP_FOLDER } from "./constants.js";

const DRIVE_PARALLEL = 4;

// Runs `work` for every item, a few at a time, reporting progress per photo.
async function eachPhoto(assignments, photos, parallel, onProgress, work) {
  let next = 0, done = 0;
  async function runner() {
    while (next < assignments.length) {
      const a = assignments[next++];
      const p = photos[a.photo];
      await work(p, a.names);
      onProgress?.({ done: ++done, total: assignments.length, current: `${p.name} → ${a.names.join(", ")}` });
    }
  }
  await Promise.all(Array.from({ length: parallel }, runner));
}

// The folder a photo physically goes into when it is moved; its other folders get shortcuts.
const mainFolder = names => (names.includes(GROUP_FOLDER) ? GROUP_FOLDER : names[0]);

/**
 * assignments: [{ photo, names: string[] }]
 * mode "move": each photo goes into one folder, the other folders get a shortcut (no duplicates).
 * mode "copy": every folder gets its own copy; originals stay where they are.
 */
export async function saveToDrive({ parentId, assignments, photos, mode, onProgress }) {
  const writer = await DriveWriter.create(parentId);
  // create every folder first, so parallel work never makes the same folder twice
  for (const name of new Set(assignments.flatMap(a => a.names))) await writer.target(name);

  await eachPhoto(assignments, photos, DRIVE_PARALLEL, onProgress, async (p, names) => {
    if (mode === "copy") {
      for (const name of names) {
        if (p.driveId) await writer.copy(p.driveId, p.name, name);
        else await writer.upload(p.file, p.name, name);
      }
      return;
    }
    const main = mainFolder(names);
    let fileId = p.driveId;
    if (fileId) await writer.move(fileId, p.name, main);
    else fileId = await writer.upload(p.file, p.name, main);
    if (!fileId) return; // already saved on an earlier run
    for (const name of names) if (name !== main) await writer.shortcut(fileId, p.name, name);
  });
  return folderUrl(writer.root);
}

export const canPickFolder = typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Writes "<chosen folder>/<name>/<photo>" using the browser's folder access (Chrome / Edge). */
export async function saveToComputerFolder({ assignments, photos, onProgress }) {
  const root = await window.showDirectoryPicker({ mode: "readwrite", id: "face-sorter" });
  const dirs = new Map();
  for (const name of new Set(assignments.flatMap(a => a.names))) {
    dirs.set(name, await root.getDirectoryHandle(name, { create: true }));
  }
  await eachPhoto(assignments, photos, 2, onProgress, async (p, names) => {
    const blob = await p.getBlob();
    for (const name of names) {
      const out = await (await dirs.get(name).getFileHandle(p.name, { create: true })).createWritable();
      await out.write(blob);
      await out.close();
    }
  });
  return root.name;
}

/** Downloads one ZIP with a folder per person. */
export async function saveAsZip({ assignments, photos, onProgress }) {
  let done = 0;
  async function* entries() {
    for (const { photo, names } of assignments) {
      const p = photos[photo];
      const blob = await p.getBlob();
      for (const name of names) {
        yield { name: `${name}/${p.name}`, input: blob, lastModified: p.file?.lastModified };
      }
      onProgress?.({ done: ++done, total: assignments.length, current: `${p.name} → ${names.join(", ")}` });
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
