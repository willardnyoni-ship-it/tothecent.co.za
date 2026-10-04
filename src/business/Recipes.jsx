import { useMemo, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { businessApi } from '../lib/businessApi.js';
import { R, R2 } from '../lib/format.js';
import { foodCostTone, recipeCost, suggestPrice } from '../lib/recipeMath.js';

const CATEGORY_HINTS = {
  food: ['Breakfast', 'Mains', 'Sides', 'Drinks', 'Desserts', 'Catering'],
  appointments: ['Hair', 'Nails', 'Skin', 'Treatments'],
  general: ['Products'],
};
const TARGETS = [25, 30, 35];

// Words for the same idea, by kind of business.
export const costingWords = profile => (profile === 'appointments'
  ? { tab: 'Service costing', one: 'service', many: 'Services', price: 'Price per service', makes: 'Services from one batch' }
  : { tab: 'Menu & recipes', one: 'dish', many: 'Dishes', price: 'Selling price per portion', makes: 'Portions from one batch' });

function RecipeSheetContent({ recipeId }) {
  const { close } = useSheet();
  const { syncCfg, ensureToken } = useBudget();
  const { business, stockItems, recipes, recipeLines, refreshAll, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const words = costingWords(business.business_profile);
  const existing = recipes.find(r => r.id === recipeId);
  const items = useMemo(() => stockItems.filter(i => !i.archived).sort((a, b) => a.name.localeCompare(b.name)), [stockItems]);
  const seq = useRef(0);
  const [f, setF] = useState(() => existing ? { name: existing.name, category: existing.category || '', yield_portions: String(existing.yield_portions), selling_price: String(existing.selling_price || ''), extra_cost: String(+existing.extra_cost || '') }
    : { name: '', category: '', yield_portions: '1', selling_price: '', extra_cost: '' });
  const [lines, setLines] = useState(() => (existing ? recipeLines.filter(l => l.recipe_id === existing.id).map(l => ({ id: ++seq.current, item_id: l.item_id, qty: String(l.qty) })) : [{ id: ++seq.current, item_id: '', qty: '' }]));
  const [target, setTarget] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cats = [...new Set([...recipes.map(r => r.category).filter(Boolean), ...(CATEGORY_HINTS[business.business_profile] || CATEGORY_HINTS.general)])];

  const live = { yield_portions: +f.yield_portions || 1, selling_price: +f.selling_price || 0, extra_cost: +f.extra_cost || 0 };
  const priced = lines.filter(l => l.item_id && +l.qty > 0).map(l => ({ item_id: l.item_id, qty: +l.qty }));
  const c = recipeCost(live, priced, items);
  const suggested = suggestPrice(c.costPerPortion, target);
  const setLine = (id, patch) => setLines(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)));

  async function save() {
    if (!f.name.trim()) { setErr('Give it a name.'); return; }
    if (!priced.length) { setErr('Add at least one ingredient.'); return; }
    setBusy(true); setErr('');
    try {
      const token = await ensureToken();
      const row = { name: f.name.trim(), category: f.category.trim() || null, yield_portions: live.yield_portions, selling_price: live.selling_price, extra_cost: live.extra_cost };
      let id = recipeId;
      if (id) await businessApi.update(syncCfg, token, 'recipes', `id=eq.${id}`, row);
      else { const [made] = await businessApi.insert(syncCfg, token, 'recipes', [{ ...row, business_id: business.id }]); id = made.id; }
      await businessApi.remove(syncCfg, token, 'recipe_lines', `recipe_id=eq.${id}`);
      await businessApi.insert(syncCfg, token, 'recipe_lines', priced.map((l, i) => ({ business_id: business.id, recipe_id: id, item_id: l.item_id, qty: l.qty, sort_order: i })));
      await refreshAll();
      close();
    } catch (e) { setErr(e.message || 'Could not save.'); setBusy(false); }
  }
  async function archive() {
    setBusy(true);
    try { const token = await ensureToken(); await businessApi.update(syncCfg, token, 'recipes', `id=eq.${recipeId}`, { archived: true }); await refreshAll(); close(); } finally { setBusy(false); }
  }

  const tone = foodCostTone(c.foodCostPct);
  return (
    <>
      <div className="row"><h1>{existing ? existing.name : 'New ' + words.one}</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="card">
        <label style={{ marginTop: 0 }}>Name</label>
        <input value={f.name} disabled={readOnly} onChange={e => setF({ ...f, name: e.target.value })} placeholder={words.one === 'dish' ? 'e.g. Flat white, Chicken burger' : 'e.g. Box braids'} />
        <label>Category</label>
        <input list="rc-cats" value={f.category} disabled={readOnly} onChange={e => setF({ ...f, category: e.target.value })} placeholder={words.one === 'dish' ? 'e.g. Drinks' : 'e.g. Hair'} />
        <datalist id="rc-cats">{cats.map(x => <option key={x} value={x} />)}</datalist>
        <div className="biz-grid" style={{ marginTop: 10 }}>
          <div><label style={{ marginTop: 0 }}>{words.makes}</label><input type="number" inputMode="decimal" value={f.yield_portions} disabled={readOnly} onChange={e => setF({ ...f, yield_portions: e.target.value })} /></div>
          <div><label style={{ marginTop: 0 }}>{words.price} (R)</label><input type="number" inputMode="decimal" value={f.selling_price} disabled={readOnly} onChange={e => setF({ ...f, selling_price: e.target.value })} /></div>
        </div>
      </div>

      <h2>Ingredients</h2>
      <div className="mini" style={{ marginBottom: 6 }}>For the whole batch. Use each item's own unit - for a 1kg bag of beans, 18g is 0.018.</div>
      {lines.map(l => {
        const it = items.find(i => i.id === l.item_id);
        return (
          <div className="sc-line" key={l.id}>
            <div className="sc-top">
              <select value={l.item_id} disabled={readOnly} onChange={e => setLine(l.id, { item_id: e.target.value })}>
                <option value="">Choose a stock item…</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name} ({R2(+i.cost_price)} per {i.unit})</option>)}
              </select>
              {!readOnly && <button className="sc-x" aria-label="Remove" onClick={() => setLines(ls => ls.filter(x => x.id !== l.id))}>&times;</button>}
            </div>
            <div className="sc-nums two">
              <label>Quantity{it ? ` (${it.unit})` : ''}<input type="number" inputMode="decimal" value={l.qty} disabled={readOnly} onChange={e => setLine(l.id, { qty: e.target.value })} /></label>
              <div className="sc-sum" style={{ alignSelf: 'end', textAlign: 'right' }}>{it && +l.qty > 0 ? 'Costs ' + R2(+l.qty * +it.cost_price) : ''}</div>
            </div>
          </div>
        );
      })}
      {!readOnly && <button className="b g" onClick={() => setLines(ls => [...ls, { id: ++seq.current, item_id: '', qty: '' }])}>+ Add ingredient</button>}
      {!items.length && <div className="msg e">Add some stock items first - ingredients come from your stock list.</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <label style={{ marginTop: 0 }}>Other cost per {words.one === 'dish' ? 'portion' : 'service'} (R) <span className="mini">packaging, gas, labour - optional</span></label>
        <input type="number" inputMode="decimal" value={f.extra_cost} disabled={readOnly} onChange={e => setF({ ...f, extra_cost: e.target.value })} />
      </div>

      <div className="card rc-sum">
        <div className="row"><span className="mini">Ingredients for the batch</span><span className="mono">{R2(c.batch)}</span></div>
        <div className="row"><span className="mini">Cost per {words.one === 'dish' ? 'portion' : 'service'}</span><span className="mono" style={{ fontWeight: 700 }}>{R2(c.costPerPortion)}</span></div>
        <div className="row"><span className="mini">Profit per {words.one === 'dish' ? 'portion' : 'service'}</span><span className={'mono' + (c.margin < 0 ? ' bd' : '')} style={{ fontWeight: 700 }}>{R2(c.margin)}{c.marginPct != null ? ` (${c.marginPct}%)` : ''}</span></div>
        {c.foodCostPct != null && <div className="row"><span className="mini">{words.one === 'dish' ? 'Food cost' : 'Cost'} (of price)</span><span className={'rc-pill ' + tone}>{c.foodCostPct}%</span></div>}
        {(c.unpriced > 0) && <div className="msg e">{c.unpriced} ingredient{c.unpriced === 1 ? ' has' : 's have'} no cost price yet, so the cost is understated. Capture an invoice or set the item's cost.</div>}
        {c.costPerPortion > 0 && (
          <>
            <div className="rc-target">
              <span className="mini">Aim for {words.one === 'dish' ? 'food cost' : 'cost'} of</span>
              {TARGETS.map(t => <button key={t} className={target === t ? 'on' : ''} onClick={() => setTarget(t)}>{t}%</button>)}
              <span className="mini">→ price it at <b>{R2(suggested)}</b></span>
              {!readOnly && suggested !== +f.selling_price && <button className="b g sm" onClick={() => setF({ ...f, selling_price: String(suggested) })}>Use {R2(suggested)}</button>}
            </div>
          </>
        )}
      </div>

      {err && <div className="msg e">{err}</div>}
      {!readOnly && (
        <>
          <div style={{ height: 10 }} />
          <button className="b" disabled={busy} onClick={save}>{existing ? 'Save changes' : 'Save'}</button>
          {existing && <><div style={{ height: 8 }} /><button className="b d" disabled={busy} onClick={archive}>Remove this {words.one}</button></>}
        </>
      )}
      <div style={{ height: 16 }} />
    </>
  );
}

