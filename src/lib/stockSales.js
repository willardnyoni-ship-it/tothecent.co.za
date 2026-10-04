// Invoices that sell stock: make stock match what an invoice sold. Safe to
// call any number of times: it compares what the invoice should have taken
// with what it already took and only moves the difference, so sending a draft
// takes stock off, cancelling puts it back, and nothing is counted twice.
// (Card sales take stock off too, on the server, from Yoco's order lines.)
import { businessApi } from './businessApi.js';
import { usageFor, r4 } from './recipeMath.js';
import { iso } from './format.js';

async function loadCatalogue(syncCfg, token, businessId) {
  const biz = `business_id=eq.${businessId}`;
  const [items, recipes, recipeLines] = await Promise.all([
    businessApi.select(syncCfg, token, 'stock_items', `${biz}&select=*`),
    businessApi.select(syncCfg, token, 'recipes', `${biz}&select=*`).catch(() => []),
    businessApi.select(syncCfg, token, 'recipe_lines', `${biz}&select=*`).catch(() => []),
  ]);
  return { items: items || [], recipes: recipes || [], recipeLines: recipeLines || [] };
}

// Writes the movements and updates the shelf quantities. `deltas` is
// { itemId: { qty (+ sold / - returned), revenue } }.
async function apply(syncCfg, token, businessId, items, deltas, extra) {
  const rows = [], updates = [], touched = [];
  for (const [id, d] of Object.entries(deltas)) {
    const qty = r4(d.qty);
    if (!qty) continue;
    const it = items.find(i => i.id === id);
    if (!it) continue;
    rows.push({
      business_id: businessId, item_id: id, date: extra.date, qty_change: -qty, reason: qty > 0 ? 'sale' : 'adjust',
      unit_price: qty > 0 ? Math.round((d.revenue / qty) * 100) / 100 : +it.cost_price, unit_cost: +it.cost_price,
      note: qty > 0 ? extra.note : extra.returnNote, invoice_id: extra.invoice_id || null,
    });
    const after = r4(+it.qty_on_hand - qty);
    updates.push(businessApi.update(syncCfg, token, 'stock_items', `id=eq.${id}`, { qty_on_hand: after }));
    touched.push({ name: it.name, unit: it.unit, after, low: +it.reorder_level > 0 && after <= +it.reorder_level, negative: after < 0 });
  }
  if (!rows.length) return { changed: 0, touched: [] };
  await businessApi.insert(syncCfg, token, 'stock_movements', rows);
  await Promise.all(updates);
  return { changed: rows.length, touched };
}

export async function syncInvoiceStock(syncCfg, token, businessId, invoiceId) {
  const [inv] = await businessApi.select(syncCfg, token, 'invoices', `id=eq.${invoiceId}&select=id,status,invoice_number`);
  if (!inv) return { changed: 0, touched: [] };
  const lines = await businessApi.select(syncCfg, token, 'invoice_items', `invoice_id=eq.${invoiceId}&select=*`);
  const linked = (lines || []).filter(l => l.stock_item_id || l.recipe_id);
  const moves = await businessApi.select(syncCfg, token, 'stock_movements', `invoice_id=eq.${invoiceId}&select=*`);
  if (!linked.length && !(moves || []).length) return { changed: 0, touched: [] };

  const { items, recipes, recipeLines } = await loadCatalogue(syncCfg, token, businessId);
  const sold = !['draft', 'cancelled'].includes(inv.status);
  const want = sold ? usageFor(linked.map(l => ({ stock_item_id: l.stock_item_id, recipe_id: l.recipe_id, qty: l.qty, price: l.price })), recipes, recipeLines, items) : {};
  const have = {};
  (moves || []).forEach(m => { const e = have[m.item_id] || (have[m.item_id] = { qty: 0, revenue: 0 }); e.qty = r4(e.qty - +m.qty_change); e.revenue += -(+m.qty_change) * (+m.unit_price || 0); });

  const deltas = {};
  for (const id of new Set([...Object.keys(want), ...Object.keys(have)])) {
    const w = want[id] || { qty: 0, revenue: 0 }, h = have[id] || { qty: 0, revenue: 0 };
    deltas[id] = { qty: r4(w.qty - h.qty), revenue: w.revenue - h.revenue };
  }
  return apply(syncCfg, token, businessId, items, deltas, {
    date: iso(new Date()), invoice_id: invoiceId, note: 'Invoice ' + inv.invoice_number, returnNote: 'Invoice ' + inv.invoice_number + (inv.status === 'cancelled' ? ' cancelled' : ' changed'),
  });
}
