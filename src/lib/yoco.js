// Yoco live sales feed - the app side. The shop's API key goes to the 'yoco'
// Edge Function once, when connecting, and is never sent back here. The
// browser only ever sees whether it's connected and today's totals.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { isDemo, demoProfile } from './demo.js';
import { businessApi } from './businessApi.js';
import { usageFor } from './recipeMath.js';

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

// In the owner portal's preview there's no Yoco and no server: a shop or cafe
// behaves as if connected, with a few example sales waiting to be matched, and
// matching one really does take its stock off (in the demo's own memory).
const demoShop = () => ['retail', 'food'].includes(demoProfile());
async function demoStatus(syncCfg, businessId) {
  if (!demoShop()) return { connected: false };
  const biz = `business_id=eq.${businessId}`;
  const [lines, maps] = await Promise.all([
    businessApi.select(syncCfg, 't', 'yoco_order_lines', `${biz}&select=*`), businessApi.select(syncCfg, 't', 'yoco_item_map', `${biz}&select=name_key`)]);
  const mapped = new Set(maps.map(m => m.name_key));
  const orders = new Set(lines.map(l => l.order_id));
  const last = lines[0];
  return {
    connected: true, status: 'active', last_error: null, connected_at: new Date().toISOString(), last_event_at: new Date().toISOString(),
    today_count: orders.size, today_total: Math.round(lines.reduce((a, l) => a + (+l.revenue || 0), 0) * 100) / 100,
    last_sale_at: last ? last.sold_at : null, last_sale_amount: last ? +last.revenue : 0,
    unmatched_items: new Set(lines.filter(l => !l.applied_at && !mapped.has(l.name_key)).map(l => l.name_key)).size,
  };
}
async function demoCall(syncCfg, businessId, body) {
  if (body.action !== 'map_item') return { ok: true, imported: 0 };
  const sel = (t, q) => businessApi.select(syncCfg, 't', t, q);
  const [lines, items, recipes, recipeLines] = await Promise.all([
    sel('yoco_order_lines', `business_id=eq.${businessId}&name_key=eq.${encodeURIComponent(body.name_key)}&applied_at=is.null`),
    sel('stock_items', `business_id=eq.${businessId}&select=*`), sel('recipes', `business_id=eq.${businessId}&select=*`), sel('recipe_lines', `business_id=eq.${businessId}&select=*`)]);
  await businessApi.insert(syncCfg, 't', 'yoco_item_map', [{ business_id: businessId, name_key: body.name_key, display_name: body.display_name, stock_item_id: body.stock_item_id || null, recipe_id: body.recipe_id || null, ignored: !!body.ignore }]);
  let applied = 0;
  const qtyNow = {}; // running quantities, so two lines for one item add up
  for (const l of lines) {
    if (!body.ignore && !l.historic) {
      const usage = usageFor([{ stock_item_id: body.stock_item_id, recipe_id: body.recipe_id, qty: +l.qty, price: +l.qty ? +l.revenue / +l.qty : 0 }], recipes, recipeLines, items);
      for (const [id, u] of Object.entries(usage)) {
        const it = items.find(i => i.id === id);
        if (!it) continue;
        qtyNow[id] = Math.round(((id in qtyNow ? qtyNow[id] : +it.qty_on_hand) - u.qty) * 10000) / 10000;
        await businessApi.update(syncCfg, 't', 'stock_items', `id=eq.${id}`, { qty_on_hand: qtyNow[id] });
        await businessApi.insert(syncCfg, 't', 'stock_movements', [{ business_id: businessId, item_id: id, date: new Date().toISOString().slice(0, 10), qty_change: -u.qty, reason: 'sale', unit_price: u.qty ? Math.round(u.revenue / u.qty * 100) / 100 : 0, unit_cost: +it.cost_price, note: 'Yoco sale', reference: l.order_id }]);
      }
    }
    await businessApi.update(syncCfg, 't', 'yoco_order_lines', `line_id=eq.${l.line_id}`, { applied_at: new Date().toISOString(), stock_item_id: body.stock_item_id || null, recipe_id: body.recipe_id || null, ignored: !!body.ignore });
    applied++;
  }
  return { ok: true, applied };
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
    if (isDemo()) { const s = await demoStatus(syncCfg, bizId); setStatus(s); return s; }
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
    const d = isDemo() ? await demoCall(syncCfg, bizId, body) : await callFunction(syncCfg, token, { business_id: bizId, ...body });
    await load();
    window.dispatchEvent(new Event(CHANGED));
    if (d && (d.imported || d.applied || d.orders)) refreshAll();
    return d;
  }, [syncCfg, ensureToken, bizId, load, refreshAll]);

  return { status, connected: !!(status && status.connected), reload: load, call };
}
