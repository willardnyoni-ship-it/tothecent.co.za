// App owner console data access. Every cross-user read goes through a
// database function that checks app_admins first (see the
// app_owner_console migration) - this file only calls them.
import { useEffect, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { businessApi } from '../lib/businessApi.js';

async function rest(syncCfg, token, path, opts = {}) {
  const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/rest/v1' + path, {
    ...opts,
    headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${r.status})`);
  }
  // return=minimal inserts and void functions come back with no body.
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

export const adminApi = {
  rpc: (syncCfg, token, fn, args = {}) => rest(syncCfg, token, '/rpc/' + fn, { method: 'POST', body: JSON.stringify(args) }),
  ...businessApi,
};

// "iPhone · Safari", "Windows · Edge" - enough to tell devices apart
// without storing the raw user agent.
export function deviceLabel(ua = navigator.userAgent) {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return os + ' · ' + browser;
}

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Records "this person used the app today on this device" at most once a
// day per device - what the console's active-user numbers are built from.
export async function logDailyActivity(syncCfg, ensureToken, mode) {
  if (!syncCfg.token || !syncCfg.userId) return;
  const day = today();
  const key = 'wnAct_' + syncCfg.userId + '_' + day;
  try { if (localStorage.getItem(key)) return; } catch { /* storage blocked - still log */ }
  try {
    const token = await ensureToken();
    await rest(syncCfg, token, '/app_activity?on_conflict=user_id,day,device', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([{ day, mode, device: deviceLabel() }]),
    });
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
  } catch (e) {
    // Before the console migration exists this table isn't there - never
    // let activity logging get in the way of using the app.
    console.warn('activity log skipped', e.message);
  }
}

// True only for accounts listed in app_admins. RLS lets each user see just
// their own row, so for everyone else this is an empty result, not an error.
export function useIsAppAdmin() {
  const { syncCfg, ensureToken } = useBudget();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    setIsAdmin(false);
    if (!syncCfg.token || !syncCfg.userId) return;
    (async () => {
      try {
        const token = await ensureToken();
        const rows = await businessApi.select(syncCfg, token, 'app_admins', `user_id=eq.${syncCfg.userId}&select=user_id`);
        if (alive) setIsAdmin(!!(rows && rows.length));
      } catch { /* table missing or offline - not an admin */ }
    })();
    return () => { alive = false; };
  }, [syncCfg.token, syncCfg.userId]); // eslint-disable-line react-hooks/exhaustive-deps
  return isAdmin;
}
