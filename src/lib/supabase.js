// Supabase Auth + sync. Ported unchanged from app.html. Signing in syncs
// data to the hosted project in the open - RLS scopes each user to their
// own row; the operator's project could technically query it.
export const SYNC_KEY = 'wnSync_v1';
export const HOSTED_SUPA_URL = 'https://pkbpmnpevxjrqjnepsjd.supabase.co';
export const HOSTED_SUPA_KEY = 'sb_publishable_foyO2Py6QAR3oG8IK4OyzQ_WOFBcuiN';

export function loadSync() {
  let cfg;
  try { cfg = JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { cfg = {}; }
  if (!cfg.url) cfg.url = HOSTED_SUPA_URL;
  if (!cfg.key) cfg.key = HOSTED_SUPA_KEY;
  return cfg;
}
export function saveSync(cfg) {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
}

async function authFetch(syncCfg, path, opts) {
  const url = syncCfg.url.replace(/\/+$/, '') + path;
  const r = await fetch(url, { ...opts, headers: { apikey: syncCfg.key, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.msg || body.error_description || body.message || 'Request failed (' + r.status + ')');
  return body;
}

export function sessionFromAuthResponse(d) {
  return {
    token: d.access_token,
    refresh: d.refresh_token,
    userId: d.user && d.user.id,
    email: d.user && d.user.email,
    expires: Date.now() + ((d.expires_in || 3600) * 1000) - 60000,
    auto: true,
  };
}

export async function signUp(syncCfg, email, password) {
  return authFetch(syncCfg, '/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export async function signIn(syncCfg, email, password) {
  return authFetch(syncCfg, '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export async function refreshSession(syncCfg) {
  return authFetch(syncCfg, '/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: syncCfg.refresh }) });
}
export async function apiSignOut(syncCfg) {
  if (!syncCfg.token) return;
  try { await authFetch(syncCfg, '/auth/v1/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + syncCfg.token } }); } catch (e) { /* ignore */ }
}
export async function joinHousehold(syncCfg, id, token) {
  await fetch(syncCfg.url.replace(/\/+$/, '') + '/rest/v1/household_members', {
    method: 'POST',
    headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{ household: id }]),
  }).catch(() => {});
}

// Transactions merge by id with the newest edit winning; deletions carry
// tombstones. Settings are last-write-wins on their own timestamp.
export function mergeState(local, remote) {
  if (!remote) return local;
  const out = { ...local };
  const tomb = new Set([...(local.deleted || []), ...(remote.deleted || [])]);
  const byId = new Map();
  for (const t of (remote.tx || [])) byId.set(String(t.id), t);
  for (const t of (local.tx || [])) {
    const k = String(t.id), other = byId.get(k);
    if (!other) { byId.set(k, t); continue; }
    byId.set(k, (t.mod || 0) >= (other.mod || 0) ? t : other);
  }
  out.tx = [...byId.values()].filter(t => !tomb.has(String(t.id)));
  out.deleted = [...tomb].slice(-2000);

  const fseen = new Set();
  out.flows = [...(local.flows || []), ...(remote.flows || [])].filter(f => {
    const k = f.d + '|' + f.a + '|' + f.note + '|' + f.dir;
    if (fseen.has(k)) return false; fseen.add(k); return true;
  });

  const remoteNewer = (remote.syncedAt || 0) > (local.syncedAt || 0);
  for (const k of ['income', 'cycleDay', 'weekly', 'method', 'savingsGoal', 'cats', 'rules', 'shortcuts', 'windfall', 'members', 'memory']) {
    if (remoteNewer && remote[k] !== undefined) out[k] = remote[k];
  }
  out.splits = { ...(remote.splits || {}), ...(local.splits || {}) };
  out.achievements = [...new Set([...(local.achievements || []), ...(remote.achievements || [])])];
  out.syncedAt = Math.max(local.syncedAt || 0, remote.syncedAt || 0);
  return out;
}

// Photos are deliberately excluded here - they are large and stay on the device.
export function syncPayload(S) {
  const { flows, tx, cats, rules, shortcuts, members, splits, memory,
    achievements, windfall, income, cycleDay, weekly, method, savingsGoal,
    deleted, syncedAt } = S;
  return { flows, tx, cats, rules, shortcuts, members, splits, memory, achievements,
    windfall, income, cycleDay, weekly, method, savingsGoal, deleted, syncedAt };
}

export async function pullAndMergeAndPush(syncCfg, token, S) {
  const id = 'u_' + syncCfg.userId;
  await joinHousehold(syncCfg, id, token);
  const base = syncCfg.url.replace(/\/+$/, '') + '/rest/v1/budget_sync';
  const h = { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  let remote = null;
  const got = await fetch(base + '?household=eq.' + id + '&select=payload,updated_at', { headers: h });
  if (!got.ok) throw new Error('Pull failed (' + got.status + '). Check the URL and key.');
  const rows = await got.json();
  if (rows.length) { try { remote = JSON.parse(rows[0].payload); } catch (e) { remote = null; } }

  const merged = mergeState(syncPayload(S), remote);

  const body = [{ household: id, payload: JSON.stringify(merged), updated_at: new Date().toISOString(), device: syncCfg.device || 'device' }];
  const put = await fetch(base, {
    method: 'POST', headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body),
  });
  if (!put.ok) throw new Error('Push failed (' + put.status + ').');

  return merged;
}
