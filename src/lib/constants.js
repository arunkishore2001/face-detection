export const DEFAULT_GROUPING = 0.35;
export const GROUP_FOLDER = "Group Photos";
export const GROUP_MIN_PEOPLE = 3; // "more than 2 people"

// Folder-safe, tidy person name.
export const cleanName = s => (s || "").replace(/[\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
