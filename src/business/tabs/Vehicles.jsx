import { useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { useSheet } from '../../components/Sheet.jsx';
import { R, R2, iso } from '../../lib/format.js';
import { COST_CATEGORIES, STATUS_LABEL, costsFor, lotSummary, vehicleFinancials, vehicleTitle } from '../../lib/vehicles.js';
import { useCreateInvoice } from '../CreateInvoiceSheet.jsx';

const csvCell = v => {
  let t = String(v ?? '');
  if (/^[=+\-@]/.test(t) && isNaN(Number(t))) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
};
function downloadCsv(rows, name) {
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}
const money = n => (n < 0 ? '-' : '') + R(Math.abs(n));
const blank = { make: '', model: '', year: '', reg: '', vin: '', colour: '', mileage_km: '', purchase_price: '', purchase_date: iso(new Date()), bought_from: '', asking_price: '', notes: '' };
const toRow = f => ({
  make: f.make.trim(), model: f.model.trim() || null, year: +f.year || null, reg: f.reg.trim().toUpperCase() || null, vin: f.vin.trim().toUpperCase() || null,
  colour: f.colour.trim() || null, mileage_km: f.mileage_km === '' ? null : Math.max(0, Math.round(+f.mileage_km)), purchase_price: +f.purchase_price || 0,
  purchase_date: f.purchase_date || null, bought_from: f.bought_from.trim() || null, asking_price: f.asking_price === '' ? null : +f.asking_price, notes: f.notes.trim() || null,
});

// The fields for adding or editing a vehicle.
function VehicleFields({ f, setF }) {
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <>
      <div className="biz-grid">
        <div><label style={{ marginTop: 0 }}>Make</label><input value={f.make} onChange={e => set('make', e.target.value)} placeholder="e.g. VW" /></div>
        <div><label style={{ marginTop: 0 }}>Model</label><input value={f.model} onChange={e => set('model', e.target.value)} placeholder="e.g. Polo 1.4" /></div>
        <div><label style={{ marginTop: 0 }}>Year</label><input type="number" inputMode="numeric" value={f.year} onChange={e => set('year', e.target.value)} placeholder="2018" /></div>
        <div><label style={{ marginTop: 0 }}>Reg number</label><input value={f.reg} onChange={e => set('reg', e.target.value)} placeholder="CA 123-456" /></div>
        <div><label style={{ marginTop: 0 }}>Colour</label><input value={f.colour} onChange={e => set('colour', e.target.value)} /></div>
        <div><label style={{ marginTop: 0 }}>Mileage (km)</label><input type="number" inputMode="numeric" value={f.mileage_km} onChange={e => set('mileage_km', e.target.value)} /></div>
      </div>
      <label>VIN <span className="mini">(optional)</span></label>
      <input value={f.vin} onChange={e => set('vin', e.target.value)} />
      <div className="biz-grid" style={{ marginTop: 10 }}>
        <div><label style={{ marginTop: 0 }}>Bought for (R)</label><input type="number" inputMode="decimal" value={f.purchase_price} onChange={e => set('purchase_price', e.target.value)} /></div>
        <div><label style={{ marginTop: 0 }}>Date bought</label><input type="date" value={f.purchase_date} onChange={e => set('purchase_date', e.target.value)} /></div>
      </div>
      <label>Bought from</label>
      <input value={f.bought_from} onChange={e => set('bought_from', e.target.value)} placeholder="Auction, trade-in, private seller" />
      <label>Asking price (R)</label>
      <input type="number" inputMode="decimal" value={f.asking_price} onChange={e => set('asking_price', e.target.value)} />
      <label>Notes</label>
      <textarea rows="2" value={f.notes} onChange={e => set('notes', e.target.value)} />
    </>
  );
}

