// IndexedDB photo store + 45-day expiry + best-effort Supabase Storage
// backup for signed-in users. Ported unchanged from app.html.
let _dbp;
function db() {
  return _dbp || (_dbp = new Promise((res, rej) => {
    const r = indexedDB.open('wnBudgetPhotos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('p');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
export async function photoPut(id, blob) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('p', 'readwrite');
    t.objectStore('p').put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
export async function photoGet(id) {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const t = d.transaction('p', 'readonly');
      const q = t.objectStore('p').get(id); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  } catch (e) { return null; }
}
export async function photoDel(id) {
  try {
    const d = await db();
    await new Promise(res => {
      const t = d.transaction('p', 'readwrite');
      t.objectStore('p').delete(id); t.oncomplete = res; t.onerror = res;
    });
  } catch (e) { /* ignore */ }
}

const _urls = new Map();
export async function photoUrl(id, syncCfg, ensureToken) {
  if (_urls.has(id)) return _urls.get(id);
  let b = await photoGet(id);
  if (!b) {
    b = await photoDownload(id, syncCfg, ensureToken);
    if (b) try { await photoPut(id, b); } catch (e) { /* ignore */ }
  }
  if (!b) return null;
  const u = URL.createObjectURL(b); _urls.set(id, u); return u;
}

function receiptPath(syncCfg, pid) { return syncCfg.userId + '/' + pid + '.jpg'; }

export async function photoUpload(id, blob, syncCfg, ensureToken) {
  if (!syncCfg.token || !syncCfg.userId) return false;
  try {
    const token = await ensureToken();
    const url = syncCfg.url.replace(/\/+$/, '') + '/storage/v1/object/receipts/' + receiptPath(syncCfg, id);
    const r = await fetch(url, {
      method: 'POST',
      headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: blob,
    });
    return r.ok;
  } catch (e) { return false; }
}
export async function photoDownload(id, syncCfg, ensureToken) {
  if (!syncCfg.token || !syncCfg.userId) return null;
  try {
    const token = await ensureToken();
    const url = syncCfg.url.replace(/\/+$/, '') + '/storage/v1/object/receipts/' + receiptPath(syncCfg, id);
    const r = await fetch(url, { cache: 'no-store', headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    return await r.blob();
  } catch (e) { return null; }
}
export async function photoRemoteDelete(id, syncCfg, ensureToken) {
  if (!syncCfg.token || !syncCfg.userId) return;
  try {
    const token = await ensureToken();
    const url = syncCfg.url.replace(/\/+$/, '') + '/storage/v1/object/receipts/' + receiptPath(syncCfg, id);
    await fetch(url, { method: 'DELETE', headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token } });
  } catch (e) { /* ignore */ }
}

function statementPath(syncCfg, id, ext) { return syncCfg.userId + '/' + id + '.' + ext; }

export async function uploadStatement(file, meta, syncCfg, ensureToken, uid) {
  if (!syncCfg.token || !syncCfg.userId || !file) return;
  try {
    const token = await ensureToken();
    const id = uid();
    const ext = meta.kind === 'pdf' ? 'pdf' : 'csv';
    const mime = meta.kind === 'pdf' ? 'application/pdf' : 'text/csv';
    const putUrl = syncCfg.url.replace(/\/+$/, '') + '/storage/v1/object/statements/' + statementPath(syncCfg, id, ext);
    const putRes = await fetch(putUrl, {
      method: 'POST',
      headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': mime, 'x-upsert': 'true' },
      body: file,
    });
    if (!putRes.ok) return;
    const row = {
      storage_path: statementPath(syncCfg, id, ext), filename: (file.name || '').slice(0, 200),
      bank: (meta.bank || '').slice(0, 60), kind: meta.kind, tx_count: meta.txCount || 0,
      period_start: meta.periodStart || null, period_end: meta.periodEnd || null,
    };
    await fetch(syncCfg.url.replace(/\/+$/, '') + '/rest/v1/statements', {
      method: 'POST',
      headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (e) { /* ignore */ }
}

// Expiry is measured from when the photo was TAKEN, not the transaction date.
export const PHOTO_TTL_DAYS = 45;
const DAY_MS = 86400000;
export function photoTakenAt(t) {
  if (t.photoAt) return t.photoAt;
  const d = new Date((t.d || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
  return isNaN(d) ? Date.now() : d.getTime();
}
export function photoDaysLeft(t) {
  return Math.ceil((photoTakenAt(t) + PHOTO_TTL_DAYS * DAY_MS - Date.now()) / DAY_MS);
}
export function photoExpired(t) { return photoDaysLeft(t) <= 0; }
