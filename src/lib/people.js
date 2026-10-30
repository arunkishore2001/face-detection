// Remembered people: face fingerprints stored in this browser (IndexedDB), used to pre-fill names.
import { get, set, del } from "idb-keyval";
import { dot } from "./cluster.js";

const KEY = "people";
const MAX_PER_PERSON = 200;
const NAME_MATCH = 0.4;

/** Returns { name: Float32Array[] } */
export async function loadPeople() {
  try {
    return (await get(KEY)) || {};
  } catch {
    return {};
  }
}

export async function rememberPeople(byName) {
  const people = await loadPeople();
  for (const [name, embeddings] of Object.entries(byName)) {
    people[name] = [...(people[name] || []), ...embeddings].slice(-MAX_PER_PERSON);
  }
  await set(KEY, people);
  return people;
}

export async function forgetPerson(name) {
  const people = await loadPeople();
  delete people[name];
  await set(KEY, people);
  return people;
}

export async function forgetEveryone() {
  await del(KEY);
}

export function suggestName(centre, people) {
  let best = "", bestScore = NAME_MATCH;
  for (const [name, refs] of Object.entries(people)) {
    for (const ref of refs) {
      const s = dot(ref, centre);
      if (s >= bestScore) { best = name; bestScore = s; }
    }
  }
  return best;
}