function VehicleSheet({ vehicleId }) {
  const { close } = useSheet();
  const { vehicles, expenses, customers, addExpense, removeRow, updateRow, myRole } = useBusiness();
  const createInvoice = useCreateInvoice();
  const readOnly = myRole === 'accountant';
  const v = vehicles.find(x => x.id === vehicleId);
  const [cost, setCost] = useState({ amount: '', category: COST_CATEGORIES[0], description: '', date: iso(new Date()) });
  const [mode, setMode] = useState(''); // '' | edit | sell | delete
  const [fields, setFields] = useState(null);
  const [sale, setSale] = useState({ price: '', date: iso(new Date()), customer: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!v) return null;
  const f = vehicleFinancials(v, expenses, iso(new Date()));
  const customer = customers.find(c => c.id === v.sold_to_customer_id);

  async function run(fn, ok) {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ t: ok }); } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }
  const addCost = () => {
    if (!(+cost.amount > 0)) { setMsg({ e: true, t: 'Enter what it cost.' }); return; }
    return run(async () => {
      await addExpense({ amount: +cost.amount, category: cost.category, description: cost.description || cost.category, merchant: cost.description || cost.category, date: cost.date, status: 'approved', vehicle_id: v.id, vat: 0 });
      setCost(c => ({ ...c, amount: '', description: '' }));
    }, 'Cost added.');
  };
  const saveEdit = () => {
    if (!fields.make.trim()) { setMsg({ e: true, t: 'Enter the make.' }); return; }
    return run(async () => { await updateRow('vehicles', v.id, toRow(fields)); setMode(''); }, 'Saved.');
  };
  const markSold = () => {
    if (!(+sale.price > 0)) { setMsg({ e: true, t: 'Enter the price it sold for.' }); return; }
    return run(async () => {
      await updateRow('vehicles', v.id, { status: 'sold', sold_price: +sale.price, sold_date: sale.date, sold_to_customer_id: sale.customer || null });
      setMode('');
    }, 'Marked as sold.');
  };
  const invoiceSale = () => createInvoice({
    prefill: { customerId: v.sold_to_customer_id || '', items: [{ description: vehicleTitle(v) + (v.reg ? ' - reg ' + v.reg : '') + (v.vin ? ' - VIN ' + v.vin : ''), qty: 1, price: +v.sold_price }] },
    onCreated: async inv => { if (inv && inv.id) await updateRow('vehicles', v.id, { sale_invoice_id: inv.id }); },
  });
  const setStatus = (status, extra = {}) => run(() => updateRow('vehicles', v.id, { status, ...extra }));

  return (
    <>
      <div className="row"><h1>{vehicleTitle(v)}</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="mini">{[v.reg, v.colour, v.mileage_km != null ? Number(v.mileage_km).toLocaleString('en-ZA') + ' km' : null].filter(Boolean).join(' · ')} {v.reg || v.colour || v.mileage_km != null ? '· ' : ''}<b>{STATUS_LABEL[v.status]}</b></div>

      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Bought for</div><div className="val">{R(f.purchase)}</div></div>
        <div className="biz-card"><div className="lbl">Spent since</div><div className="val">{R(f.costs)}</div></div>
        <div className="biz-card"><div className="lbl">Total in</div><div className="val">{R(f.totalIn)}</div></div>
        {f.sold
          ? <div className="biz-card"><div className="lbl">Profit</div><div className={'val' + (f.profit < 0 ? ' bd' : '')}>{money(f.profit)}</div></div>
          : <div className="biz-card"><div className="lbl">At asking price</div><div className={'val' + (f.underwater ? ' bd' : '')}>{f.expected == null ? '-' : money(f.expected)}</div></div>}
      </div>
      {f.underwater && <div className="msg e">The asking price ({R(+v.asking_price)}) is below what this car has cost you ({R(f.totalIn)}).</div>}
      <div className="mini" style={{ margin: '6px 0 10px' }}>
        {f.sold ? `Sold for ${R(+v.sold_price)} on ${v.sold_date}${customer ? ' to ' + customer.name : ''} · ${f.daysIn} days from purchase to sale`
          : `${f.daysIn} day${f.daysIn === 1 ? '' : 's'} on the lot${v.asking_price ? ' · asking ' + R(+v.asking_price) : ''}`}
        {v.bought_from ? ` · bought from ${v.bought_from}` : ''}
      </div>

      <div className="card">
        <div className="row"><h2 style={{ margin: 0 }}>Spent on this car</h2><span className="mono">{R2(f.costs)}</span></div>
        {f.list.length === 0 && <div className="mini" style={{ marginTop: 8 }}>Nothing yet. Add parts, repairs, valet and anything else you spend before selling.</div>}
        {f.list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(e => (
          <div key={e.id} className="row veh-cost">
            <div><b>{e.description || e.category}</b><div className="mini">{e.date} · {e.category}</div></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="mono">{R2(+e.amount)}</span>
              {!readOnly && <button className="b g sm" aria-label="Remove this cost" disabled={busy} onClick={() => run(() => removeRow('expenses', e.id))}>×</button>}
            </div>
          </div>
        ))}
        {!readOnly && (
          <>
            <div className="biz-grid" style={{ marginTop: 12 }}>
              <div><label style={{ marginTop: 0 }}>Amount (R)</label><input type="number" inputMode="decimal" value={cost.amount} onChange={e => setCost({ ...cost, amount: e.target.value })} /></div>
              <div><label style={{ marginTop: 0 }}>Type</label><select value={cost.category} onChange={e => setCost({ ...cost, category: e.target.value })}>{COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            </div>
            <label>What was it for?</label>
            <input value={cost.description} onChange={e => setCost({ ...cost, description: e.target.value })} placeholder="e.g. New front brake pads - Midas" />
            <label>Date</label>
            <input type="date" value={cost.date} onChange={e => setCost({ ...cost, date: e.target.value })} />
            <div style={{ height: 10 }} />
            <button className="b" disabled={busy} onClick={addCost}>Add cost</button>
            <div className="mini" style={{ marginTop: 6 }}>It is also saved as an expense, so it shows in Expenses and your reports.</div>
          </>
        )}
      </div>
      {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}

      {!readOnly && mode === '' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {v.status !== 'sold' && <button className="b" disabled={busy} onClick={() => { setSale({ price: v.asking_price || '', date: iso(new Date()), customer: '' }); setMode('sell'); }}>Mark as sold</button>}
          {v.status === 'in_stock' && <button className="b g" disabled={busy} onClick={() => setStatus('reserved')}>Reserve it</button>}
          {v.status === 'reserved' && <button className="b g" disabled={busy} onClick={() => setStatus('in_stock')}>Back on the lot</button>}
          {v.status === 'sold' && !v.sale_invoice_id && <button className="b" onClick={invoiceSale}>Create the sale invoice</button>}
          {v.status === 'sold' && v.sale_invoice_id && <div className="mini">The sale invoice has been created. Find it under Invoices.</div>}
          {v.status === 'sold' && <button className="b g" disabled={busy} onClick={() => setStatus('in_stock', { sold_price: null, sold_date: null, sold_to_customer_id: null })}>Undo the sale</button>}
          <button className="b g" onClick={() => { setFields({ ...blank, ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x == null ? '' : x])) }); setMode('edit'); }}>Edit details</button>
          <button className="b g" onClick={() => setMode('delete')}>Delete this vehicle</button>
        </div>
      )}
      {!readOnly && mode === 'sell' && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Sold</h2>
          <div className="biz-grid">
            <div><label style={{ marginTop: 0 }}>Sold for (R)</label><input type="number" inputMode="decimal" value={sale.price} onChange={e => setSale({ ...sale, price: e.target.value })} /></div>
            <div><label style={{ marginTop: 0 }}>Date sold</label><input type="date" value={sale.date} onChange={e => setSale({ ...sale, date: e.target.value })} /></div>
          </div>
          <label>Buyer <span className="mini">(optional, pick from your customers)</span></label>
          <select value={sale.customer} onChange={e => setSale({ ...sale, customer: e.target.value })}>
            <option value="">No buyer recorded</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {+sale.price > 0 && <div className="mini" style={{ marginTop: 8 }}>Profit on this sale: <b>{money(+sale.price - f.totalIn)}</b></div>}
          <div style={{ height: 10 }} />
          <button className="b" disabled={busy} onClick={markSold}>Save sale</button>
          <div style={{ height: 8 }} />
          <button className="b g" onClick={() => setMode('')}>Cancel</button>
        </div>
      )}
      {!readOnly && mode === 'edit' && fields && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Edit details</h2>
          <VehicleFields f={fields} setF={setFields} />
          <div style={{ height: 10 }} />
          <button className="b" disabled={busy} onClick={saveEdit}>Save</button>
          <div style={{ height: 8 }} />
          <button className="b g" onClick={() => setMode('')}>Cancel</button>
        </div>
      )}
      {!readOnly && mode === 'delete' && (
        <div className="infobox" style={{ marginTop: 12 }}>
          <b>Delete this vehicle?</b> The costs you added stay in Expenses, but they will no longer be tied to this car.
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button className="b" disabled={busy} onClick={() => run(async () => { await removeRow('vehicles', v.id); close(); })}>Yes, delete</button>
            <button className="b g" onClick={() => setMode('')}>Keep it</button>
          </div>
        </div>
      )}
    </>
  );
}

