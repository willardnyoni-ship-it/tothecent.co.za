import { useEffect, useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { businessApi } from '../lib/businessApi.js';
import { R2 } from '../lib/format.js';
import { matchItem } from '../lib/stockInvoice.js';
import { useYoco } from '../lib/yoco.js';
import { useSaleOptions } from './saleOptions.jsx';

// "Match your Yoco items": Yoco tells us what was sold; this is where each
// name on your Yoco menu is pointed at the stock item (or dish) it uses up.
// Do it once per item - after that, every sale takes stock off by itself.
export function YocoItemsContent() {
  const { close } = useSheet();
  const { syncCfg, ensureToken } = useBudget();
  const { business } = useBusiness();
  const yoco = useYoco();
  const opts = useSaleOptions();
  const [groups, setGroups] = useState(null);
  const [choice, setChoice] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  // What could a Yoco name be? Dishes first, so a dish wins a tie with an ingredient.
  const targets = useMemo(() => [
    ...opts.dishes.map(r => ({ name: r.name, ref: 'r:' + r.id })),
    ...opts.items.map(i => ({ name: i.name, ref: 's:' + i.id })),
  ], [opts.dishes, opts.items]);

  async function load() {
    try {
      const token = await ensureToken();
      const biz = `business_id=eq.${business.id}`;
      const [lines, maps] = await Promise.all([
        businessApi.select(syncCfg, token, 'yoco_order_lines', `${biz}&applied_at=is.null&select=name,name_key,qty,unit_price,historic,order_id&order=sold_at.desc&limit=3000`),
        businessApi.select(syncCfg, token, 'yoco_item_map', `${biz}&select=name_key`),
      ]);
      const mapped = new Set((maps || []).map(m => m.name_key));
      const by = new Map();
      (lines || []).filter(l => !mapped.has(l.name_key)).forEach(l => {
        const g = by.get(l.name_key) || { key: l.name_key, name: l.name, qty: 0, orders: new Set(), price: +l.unit_price, historic: true };
        g.qty += +l.qty; g.orders.add(l.order_id); if (!l.historic) g.historic = false;
        by.set(l.name_key, g);
      });
      const list = [...by.values()].sort((a, b) => b.qty - a.qty);
      setGroups(list);
      setChoice(c => {
        const next = { ...c };
        list.forEach(g => { if (next[g.key] === undefined) { const m = matchItem(g.name, targets); next[g.key] = m ? m.item.ref : ''; } });
        return next;
      });
    } catch (e) { setErr(e.message || 'Could not load.'); setGroups([]); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = (groups || []).filter(g => choice[g.key]);

  async function save() {
    setBusy(true); setErr('');
    let applied = 0, matched = 0;
    try {
      for (const g of picked) {
        const v = choice[g.key];
        const body = { action: 'map_item', name_key: g.key, display_name: g.name };
        if (v === 'ignore') body.ignore = true;
        else if (v.startsWith('r:')) body.recipe_id = v.slice(2);
        else body.stock_item_id = v.slice(2);
        const d = await yoco.call(body);
        applied += d.applied || 0; matched++;
      }
      setDone({ matched, applied });
      await load();
    } catch (e) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }

  if (groups === null) return <><div className="row"><h1>Match your Yoco items</h1><button className="b g sm" onClick={close}>Close</button></div><div className="mini">Loading…</div></>;

  return (
    <>
      <div className="row"><h1>Match your Yoco items</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="mini" style={{ marginBottom: 10 }}>
        These are items you've sold on Yoco. Point each one at the stock item - or dish - it uses up, once, and every future sale takes the stock off by itself.
      </div>
      {done && <div className="msg s">Matched {done.matched} item{done.matched === 1 ? '' : 's'}{done.applied ? `, and took ${done.applied} sale${done.applied === 1 ? '' : 's'} off your stock` : ''}.</div>}
      {groups.length === 0 && <div className="card"><div className="mini">{done ? 'All matched - nothing left to do.' : "Nothing to match right now. New items you sell on Yoco will appear here the first time they're sold."}</div></div>}
      {groups.map(g => (
        <div className="sc-line" key={g.key}>
          <div style={{ fontWeight: 700 }}>{g.name}</div>
          <div className="mini" style={{ margin: '2px 0 8px' }}>
            Sold {g.qty} ({g.orders.size} order{g.orders.size === 1 ? '' : 's'}){g.price > 0 ? ` · ${R2(g.price)} each` : ''}
            {g.historic ? ' · from before you connected, so this won\'t change your stock' : ''}
          </div>
          <label className="sc-match">Uses up
            <select value={choice[g.key] || ''} onChange={e => setChoice({ ...choice, [g.key]: e.target.value })}>
              <option value="">Not matched yet</option>
              {opts.dishes.length > 0 && <optgroup label="Dishes & services">{opts.dishes.map(r => <option key={r.id} value={'r:' + r.id}>{r.name}</option>)}</optgroup>}
              <optgroup label="Stock items">{opts.items.map(i => <option key={i.id} value={'s:' + i.id}>{i.name} (have {+i.qty_on_hand})</option>)}</optgroup>
              <option value="ignore">Don't track stock for this</option>
            </select>
          </label>
          {choice[g.key] && choice[g.key] !== 'ignore' && matchItem(g.name, targets)?.item.ref === choice[g.key] && <div className="mini" style={{ marginTop: 4 }}>Suggested from the name - check it's right.</div>}
        </div>
      ))}
      {err && <div className="msg e">{err}</div>}
      {groups.length > 0 && (
        <>
          <div style={{ height: 10 }} />
          <button className="b" disabled={busy || !picked.length} onClick={save}>{busy ? 'Saving…' : `Save ${picked.length} match${picked.length === 1 ? '' : 'es'}`}</button>
        </>
      )}
      <div style={{ height: 16 }} />
    </>
  );
}

export function useYocoItemsSheet() {
  const { open } = useSheet();
  return () => open(() => <YocoItemsContent />);
}
