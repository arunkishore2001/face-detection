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

// For uploads from this computer: the folder the single uploaded file goes into; its other folders get shortcuts.
const mainFolder = names => (names.includes(GROUP_FOLDER) ? GROUP_FOLDER : names[0]);

/**
 * Saves into "<parent>/Sorted by Face/<folder>/". Original photos are only read, never moved or changed.
 * assignments: [{ photo, names: string[] }]
 * Photos already in Drive:  mode "copy" = a real copy in each folder, "shortcut" = a shortcut in each folder.
 * Photos from this computer: mode "once" = uploaded once + shortcuts in other folders, "copy" = uploaded to each folder.
 */
export async function saveToDrive({ parentId, assignments, photos, mode, onProgress }) {
  const writer = await DriveWriter.create(parentId);
  // create every folder first, so parallel work never makes the same folder twice
  for (const name of new Set(assignments.flatMap(a => a.names))) await writer.target(name);

  await eachPhoto(assignments, photos, DRIVE_PARALLEL, onProgress, async (p, names) => {
    if (p.driveId) {
      for (const name of names) {
        if (mode === "shortcut") await writer.shortcut(p.driveId, p.name, name);
        else await writer.copy(p.driveId, p.name, name);
      }
    } else if (mode === "copy") {
      for (const name of names) await writer.upload(p.file, p.name, name);
    } else {
      const main = mainFolder(names);
      const fileId = await writer.upload(p.file, p.name, main);
      if (fileId) for (const name of names) if (name !== main) await writer.shortcut(fileId, p.name, name);
    }
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
