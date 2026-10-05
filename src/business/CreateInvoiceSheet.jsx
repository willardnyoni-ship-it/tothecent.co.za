import { useEffect, useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { R2, iso, uid } from '../lib/format.js';
import { computeInvoiceTotals, nextInvoiceNumber, nextQuoteNumber } from '../lib/businessMath.js';
import { CURRENCIES, fetchRate, fmt, rateText, zar } from '../lib/currency.js';
import { SaleOptionList, useSaleOptions } from './saleOptions.jsx';

const blankItem = () => ({ id: uid(), description: '', qty: 1, price: 0, stock_item_id: null, recipe_id: null });

// One form for both invoices and quotes - a quote is an invoice that hasn't
// happened yet, so it has the same customer/items/notes steps, with a
// "valid until" date and an optional deposit instead of a due date.
// `prefill` lets other screens start it part-filled (e.g. Time turning
// unbilled hours into invoice lines, or a job's "New quote" button).
export function CreateInvoiceContent({ mode = 'invoice', prefill = {}, onCreated }) {
  const isQuote = mode === 'quote';
  const { close } = useSheet();
  const { business, customers, jobs, addCustomer, createInvoice, createQuote, hasFeature } = useBusiness();
  const [step, setStep] = useState(prefill.customerId ? 2 : 1);
  const [customerId, setCustomerId] = useState(prefill.customerId || '');
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '', tax_number: '' });
  const [addingCustomer, setAddingCustomer] = useState(!customers.length);
  const [newCustomerId, setNewCustomerId] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState(isQuote ? nextQuoteNumber(business) : nextInvoiceNumber(business));
  const [issueDate, setIssueDate] = useState(iso(new Date()));
  const [dueDate, setDueDate] = useState(iso(new Date(Date.now() + (isQuote ? 30 : 20) * 86400000)));
  const [items, setItems] = useState(prefill.items?.length ? prefill.items.map(it => ({ ...it, id: uid() })) : [blankItem()]);
  const [jobId, setJobId] = useState(prefill.jobId || '');
  const [depositPct, setDepositPct] = useState(0);
  const showJobs = hasFeature('jobs') && jobs.length > 0;
  // Only VAT-registered vendors may charge VAT, so a business that told us
  // it isn't registered starts with VAT off. Businesses from before the
  // VAT question existed keep the old default (on).
  const [vatEnabled, setVatEnabled] = useState(prefill.vatEnabled ?? (business.business_profile ? hasFeature('vat') : true));
  const [discount, setDiscount] = useState(0);
  // Foreign currency: every amount is typed and stored in that currency, with the rand rate it was made at.
  const prefCustomer = customers.find(c => c.id === prefill.customerId);
  const [currency, setCurrency] = useState(prefill.currency || (prefCustomer && prefCustomer.currency) || 'ZAR');
  const [rate, setRate] = useState(prefill.exchangeRate ? String(prefill.exchangeRate) : '');
  const [rateNote, setRateNote] = useState('');
  const m = n => fmt(n, currency);
  useEffect(() => {
    if (currency === 'ZAR') { setRate(''); setRateNote(''); return; }
    setVatEnabled(false); // services sold abroad are usually zero-rated; the box can be ticked again
    if (prefill.exchangeRate && currency === prefill.currency) return;
    let live = true;
    setRateNote("Getting today's rate...");
    fetchRate(currency).then(r => {
      if (!live) return;
      if (r) { setRate(String(r)); setRateNote("Today's rate. You can change it."); } else { setRate(''); setRateNote("Couldn't get today's rate. Type it in."); }
    });
    return () => { live = false; };
  }, [currency]); // eslint-disable-line react-hooks/exhaustive-deps
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(business.default_payment_terms || '');
  const [banking, setBanking] = useState(business.banking_details || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const totals = computeInvoiceTotals(items, vatEnabled, discount);
  // Lines can be picked from stock (or a dish): the price fills in, and the
  // sale takes the stock off once the invoice is sent.
  const opts = useSaleOptions();
  const canPick = opts.items.length > 0 || opts.dishes.length > 0;
  const refOf = it => (it.recipe_id ? 'r:' + it.recipe_id : it.stock_item_id ? 's:' + it.stock_item_id : '');
  function pick(i, ref) {
    if (!ref) { setItem(i, { stock_item_id: null, recipe_id: null }); return; }
    const x = opts.find(ref);
    if (!x) return;
    setItem(i, { description: x.name, price: opts.priceOf(ref), stock_item_id: ref.startsWith('s:') ? x.id : null, recipe_id: ref.startsWith('r:') ? x.id : null });
  }
  const shortOn = it => { const x = it.stock_item_id ? opts.items.find(s => s.id === it.stock_item_id) : null; return x && +it.qty > +x.qty_on_hand ? x : null; };

  function setItem(i, patch) { setItems(list => list.map((it, idx) => idx === i ? { ...it, ...patch } : it)); }
  function addItem() { setItems(list => [...list, blankItem()]); }
  function removeItem(i) { setItems(list => list.filter((_, idx) => idx !== i)); }

  async function saveCustomerAndContinue() {
    if (addingCustomer) {
      if (!newCustomer.name.trim()) { setErr('Customer name is required.'); return; }
      setBusy(true);
      try {
        const created = await addCustomer(newCustomer);
        setNewCustomerId(created?.id || null);
        setErr(''); setStep(2);
      } catch (e) { setErr(e.message); } finally { setBusy(false); }
    } else {
      if (!customerId) { setErr('Choose a customer, or add a new one.'); return; }
      const cu = customers.find(x => x.id === customerId);
      if (cu && cu.currency && cu.currency !== 'ZAR' && currency === 'ZAR') setCurrency(cu.currency);
      setErr(''); setStep(2);
    }
  }

  async function save(sendAfter) {
    if (!items.some(i => i.description.trim() && +i.price > 0)) { setErr('Add at least one line item.'); return; }
    setBusy(true);
    try {
      const cust = addingCustomer ? customers.find(c => c.id === newCustomerId) : customers.find(c => c.id === customerId);
      const lines = items.filter(i => i.description.trim()).map(i => ({ description: i.description, qty: +i.qty || 1, price: +i.price || 0, total: (+i.qty || 1) * (+i.price || 0), stock_item_id: i.stock_item_id || null, recipe_id: i.recipe_id || null }));
      let created;
      if (isQuote) {
        created = await createQuote({
          customer_id: cust?.id || null, job_id: jobId || null, quote_number: invoiceNumber, issue_date: issueDate, valid_until: dueDate,
          currency, exchange_rate: currency === 'ZAR' ? 1 : +rate,
          status: sendAfter ? 'sent' : 'draft', items: lines, vat_enabled: vatEnabled,
          subtotal: totals.subtotal, vat: totals.vat, discount: +discount || 0, total: totals.total,
          deposit_pct: Math.min(100, Math.max(0, +depositPct || 0)), notes, payment_terms: terms, banking_details: banking,
        });
      } else {
        created = await createInvoice({
          customer_id: cust?.id || null, job_id: jobId || null, invoice_number: invoiceNumber, issue_date: issueDate, due_date: dueDate,
          currency, exchange_rate: currency === 'ZAR' ? 1 : +rate,
          status: sendAfter ? 'sent' : 'draft', subtotal: totals.subtotal, vat: totals.vat, discount: +discount || 0,
          total: totals.total, notes, payment_terms: terms, banking_details: banking,
        }, lines);
      }
      await onCreated?.(created);
      close();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="row"><h1>{isQuote ? 'Create Quote' : 'Create Invoice'}</h1><button className="b g sm" onClick={close}>Cancel</button></div>
      <div className="sub">Step {step} of 3</div>

      {step === 1 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Customer</h2>
          {customers.length > 0 && !addingCustomer && (
            <>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">Select Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div style={{ height: 8 }} />
              <button className="b g sm" onClick={() => setAddingCustomer(true)}>+ New Customer</button>
            </>
          )}
          {addingCustomer && (
            <>
              <label style={{ marginTop: customers.length ? 10 : 0 }}>Business/Customer Name</label>
              <input value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              <label>Email</label>
              <input type="email" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} />
              <label>Phone</label>
              <input value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
              <label>Address</label>
              <input value={newCustomer.address} onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })} />
              <label>Tax/VAT number <span className="mini">(optional)</span></label>
              <input value={newCustomer.tax_number} onChange={e => setNewCustomer({ ...newCustomer, tax_number: e.target.value })} />
              {customers.length > 0 && <><div style={{ height: 8 }} /><button className="b g sm" onClick={() => setAddingCustomer(false)}>Choose existing customer instead</button></>}
            </>
          )}
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 12 }} />
          <button className="b" disabled={busy} onClick={saveCustomerAndContinue}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>{isQuote ? 'Quote' : 'Invoice'}</h2>
          <label>{isQuote ? 'Quote Number' : 'Invoice Number'}</label>
          <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
          <label>Issue Date</label>
          <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          <label>{isQuote ? 'Valid Until' : 'Due Date'}</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          <label>Currency</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)}>
            {CURRENCIES.map(([c, n]) => <option key={c} value={c}>{c} - {n}</option>)}
          </select>
          {currency !== 'ZAR' && (
            <>
              <label>Exchange rate <span className="mini">(rand for 1 {currency})</span></label>
              <input type="number" inputMode="decimal" step="0.0001" min="0" value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 18.45" />
              {rateNote && <div className="mini">{rateNote}</div>}
              <div className="mini">The customer pays in {currency}. Your books keep the rand value at this rate. When the money arrives you record the rand you actually received.</div>
            </>
          )}
          {showJobs && (
            <>
              <label>Job <span className="mini">(optional)</span></label>
              <select value={jobId} onChange={e => setJobId(e.target.value)}>
                <option value="">No job</option>
                {jobs.filter(j => j.status !== 'cancelled').map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </>
          )}

          <h2>Items</h2>
          {items.map((it, i) => (
            <div className="biz-item-wrap" key={it.id}>
            {canPick ? (
              <select className="biz-pick" value={refOf(it)} onChange={e => pick(i, e.target.value)}>
                <option value="">Type it in, or pick from stock…</option>
                {opts.dishes.length > 0 && <optgroup label="Dishes & services">{opts.dishes.map(r => <option key={r.id} value={'r:' + r.id}>{r.name} - {R2(+r.selling_price)}</option>)}</optgroup>}
                <optgroup label="Stock items">{opts.items.map(s => <option key={s.id} value={'s:' + s.id}>{s.name} - {R2(+s.sell_price)} (have {+s.qty_on_hand})</option>)}</optgroup>
              </select>
            ) : null}
            <div className="biz-item-row">
              <input placeholder="Description" value={it.description} onChange={e => setItem(i, { description: e.target.value })} />
              <input type="number" placeholder="Qty" value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} />
              <input type="number" placeholder="Price" value={it.price} onChange={e => setItem(i, { price: e.target.value })} />
              <div className="mono r" style={{ fontWeight: 600 }}>{m((+it.qty || 0) * (+it.price || 0))}</div>
              <button className="b d sm" onClick={() => removeItem(i)}>&times;</button>
            </div>
            {refOf(it) && !shortOn(it) && !isQuote && <div className="mini biz-stk-note">Takes {it.recipe_id ? 'its ingredients' : 'this'} off your stock when the invoice is sent.</div>}
            {shortOn(it) && <div className="msg e biz-stk-note">You only have {+shortOn(it).qty_on_hand} {shortOn(it).unit} of {shortOn(it).name} - stock will go below zero.</div>}
            </div>
          ))}
          <button className="b g sm" onClick={addItem}>+ Add item</button>

          <label className="chk" style={{ marginTop: 14 }}><input type="checkbox" checked={vatEnabled} onChange={e => setVatEnabled(e.target.checked)} /><span>Add 15% VAT</span></label>
          <label>Discount ({currency})</label>
          <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} />
          {isQuote && (
            <>
              <label>Deposit required (%) <span className="mini">(0 for none)</span></label>
              <input type="number" min="0" max="100" value={depositPct} onChange={e => setDepositPct(e.target.value)} />
            </>
          )}

          <div className="biz-totals">
            <div className="row"><span>Subtotal</span><span className="mono">{m(totals.subtotal)}</span></div>
            <div className="row"><span>VAT</span><span className="mono">{m(totals.vat)}</span></div>
            <div className="row"><span>Discount</span><span className="mono">-{m(+discount || 0)}</span></div>
            <div className="row grand"><span>TOTAL</span><span className="mono">{m(totals.total)}</span></div>
            {currency !== 'ZAR' && +rate > 0 && <div className="row"><span className="mini">Worth about, at {rateText(currency, +rate)}</span><span className="mono">{fmt(zar({ currency, exchange_rate: rate }, totals.total))}</span></div>}
            {isQuote && +depositPct > 0 && <div className="row"><span>Deposit ({Math.min(100, +depositPct)}%)</span><span className="mono">{m(totals.total * Math.min(100, +depositPct) / 100)}</span></div>}
          </div>
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 12 }} />
          <button className="b" onClick={() => { if (currency !== 'ZAR' && !(+rate > 0)) { setErr('Enter the exchange rate, or choose rand.'); return; } setErr(''); setStep(3); }}>Continue</button>
        </div>
      )}

      {step === 3 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Notes</h2>
          <label>Payment Terms</label>
          <input value={terms} onChange={e => setTerms(e.target.value)} placeholder="e.g. Payment due within 14 days" />
          <label>Notes</label>
          <textarea rows="3" value={notes} onChange={e => setNotes(e.target.value)} />
          <label>Banking Details</label>
          <textarea rows="3" value={banking} onChange={e => setBanking(e.target.value)} placeholder={currency === 'ZAR' ? 'Bank, account number, branch code' : 'Bank, account number, SWIFT/BIC code (and IBAN if needed)'} />
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 14 }} />
          <button className="b" disabled={busy} onClick={() => save(true)}>Save & Mark as Sent</button>
          <div style={{ height: 8 }} />
          <button className="b g" disabled={busy} onClick={() => save(false)}>Save as Draft</button>
        </div>
      )}
    </>
  );
}

export function useCreateInvoice() {
  const { open } = useSheet();
  return (opts = {}) => open(() => <CreateInvoiceContent {...opts} />);
}

export function useCreateQuote() {
  const { open } = useSheet();
  return (opts = {}) => open(() => <CreateInvoiceContent mode="quote" {...opts} />);
}