export function useRecipeSheet() {
  const { open } = useSheet();
  return (recipeId) => open(() => <RecipeSheetContent recipeId={recipeId} />);
}

// The "Menu & recipes" / "Service costing" list inside Stock.
export default function Recipes() {
  const { business, recipes, recipeLines, stockItems, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const words = costingWords(business.business_profile);
  const openRecipe = useRecipeSheet();
  const items = stockItems.filter(i => !i.archived);
  const rows = useMemo(() => recipes.filter(r => !r.archived).map(r => ({ r, c: recipeCost(r, recipeLines.filter(l => l.recipe_id === r.id), items) })),
    [recipes, recipeLines, stockItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const priced = rows.filter(x => x.c.foodCostPct != null);
  const avg = priced.length ? Math.round(priced.reduce((a, x) => a + x.c.foodCostPct, 0) / priced.length * 10) / 10 : null;
  const best = [...priced].sort((a, b) => b.c.margin - a.c.margin)[0];
  const watch = priced.filter(x => x.c.foodCostPct > 40 || x.c.margin < 0);

  const groups = [...new Set(rows.map(x => x.r.category || 'Other'))].sort();
  return (
    <>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">{words.many}</div><div className="val">{rows.length}</div></div>
        <div className="biz-card"><div className="lbl">{words.one === 'dish' ? 'Avg food cost' : 'Avg cost'}</div><div className={'val rc-' + foodCostTone(avg)}>{avg != null ? avg + '%' : '-'}</div></div>
        <div className="biz-card"><div className="lbl">Best earner</div><div className="val" style={{ fontSize: 17 }}>{best ? best.r.name : '-'}</div></div>
        <div className="biz-card"><div className="lbl">Needs a look</div><div className={'val' + (watch.length ? ' bd' : '')}>{watch.length}</div></div>
      </div>
      {watch.length > 0 && <div className="infobox" style={{ marginBottom: 12 }}><b>Margins are thin on:</b> {watch.map(x => `${x.r.name} (${x.c.foodCostPct}%)`).join(', ')}. Over 40% of the price goes on ingredients.</div>}
      {!readOnly && <button className="b" onClick={() => openRecipe(null)}>+ New {words.one}</button>}
      {rows.length === 0 && <div className="card" style={{ marginTop: 12 }}><div className="mini">{words.one === 'dish'
        ? 'Add a dish and its ingredients to see what it really costs you and what you make on each sale. Selling a dish takes its ingredients off your stock.'
        : 'Add a service and the products it uses to see its real cost and profit.'}</div></div>}
      {groups.map(g => (
        <div className="card" style={{ marginTop: 12 }} key={g}>
          <div className="row"><h2 style={{ marginTop: 0 }}>{g}</h2></div>
          <table><tbody>
            {rows.filter(x => (x.r.category || 'Other') === g).map(({ r, c }) => (
              <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openRecipe(r.id)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="tag">Cost {R2(c.costPerPortion)} · profit {R2(c.margin)}{c.marginPct != null ? ` (${c.marginPct}%)` : ''}{c.yieldN > 1 ? ` · batch of ${c.yieldN}` : ''}</div>
                </td>
                <td className="r">{R(+r.selling_price)}{c.foodCostPct != null && <div><span className={'rc-pill ' + foodCostTone(c.foodCostPct)}>{c.foodCostPct}%</span></div>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      ))}
      <div style={{ height: 20 }} />
    </>
  );
}
