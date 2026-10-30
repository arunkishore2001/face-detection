export const DEFAULT_GROUPING = 0.35;
export const GROUP_FOLDER = "Group Photos";
export const GROUP_MIN_PEOPLE = 3; // "more than 2 people"
export const UNKNOWN_FOLDER = "Not Recognised"; // photos where no named person was found
export const SPECIAL_FOLDERS = [GROUP_FOLDER, UNKNOWN_FOLDER];

// Folder-safe, tidy person name.
export const cleanName = s => (s || "").replace(/[\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
