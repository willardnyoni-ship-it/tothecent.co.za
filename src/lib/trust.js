// "Last backup" / "last statement import" timestamps, shown so users can
// see at a glance that their data is actually protected - trust as a
// visible feature, not just an internal guarantee. Kept outside the synced
// budget state (same reasoning as lock.js/syncCfg) so writing them never
// triggers a sync or a persistence-effect loop.
const KEY = 'wnTrust_v1';

export function loadTrust() {
  try { return { lastBackupAt: 0, lastImportAt: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch (e) { return { lastBackupAt: 0, lastImportAt: 0 }; }
}

export function saveTrust(t) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) { /* ignore */ }
}
