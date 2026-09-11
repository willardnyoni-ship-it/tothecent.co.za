// A rolling local snapshot, distinct from the live-state save in
// BudgetStore's persistence effect - if a bug ever corrupts the live state,
// the last few days are still recoverable. Separate localStorage keys so a
// broken live state can't take the backups down with it.
const PREFIX = 'wnAutoBackup_';
const INDEX_KEY = 'wnAutoBackupIndex_v1';
const KEEP_DAYS = 5;

function todayKey() { return new Date().toISOString().slice(0, 10); }

function loadIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); } catch (e) { return []; }
}

// Called on every app load / state change - cheap no-op unless the day has
// rolled over since the last snapshot. Returns true if a new snapshot was
// actually written (callers use this to update the "Last backup" timestamp).
export function snapshotIfNeeded(S) {
  const today = todayKey();
  const index = loadIndex();
  if (index.includes(today)) return false;
  try {
    localStorage.setItem(PREFIX + today, JSON.stringify(S));
    const next = [...index, today].sort();
    while (next.length > KEEP_DAYS) {
      localStorage.removeItem(PREFIX + next.shift());
    }
    localStorage.setItem(INDEX_KEY, JSON.stringify(next));
    return true;
  } catch (e) { return false; } // storage full/unavailable - not fatal, live state is unaffected
}

export function listAutoBackups() {
  return loadIndex().slice().reverse();
}

export function readAutoBackup(dateKey) {
  try { return JSON.parse(localStorage.getItem(PREFIX + dateKey) || 'null'); } catch (e) { return null; }
}
