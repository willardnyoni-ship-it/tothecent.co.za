import { useState } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { R2, iso, uid } from '../lib/format.js';
import { computeInvoiceTotals, nextInvoiceNumber } from '../lib/businessMath.js';

export function CreateInvoiceContent() {
  const { close } = useSheet();
  const { business, customers, addCustomer, createInvoice } = useBusiness();
  const [step, setStep] = useState(1);
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '', tax_number: '' });
  const [addingCustomer, setAddingCustomer] = useState(!customers.length);
  const [newCustomerId, setNewCustomerId] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState(nextInvoiceNumber(business));
  const [issueDate, setIssueDate] = useState(iso(new Date()));
  const [dueDate, setDueDate] = useState(iso(new Date(Date.now() + 20 * 86400000)));
  const [items, setItems] = useState([{ id: uid(), description: '', qty: 1, price: 0 }]);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(business.default_payment_terms || '');
  const [banking, setBanking] = useState(business.banking_details || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const totals = computeInvoiceTotals(items, vatEnabled, discount);

  function setItem(i, patch) { setItems(list => list.map((it, idx) => idx === i ? { ...it, ...patch } : it)); }
  function addItem() { setItems(list => [...list, { id: uid(), description: '', qty: 1, price: 0 }]); }
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
      setErr(''); setStep(2);
    }
  }

  async function save(sendAfter) {
    if (!items.some(i => i.description.trim() && +i.price > 0)) { setErr('Add at least one line item.'); return; }
    setBusy(true);
    try {
      const cust = addingCustomer ? customers.find(c => c.id === newCustomerId) : customers.find(c => c.id === customerId);
      const inv = await createInvoice({
        customer_id: cust?.id || null, invoice_number: invoiceNumber, issue_date: issueDate, due_date: dueDate,
        status: sendAfter ? 'sent' : 'draft', subtotal: totals.subtotal, vat: totals.vat, discount: +discount || 0,
        total: totals.total, notes, payment_terms: terms, banking_details: banking,
      }, items.filter(i => i.description.trim()).map(i => ({ description: i.description, qty: +i.qty || 1, price: +i.price || 0, total: (+i.qty || 1) * (+i.price || 0) })));
      close();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="row"><h1>Create Invoice</h1><button className="b g sm" onClick={close}>Cancel</button></div>
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
          <h2 style={{ marginTop: 0 }}>Invoice</h2>
          <label>Invoice Number</label>
          <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
          <label>Issue Date</label>
          <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          <label>Due Date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />

          <h2>Items</h2>
          {items.map((it, i) => (
            <div className="biz-item-row" key={it.id}>
              <input placeholder="Description" value={it.description} onChange={e => setItem(i, { description: e.target.value })} />
              <input type="number" placeholder="Qty" value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} />
              <input type="number" placeholder="Price" value={it.price} onChange={e => setItem(i, { price: e.target.value })} />
              <div className="mono r" style={{ fontWeight: 600 }}>{R2((+it.qty || 0) * (+it.price || 0))}</div>
              <button className="b d sm" onClick={() => removeItem(i)}>&times;</button>
            </div>
          ))}
          <button className="b g sm" onClick={addItem}>+ Add item</button>

          <label className="chk" style={{ marginTop: 14 }}><input type="checkbox" checked={vatEnabled} onChange={e => setVatEnabled(e.target.checked)} /><span>Add 15% VAT</span></label>
          <label>Discount (R)</label>
          <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} />

          <div className="biz-totals">
            <div className="row"><span>Subtotal</span><span className="mono">{R2(totals.subtotal)}</span></div>
            <div className="row"><span>VAT</span><span className="mono">{R2(totals.vat)}</span></div>
            <div className="row"><span>Discount</span><span className="mono">-{R2(+discount || 0)}</span></div>
            <div className="row grand"><span>TOTAL</span><span className="mono">{R2(totals.total)}</span></div>
          </div>
          {err && <div className="msg e">{err}</div>}
          <div style={{ height: 12 }} />
          <button className="b" onClick={() => setStep(3)}>Continue</button>
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
          <textarea rows="3" value={banking} onChange={e => setBanking(e.target.value)} placeholder="Bank, account number, branch code" />
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
  return () => open(() => <CreateInvoiceContent />);
}