function AddVehicleSheet() {
  const { close } = useSheet();
  const { addRow, business } = useBusiness();
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.make.trim()) { setErr('Enter the make, for example VW.'); return; }
    setBusy(true);
    try { await addRow('vehicles', { ...toRow(f), status: 'in_stock' }); close(); } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <>
      <div className="row"><h1>Add a vehicle</h1><button className="b g sm" onClick={close}>Cancel</button></div>
      <div className="card" style={{ marginTop: 10 }}>
        <VehicleFields f={f} setF={setF} />
        {err && <div className="msg e">{err}</div>}
        <div style={{ height: 10 }} />
        <button className="b" disabled={busy} onClick={save}>Add vehicle</button>
        <div className="mini" style={{ marginTop: 6 }}>{business ? 'Then add everything you spend on it, and mark it sold to see the profit.' : ''}</div>
      </div>
    </>
  );
}

const FILTERS = [['lot', 'On the lot'], ['sold', 'Sold'], ['all', 'All']];

export default function Vehicles() {
  const { vehicles, expenses, myRole } = useBusiness();
  const { open } = useSheet();
  const readOnly = myRole === 'accountant';
  const [filter, setFilter] = useState('lot');
  const [search, setSearch] = useState('');
  const today = iso(new Date());
  const sum = useMemo(() => lotSummary(vehicles, expenses, today), [vehicles, expenses, today]);

  const rows = vehicles
    .filter(v => (filter === 'all' || (filter === 'sold' ? v.status === 'sold' : v.status !== 'sold'))
      && (!search || (vehicleTitle(v) + ' ' + (v.reg || '') + ' ' + (v.vin || '')).toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => (filter === 'sold' ? String(b.sold_date || '').localeCompare(String(a.sold_date || '')) : String(a.purchase_date || a.created_at).localeCompare(String(b.purchase_date || b.created_at))));

  const exportCsv = () => downloadCsv(
    [['Vehicle', 'Reg', 'VIN', 'Status', 'Date bought', 'Bought for', 'Spent since', 'Total in', 'Asking price', 'Sold for', 'Date sold', 'Profit', 'Days']].concat(
      vehicles.map(v => {
        const f = vehicleFinancials(v, expenses, today);
        return [vehicleTitle(v), v.reg || '', v.vin || '', STATUS_LABEL[v.status], v.purchase_date || '', f.purchase.toFixed(2), f.costs.toFixed(2), f.totalIn.toFixed(2), v.asking_price ?? '', v.sold_price ?? '', v.sold_date || '', f.profit == null ? '' : f.profit.toFixed(2), f.daysIn];
      })),
    'vehicles-' + today + '.csv');

  return (
    <section className="tab on light-tab">
      <h1>Vehicles</h1>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">On the lot</div><div className="val">{sum.inStock + sum.reserved}</div></div>
        <div className="biz-card"><div className="lbl">Money tied up</div><div className="val">{R(sum.tiedUp)}</div></div>
        <div className="biz-card"><div className="lbl">Sold this month</div><div className="val">{sum.soldThisMonth}</div></div>
        <div className="biz-card"><div className="lbl">Profit this month</div><div className={'val' + (sum.profitThisMonth < 0 ? ' bd' : '')}>{money(sum.profitThisMonth)}</div></div>
      </div>
      <div className="mini" style={{ marginBottom: 8 }}>Money tied up is what you paid plus what you have spent on the cars still on the lot{sum.avgDays ? ` · they have been here ${sum.avgDays} days on average` : ''}.</div>

      <div style={{ display: 'flex', gap: 8 }}>
        {!readOnly && <button className="b" style={{ flex: 1 }} onClick={() => open(() => <AddVehicleSheet />)}>+ Add vehicle</button>}
        <button className="b g" style={{ flex: 1 }} disabled={!vehicles.length} onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="seg" style={{ marginTop: 12 }}>
        {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <input style={{ marginTop: 10 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search make, model or reg" />

      {vehicles.length === 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>No vehicles yet.</b>
          <div className="mini" style={{ marginTop: 4 }}>Add each car when you buy it. Then record every rand you spend on it, and when it sells you will see exactly what it made.</div>
        </div>
      )}
      {vehicles.length > 0 && rows.length === 0 && <div className="mini" style={{ marginTop: 12 }}>Nothing here.</div>}

      <div className="veh-list">
        {rows.map(v => {
          const f = vehicleFinancials(v, expenses, today);
          return (
            <button key={v.id} className="card veh-row" onClick={() => open(() => <VehicleSheet vehicleId={v.id} />)}>
              <div className="veh-top">
                <b>{vehicleTitle(v)}</b>
                <span className={'veh-tag ' + v.status}>{STATUS_LABEL[v.status]}</span>
              </div>
              <div className="mini">{[v.reg, v.colour, v.mileage_km != null ? Number(v.mileage_km).toLocaleString('en-ZA') + ' km' : null].filter(Boolean).join(' · ') || 'No details yet'}</div>
              <div className="veh-nums">
                <span>Bought <b>{R(f.purchase)}</b></span>
                <span>Spent <b>{R(f.costs)}</b></span>
                <span>Total in <b>{R(f.totalIn)}</b></span>
                {f.sold
                  ? <span>Profit <b className={f.profit < 0 ? 'bd' : 'gd'}>{money(f.profit)}</b></span>
                  : <span>Asking <b>{v.asking_price ? R(+v.asking_price) : '-'}</b>{f.underwater ? <em className="bd"> below cost</em> : null}</span>}
              </div>
              <div className="mini">{f.sold ? `Sold ${v.sold_date}` : `${f.daysIn} day${f.daysIn === 1 ? '' : 's'} on the lot`}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
