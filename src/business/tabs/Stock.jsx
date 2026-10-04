import { useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { useSheet } from '../../components/Sheet.jsx';
import { R, R2, iso } from '../../lib/format.js';

const ACTIONS = {
  purchase: { label: 'Stock in', verb: 'Received', sign: 1, priceLabel: 'Cost per unit (R)' },
  sale: { label: 'Sold', verb: 'Sold', sign: -1, priceLabel: 'Selling price per unit (R)' },
  waste: { label: 'Waste', verb: 'Wasted / damaged', sign: -1, priceLabel: null },
  adjust: { label: 'Count', verb: 'Counted', sign: 0, priceLabel: null },
};

export const isLow = it => +it.reorder_level > 0 && +it.qty_on_hand <= +it.reorder_level;

// A cell that starts with = + - or @ would be run as a formula when the file
// is opened in Excel; a leading apostrophe makes it plain text.
const csvCell = v => {
  let t = String(v ?? '');
  if (/^[=+\-@]/.test(t) && isNaN(Number(t))) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
};
function downloadStockCsv(items, name) {
  const rows = [['Item', 'SKU', 'Unit', 'On hand', 'Reorder level', 'Needs reorder', 'Cost price (R)', 'Selling price (R)', 'Stock value at cost (R)', 'Margin %']]
    .concat(items.map(i => {
      const cost = +i.cost_price || 0, sell = +i.sell_price || 0;
      return [i.name, i.sku || '', i.unit, +i.qty_on_hand, +i.reorder_level || 0, isLow(i) ? 'Yes' : 'No', cost.toFixed(2), sell.toFixed(2),
        (Math.max(0, +i.qty_on_hand) * cost).toFixed(2), sell > 0 ? (((sell - cost) / sell) * 100).toFixed(1) : ''];
    }));
  // The leading BOM makes Excel read accents and symbols correctly.
  const blob = new Blob(['\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

function StockItemContent({ itemId }) {
  const { close } = useSheet();
  const { stockItems, stockMovements, addRow, updateRow, addExpense, addTransaction, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const item = stockItems.find(i => i.id === itemId);
  const [action, setAction] = useState('purchase');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [record, setRecord] = useState(true);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(item || {});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!item) return null;
  const a = ACTIONS[action];
  const unitPrice = price === '' ? (action === 'sale' ? +item.sell_price : +item.cost_price) : +price;
  const moves = stockMovements.filter(m => m.item_id === item.id).slice(0, 30);
  // "8 Coca-Cola 2L", "3 kg Flour" - 'each' adds nothing to a description.
  const qtyText = q => q + ' ' + (item.unit && item.unit !== 'each' ? item.unit + ' ' : '') + item.name;

  async function apply() {
    const q = +qty;
    if (!(q >= 0) || (action !== 'adjust' && !(q > 0))) { setMsg({ e: true, t: 'Enter a quantity.' }); return; }
    setBusy(true); setMsg(null);
    try {
      // A count sets the shelf quantity to what was actually counted; the
      // movement records the difference so the history still adds up.
      const change = action === 'adjust' ? q - +item.qty_on_hand : a.sign * q;
      await addRow('stock_movements', { item_id: item.id, date: iso(new Date()), qty_change: change, reason: action, unit_price: a.priceLabel ? unitPrice : +item.cost_price, note: note || null });
      const patch = { qty_on_hand: +item.qty_on_hand + change };
      if (action === 'purchase' && price !== '') patch.cost_price = unitPrice;
      await updateRow('stock_items', item.id, patch);
      if (record && action === 'purchase' && unitPrice > 0) {
        await addExpense({ amount: +(q * unitPrice).toFixed(2), category: 'Stock purchases', description: qtyText(q), merchant: note || null, date: iso(new Date()), status: 'approved', vat: 0 });
      }
      if (record && action === 'sale' && unitPrice > 0) {
        await addTransaction({ amount: +(q * unitPrice).toFixed(2), kind: 'income', category: 'Sales', description: 'Sold ' + qtyText(q), date: iso(new Date()), status: 'reviewed', source: 'stock' });
      }
      setQty(''); setPrice(''); setNote('');
      setMsg({ t: `${a.verb} ${q} ${item.unit}.` });
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await updateRow('stock_items', item.id, {
        name: fields.name, sku: fields.sku || null, unit: fields.unit || 'each',
        reorder_level: +fields.reorder_level || 0, cost_price: +fields.cost_price || 0, sell_price: +fields.sell_price || 0,
      });
      setEditing(false);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="row"><h1>{item.name}</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">On hand</div><div className={'val' + (isLow(item) ? ' bd' : '')}>{+item.qty_on_hand} {item.unit}</div></div>
        <div className="biz-card"><div className="lbl">Value at cost</div><div className="val">{R(+item.qty_on_hand * +item.cost_price)}</div></div>
      </div>
      {isLow(item) && <div className="msg e">Running low - reorder level is {+item.reorder_level} {item.unit}.</div>}

      {!readOnly && (
        <div className="card">
          <div className="seg">
            {Object.entries(ACTIONS).map(([k, v]) => <button key={k} className={action === k ? 'on' : ''} onClick={() => { setAction(k); setPrice(''); }}>{v.label}</button>)}
          </div>
          <label style={{ marginTop: 0 }}>{action === 'adjust' ? `How many ${item.unit} are actually on the shelf?` : `Quantity (${item.unit})`}</label>
          <input type="number" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
          {a.priceLabel && (
            <>
              <label>{a.priceLabel}</label>
              <input type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder={String(action === 'sale' ? +item.sell_price : +item.cost_price)} />
              <label className="chk"><input type="checkbox" checked={record} onChange={e => setRecord(e.target.checked)} />
                <span>{action === 'purchase' ? 'Also add this to Expenses' : 'Also add this sale to Money'}</span></label>
              {action === 'sale' && <div className="mini">Untick if this sale is already in a cash-up or bank statement, so it isn't counted twice.</div>}
            </>
          )}
          <label>Note <span className="mini">(optional)</span></label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={action === 'purchase' ? 'Supplier' : action === 'waste' ? 'e.g. expired, broken' : ''} />
          {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
          <div style={{ height: 8 }} />
          <button className="b" disabled={busy} onClick={apply}>Save</button>
        </div>
      )}

      <div className="card">
        <div className="row"><h2 style={{ marginTop: 0 }}>Details</h2>{!readOnly && !editing && <button className="b g sm" onClick={() => { setFields(item); setEditing(true); }}>Edit</button>}</div>
        {editing ? (
          <>
            <label>Name</label><input value={fields.name || ''} onChange={e => setFields({ ...fields, name: e.target.value })} />
            <label>Code / SKU</label><input value={fields.sku || ''} onChange={e => setFields({ ...fields, sku: e.target.value })} />
            <label>Unit</label><input value={fields.unit || ''} onChange={e => setFields({ ...fields, unit: e.target.value })} />
            <label>Reorder when at or below</label><input type="number" value={fields.reorder_level ?? ''} onChange={e => setFields({ ...fields, reorder_level: e.target.value })} />
            <label>Cost price (R)</label><input type="number" value={fields.cost_price ?? ''} onChange={e => setFields({ ...fields, cost_price: e.target.value })} />
            <label>Selling price (R)</label><input type="number" value={fields.sell_price ?? ''} onChange={e => setFields({ ...fields, sell_price: e.target.value })} />
            <div style={{ height: 10 }} />
            <button className="b" disabled={busy} onClick={saveEdit}>Save</button>
            <div style={{ height: 8 }} />
            <button className="b g" onClick={() => setEditing(false)}>Cancel</button>
            <div style={{ height: 8 }} />
            <button className="b d" disabled={busy} onClick={async () => { await updateRow('stock_items', item.id, { archived: true }); close(); }}>Remove from stock list</button>
          </>
        ) : (
          <>
            {item.sku && <div className="row"><span className="mini">Code</span><span>{item.sku}</span></div>}
            <div className="row"><span className="mini">Cost / Selling price</span><span>{R2(+item.cost_price)} / {R2(+item.sell_price)}</span></div>
            <div className="row"><span className="mini">Markup</span><span>{+item.cost_price > 0 ? Math.round((+item.sell_price - +item.cost_price) / +item.cost_price * 100) + '%' : '-'}</span></div>
            <div className="row"><span className="mini">Reorder level</span><span>{+item.reorder_level || '-'}</span></div>
          </>
        )}
      </div>

      <h2>History</h2>
      <div className="card">
        <table><tbody>
          {moves.length ? moves.map(m => (
            <tr key={m.id}>
              <td>{ACTIONS[m.reason]?.verb || m.reason}<div className="tag">{m.date}{m.note ? ' · ' + m.note : ''}</div></td>
              <td className={'r mono' + (+m.qty_change < 0 ? ' bd' : '')}>{+m.qty_change > 0 ? '+' : ''}{+m.qty_change}</td>
            </tr>
          )) : <tr><td className="mini">No movements yet.</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </>
  );
}

export function useStockItem() {
  const { open } = useSheet();
  return (itemId) => open(() => <StockItemContent itemId={itemId} />);
}

export default function Stock() {
  const { stockItems, stockMovements, addRow, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const openItem = useStockItem();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ name: '', unit: 'each', qty_on_hand: '', reorder_level: '', cost_price: '', sell_price: '' });
  const [err, setErr] = useState('');
  const items = stockItems.filter(i => !i.archived);
  const low = items.filter(isLow);
  const value = items.reduce((a, i) => a + Math.max(0, +i.qty_on_hand) * +i.cost_price, 0);
  const monthKey = iso(new Date()).slice(0, 7);
  const wasteMonth = stockMovements.filter(m => m.reason === 'waste' && m.date.slice(0, 7) === monthKey)
    .reduce((a, m) => a + Math.abs(+m.qty_change) * +m.unit_price, 0);
  const shown = items.filter(i => !search || (i.name + ' ' + (i.sku || '')).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name));

  async function save() {
    if (!f.name.trim()) { setErr('Give the item a name.'); return; }
    try {
      const qty = +f.qty_on_hand || 0;
      const it = await addRow('stock_items', { name: f.name.trim(), unit: f.unit || 'each', qty_on_hand: qty, reorder_level: +f.reorder_level || 0, cost_price: +f.cost_price || 0, sell_price: +f.sell_price || 0 });
      if (qty) await addRow('stock_movements', { item_id: it.id, qty_change: qty, reason: 'adjust', unit_price: +f.cost_price || 0, note: 'Opening stock' });
      setF({ name: '', unit: 'each', qty_on_hand: '', reorder_level: '', cost_price: '', sell_price: '' }); setErr(''); setAdding(false);
    } catch (e) { setErr(e.message); }
  }

  return (
    <section className="tab on light-tab">
      <h1>Stock</h1>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Stock value</div><div className="val">{R(value)}</div></div>
        <div className="biz-card"><div className="lbl">Running low</div><div className={'val' + (low.length ? ' bd' : '')}>{low.length}</div></div>
        <div className="biz-card"><div className="lbl">Items</div><div className="val">{items.length}</div></div>
        <div className="biz-card"><div className="lbl">Waste this month</div><div className="val">{R(wasteMonth)}</div></div>
      </div>

      {low.length > 0 && (
        <div className="infobox" style={{ marginBottom: 12 }}>
          <b>Reorder list:</b> {low.map(i => `${i.name} (${+i.qty_on_hand} left)`).join(', ')}
        </div>
      )}

      {!readOnly && (adding ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>New item</h2>
          <label>Name</label>
          <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Coca-Cola 2L, Flour 10kg, Hair dye #5" />
          <div className="biz-grid" style={{ marginTop: 10 }}>
            <div><label style={{ marginTop: 0 }}>Unit</label><input value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} placeholder="each, kg, box" /></div>
            <div><label style={{ marginTop: 0 }}>How many now</label><input type="number" value={f.qty_on_hand} onChange={e => setF({ ...f, qty_on_hand: e.target.value })} /></div>
            <div><label style={{ marginTop: 0 }}>Cost price (R)</label><input type="number" value={f.cost_price} onChange={e => setF({ ...f, cost_price: e.target.value })} /></div>
            <div><label style={{ marginTop: 0 }}>Selling price (R)</label><input type="number" value={f.sell_price} onChange={e => setF({ ...f, sell_price: e.target.value })} /></div>
          </div>
          <label>Warn me when it drops to</label>
          <input type="number" value={f.reorder_level} onChange={e => setF({ ...f, reorder_level: e.target.value })} placeholder="e.g. 5" />
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 10 }} />
          <button className="b" onClick={save}>Add Item</button>
          <div style={{ height: 8 }} />
          <button className="b g" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="b" style={{ flex: 1 }} onClick={() => setAdding(true)}>+ Add Item</button>
          <button className="b g" style={{ width: 'auto', padding: '0 18px' }} disabled={!items.length}
            onClick={() => downloadStockCsv([...items].sort((a, b) => a.name.localeCompare(b.name)), 'stock-' + iso(new Date()) + '.csv')}>Export CSV</button>
        </div>
      ))}
      {readOnly && (
        <button className="b g" disabled={!items.length} onClick={() => downloadStockCsv([...items].sort((a, b) => a.name.localeCompare(b.name)), 'stock-' + iso(new Date()) + '.csv')}>Export CSV</button>
      )}

      {items.length > 6 && <input style={{ marginTop: 14 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stock" />}
      <div className="card" style={{ marginTop: 14 }}>
        <table><tbody>
          {shown.length ? shown.map(i => (
            <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => openItem(i.id)}>
              <td>
                <div style={{ fontWeight: 600 }}>{i.name}</div>
                <div className="tag">{R2(+i.sell_price)} each{isLow(i) ? ' · reorder' : ''}</div>
              </td>
              <td className={'r' + (isLow(i) ? ' bd' : '')}>{+i.qty_on_hand} {i.unit}</td>
            </tr>
          )) : <tr><td className="mini" colSpan={2}>{items.length ? 'Nothing matches.' : 'No stock items yet.'}</td></tr>}
        </tbody></table>
      </div>
      <div style={{ height: 20 }} />
    </section>
  );
}
