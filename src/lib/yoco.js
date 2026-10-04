// Yoco live sales feed - the app side. The shop's API key goes to the 'yoco'
// Edge Function once, when connecting, and is never sent back here. The
// browser only ever sees whether it's connected and today's totals.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';

const POLL_MS = 15000;
// Screens that show Yoco data all stay in step: connecting or disconnecting in
// Settings tells every other open screen (Home, Money) to look again.
const CHANGED = 'tothecent:yoco-changed';

async function callFunction(syncCfg, token, body) {
  const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/yoco', {
    method: 'POST',
    headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}

async function fetchStatus(syncCfg, token, businessId) {
  const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/rest/v1/rpc/yoco_status', {
    method: 'POST',
    headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_business: businessId }),
  });
  if (!r.ok) throw new Error('status ' + r.status);
  const rows = await r.json();
  return rows && rows[0] ? rows[0] : null;
}

// status: null until loaded, else { connected, status, last_error, today_count,
// today_total, last_sale_at, last_sale_amount, ... }. With poll on, it checks
// every 15 seconds while the tab is visible and reloads the business's data
// when a new sale has arrived - that's what makes the feed feel live.
export function useYoco({ poll = false } = {}) {
  const { syncCfg, ensureToken } = useBudget();
  const { business, refreshAll } = useBusiness();
  const [status, setStatus] = useState(null);
  const lastSale = useRef(undefined);
  const bizId = business && business.id;

  const load = useCallback(async () => {
    if (!bizId) return null;
    try {
      const token = await ensureToken();
      const s = await fetchStatus(syncCfg, token, bizId);
      setStatus(s);
      return s;
    } catch { return null; }
  }, [syncCfg, ensureToken, bizId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, [load]);

  useEffect(() => {
    if (!poll || !status || !status.connected) return undefined;
    const tick = async () => {
      if (document.hidden) return;
      const s = await load();
      if (!s) return;
      if (lastSale.current !== undefined && s.last_sale_at !== lastSale.current) refreshAll();
      lastSale.current = s.last_sale_at;
    };
    lastSale.current = status.last_sale_at;
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll, status && status.connected, load]);

  const call = useCallback(async (body) => {
    const token = await ensureToken();
    const d = await callFunction(syncCfg, token, { business_id: bizId, ...body });
    await load();
    window.dispatchEvent(new Event(CHANGED));
    if (d && d.imported) refreshAll();
    return d;
  }, [syncCfg, ensureToken, bizId, load, refreshAll]);

  return { status, connected: !!(status && status.connected), reload: load, call };
}
