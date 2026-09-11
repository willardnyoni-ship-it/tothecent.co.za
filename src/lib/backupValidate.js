// Guards against a malformed/corrupt JSON file silently wiping good data on
// restore - checks shape, not exact values, since the format evolves.
export function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'That file is not a valid backup (not an object).';
  if (data.tx !== undefined) {
    if (!Array.isArray(data.tx)) return 'That backup\'s transaction list is corrupted.';
    for (const t of data.tx) {
      if (!t || typeof t !== 'object') return 'That backup contains an invalid transaction entry.';
      if (typeof t.a !== 'number' || !Number.isFinite(t.a)) return 'That backup contains a transaction with an invalid amount.';
      if (typeof t.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.d)) return 'That backup contains a transaction with an invalid date.';
    }
  }
  if (data.cats !== undefined) {
    if (!Array.isArray(data.cats)) return 'That backup\'s category list is corrupted.';
    for (const c of data.cats) {
      if (!c || typeof c.n !== 'string') return 'That backup contains an invalid category entry.';
    }
  }
  if (data.income !== undefined && typeof data.income !== 'number') return 'That backup\'s income value is corrupted.';
  if (data.cycleDay !== undefined && typeof data.cycleDay !== 'number') return 'That backup\'s pay-day value is corrupted.';
  return null; // valid
}
