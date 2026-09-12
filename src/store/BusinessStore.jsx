import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useBudget } from './BudgetStore.jsx';
import { businessApi } from '../lib/businessApi.js';
import { advanceDate, computeInvoiceTotals } from '../lib/businessMath.js';

const BusinessContext = createContext(null);
export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used inside <BusinessProvider>');
  return ctx;
}

const EMPTY = { customers: [], invoices: [], transactions: [], expenses: [], members: [], bankAccounts: [], categories: [], recurringInvoices: [] };

// Safety cap on how many missed occurrences a single stale recurring series
// generates in one go (e.g. weekly invoice nobody looked at for a year) -
// generates the most recent ones and leaves next_run_date moving forward
// rather than flooding the invoice list.
const MAX_CATCHUP_RUNS = 12;

export function BusinessProvider({ children }) {
  const { syncCfg, ensureToken } = useBudget();
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState(EMPTY);
  const [justGenerated, setJustGenerated] = useState(0);
  const generatingRef = useRef(false);

  const loadBusiness = useCallback(async () => {
    if (!syncCfg.token) { setBusiness(null); setLoading(false); setChecked(true); return; }
    setLoading(true);
    try {
      const token = await ensureToken();
      const rows = await businessApi.select(syncCfg, token, 'businesses', 'select=*&order=created_at.asc&limit=1');
      setBusiness(rows && rows[0] ? rows[0] : null);
    } catch (e) {
      console.warn('load business failed', e);
      setBusiness(null);
    } finally { setLoading(false); setChecked(true); }
  }, [syncCfg, ensureToken]);

  // Deliberately keyed on syncCfg.token, not on loadBusiness's own identity.
  // syncCfg gets a new object (same token) every time the personal side's
  // 20s auto-sync poll finishes (it patches in syncCfg.last), which would
  // otherwise re-run this effect, flip `loading` back to true, and unmount
  // whatever business screen is on screen mid-interaction (confirmed live:
  // it was resetting the signup form's typed name a few seconds in).
  useEffect(() => { loadBusiness(); }, [syncCfg.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = useCallback(async () => {
    if (!business) { setData(EMPTY); return; }
    const token = await ensureToken();
    const biz = `business_id=eq.${business.id}`;
    const [customers, invoices, items, transactions, expenses, members, bankAccounts, categories, recurringInvoices] = await Promise.all([
      businessApi.select(syncCfg, token, 'customers', `${biz}&select=*&order=name.asc`),
      businessApi.select(syncCfg, token, 'invoices', `${biz}&select=*&order=created_at.desc`),
      businessApi.select(syncCfg, token, 'invoice_items', `select=*,invoices!inner(business_id)&invoices.business_id=eq.${business.id}`),
      businessApi.select(syncCfg, token, 'business_transactions', `${biz}&select=*&order=date.desc`),
      businessApi.select(syncCfg, token, 'expenses', `${biz}&select=*&order=date.desc`),
      businessApi.select(syncCfg, token, 'business_members', `${biz}&select=*&order=invited_at.asc`),
      businessApi.select(syncCfg, token, 'bank_accounts', `${biz}&select=*&order=name.asc`),
      businessApi.select(syncCfg, token, 'business_categories', `${biz}&select=*&order=name.asc`),
      businessApi.select(syncCfg, token, 'recurring_invoices', `${biz}&select=*&order=next_run_date.asc`),
    ]);
    const itemsByInvoice = {};
    (items || []).forEach(it => { (itemsByInvoice[it.invoice_id] = itemsByInvoice[it.invoice_id] || []).push(it); });
    setData({
      customers: customers || [], expenses: expenses || [], members: members || [],
      bankAccounts: bankAccounts || [], categories: categories || [],
      transactions: transactions || [],
      invoices: (invoices || []).map(inv => ({ ...inv, items: itemsByInvoice[inv.id] || [] })),
      recurringInvoices: recurringInvoices || [],
    });
  }, [business, syncCfg, ensureToken]);

  // Same reasoning as loadBusiness's effect above: key on business.id, not
  // on refreshAll's identity, so an unrelated syncCfg change (the personal
  // side's auto-sync tick) doesn't refetch every business table and cause
  // list screens to flicker mid-interaction.
  useEffect(() => { refreshAll(); }, [business && business.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const createBusiness = useCallback(async (fields) => {
    const token = await ensureToken();
    const [biz] = await businessApi.insert(syncCfg, token, 'businesses', [fields]);
    await businessApi.insert(syncCfg, token, 'business_members', [{
      business_id: biz.id, email: syncCfg.email, user_id: syncCfg.userId, role: 'owner', status: 'active', joined_at: new Date().toISOString(),
    }]);
    setBusiness(biz);
    return biz;
  }, [syncCfg, ensureToken]);

  const updateBusiness = useCallback(async (patch) => {
    const token = await ensureToken();
    const [updated] = await businessApi.update(syncCfg, token, 'businesses', `id=eq.${business.id}`, patch);
    setBusiness(updated);
  }, [business, syncCfg, ensureToken]);

  // ---------- generic resource helpers, all scoped to the current business ----------
  const withBiz = (row) => ({ ...row, business_id: business?.id });

  const addCustomer = useCallback(async (fields) => {
    const token = await ensureToken();
    // Returns the created row - callers that need to act on this specific
    // customer right away (e.g. CreateInvoiceSheet attaching an invoice to
    // a customer just added inline) can't assume where it lands in the
    // customers array: refreshAll() re-fetches ordered by name, not
    // creation time, so "the last item" is often a different customer
    // entirely.
    const [created] = await businessApi.insert(syncCfg, token, 'customers', [withBiz(fields)]);
    await refreshAll();
    return created;
  }, [syncCfg, ensureToken, business, refreshAll]);

  const updateCustomer = useCallback(async (id, patch) => {
    const token = await ensureToken();
    await businessApi.update(syncCfg, token, 'customers', `id=eq.${id}`, patch);
    await refreshAll();
  }, [syncCfg, ensureToken, refreshAll]);

  const addTransaction = useCallback(async (fields) => {
    const token = await ensureToken();
    await businessApi.insert(syncCfg, token, 'business_transactions', [withBiz(fields)]);
    await refreshAll();
  }, [syncCfg, ensureToken, business, refreshAll]);

  const addTransactions = useCallback(async (rows) => {
    if (!rows.length) return;
    const token = await ensureToken();
    await businessApi.insert(syncCfg, token, 'business_transactions', rows.map(withBiz));
    await refreshAll();
  }, [syncCfg, ensureToken, business, refreshAll]);

  const updateTransaction = useCallback(async (id, patch) => {
    const token = await ensureToken();
    await businessApi.update(syncCfg, token, 'business_transactions', `id=eq.${id}`, patch);
    await refreshAll();
  }, [syncCfg, ensureToken, refreshAll]);

  const createInvoice = useCallback(async (invoiceFields, items) => {
    const token = await ensureToken();
    const [inv] = await businessApi.insert(syncCfg, token, 'invoices', [withBiz(invoiceFields)]);
    if (items.length) {
      await businessApi.insert(syncCfg, token, 'invoice_items', items.map((it, i) => ({ ...it, invoice_id: inv.id, sort_order: i })));
    }
    await businessApi.update(syncCfg, token, 'businesses', `id=eq.${business.id}`, { next_invoice_number: (business.next_invoice_number || 1) + 1 });
    setBusiness(b => ({ ...b, next_invoice_number: (b.next_invoice_number || 1) + 1 }));
    await refreshAll();
    return inv;
  }, [syncCfg, ensureToken, business, refreshAll]);

  const updateInvoice = useCallback(async (id, patch) => {
    const token = await ensureToken();
    await businessApi.update(syncCfg, token, 'invoices', `id=eq.${id}`, patch);
    await refreshAll();
  }, [syncCfg, ensureToken, refreshAll]);

  // Templates a recurring series off an existing invoice's items/terms.
  // next_run_date starts one period after that invoice's issue date, since
  // the invoice being converted already covers the current period.
  const makeInvoiceRecurring = useCallback(async (invoice, frequency) => {
    const token = await ensureToken();
    const dueDays = invoice.due_date
      ? Math.max(0, Math.round((new Date(invoice.due_date) - new Date(invoice.issue_date)) / 86400000))
      : 20;
    const [rec] = await businessApi.insert(syncCfg, token, 'recurring_invoices', [withBiz({
      customer_id: invoice.customer_id, frequency, due_days: dueDays,
      next_run_date: advanceDate(invoice.issue_date, frequency),
      vat_enabled: +invoice.vat > 0, discount: invoice.discount, notes: invoice.notes,
      payment_terms: invoice.payment_terms, banking_details: invoice.banking_details,
      items: (invoice.items || []).map(it => ({ description: it.description, qty: it.qty, price: it.price })),
    })]);
    await businessApi.update(syncCfg, token, 'invoices', `id=eq.${invoice.id}`, { recurring_invoice_id: rec.id });
    await refreshAll();
    return rec;
  }, [syncCfg, ensureToken, business, refreshAll]);

  const updateRecurringInvoice = useCallback(async (id, patch) => {
    const token = await ensureToken();
    await businessApi.update(syncCfg, token, 'recurring_invoices', `id=eq.${id}`, patch);
    await refreshAll();
  }, [syncCfg, ensureToken, refreshAll]);

  // Runs whenever fresh data comes in: generates any invoice occurrences a
  // recurring series has missed (capped per series), then advances that
  // series' next_run_date. Idempotent - once a series is caught up this is
  // a no-op, so re-running it on every refreshAll is harmless.
  const runRecurringInvoices = useCallback(async () => {
    if (generatingRef.current || !business) return;
    const due = data.recurringInvoices.filter(r => r.status === 'active' && r.next_run_date <= new Date().toISOString().slice(0, 10));
    if (!due.length) return;
    generatingRef.current = true;
    // Total invoices created across every series in this run, used for
    // numbering - not reset per series, so numbers stay sequential across
    // however many recurring series are due at once.
    let createdSoFar = 0;
    try {
      const token = await ensureToken();
      for (const rec of due) {
        let runDate = rec.next_run_date;
        let count = rec.generated_count || 0;
        let lastInvoiceId = rec.last_generated_invoice_id;
        const today = new Date().toISOString().slice(0, 10);
        let runs = 0;
        while (runDate <= today && runs < MAX_CATCHUP_RUNS) {
          const dueDate = new Date(new Date(runDate + 'T00:00:00Z').getTime() + rec.due_days * 86400000).toISOString().slice(0, 10);
          const totals = computeInvoiceTotals(rec.items, rec.vat_enabled, rec.discount);
          const invoiceNumber = (business.invoice_prefix || 'INV-') + String((business.next_invoice_number || 1) + createdSoFar).padStart(4, '0');
          const [inv] = await businessApi.insert(syncCfg, token, 'invoices', [withBiz({
            customer_id: rec.customer_id, invoice_number: invoiceNumber,
            issue_date: runDate, due_date: dueDate, status: 'sent',
            subtotal: totals.subtotal, vat: totals.vat, discount: rec.discount, total: totals.total,
            notes: rec.notes, payment_terms: rec.payment_terms, banking_details: rec.banking_details,
            recurring_invoice_id: rec.id,
          })]);
          if (rec.items.length) {
            await businessApi.insert(syncCfg, token, 'invoice_items',
              rec.items.map((it, i) => ({ ...it, invoice_id: inv.id, sort_order: i, total: (+it.qty || 1) * (+it.price || 0) })));
          }
          lastInvoiceId = inv.id;
          runs++;
          runDate = advanceDate(runDate, rec.frequency);
          // Persist progress after EACH invoice, not only once the whole
          // catch-up batch for this series finishes. Previously, if a
          // network failure hit partway through (e.g. invoice #4 of a
          // 6-invoice catch-up), the exception skipped straight past the
          // next_run_date/generated_count update below - so on the next
          // run, invoices #1-3 (which had already been created and were
          // sitting in the invoices table) would be silently regenerated
          // as duplicates, since the series still thought it hadn't billed
          // that period. Updating after every single invoice means a later
          // failure only leaves the *next* period pending, never replays
          // one that's already been billed.
          createdSoFar++;
          const nextInvoiceNumber = (business.next_invoice_number || 1) + createdSoFar;
          await businessApi.update(syncCfg, token, 'businesses', `id=eq.${business.id}`, { next_invoice_number: nextInvoiceNumber });
          // Also mirror it into local state right away, not just on success
          // at the end of the whole run - business is a closure over
          // whatever React state existed when this call started, so if a
          // LATER invoice in this same batch throws, the component's
          // business.next_invoice_number would otherwise stay stuck at its
          // pre-run value for the rest of the session (nothing else
          // refreshes it from the server), and the next retry would hand
          // out numbers that collide with ones already created above.
          setBusiness(b => ({ ...b, next_invoice_number: nextInvoiceNumber }));
          await businessApi.update(syncCfg, token, 'recurring_invoices', `id=eq.${rec.id}`,
            { next_run_date: runDate, generated_count: count + runs, last_generated_invoice_id: lastInvoiceId });
        }
      }
      if (createdSoFar > 0) {
        // next_invoice_number is already current - each invoice above
        // updated it incrementally as it was created, so adding
        // createdSoFar again here would double it.
        setJustGenerated(g => g + createdSoFar);
        await refreshAll();
      }
    } catch (e) { console.warn('recurring invoice generation failed', e); } finally { generatingRef.current = false; }
  }, [business, syncCfg, ensureToken, data.recurringInvoices, refreshAll]);

  useEffect(() => { runRecurringInvoices(); }, [data.recurringInvoices]); // eslint-disable-line react-hooks/exhaustive-deps

  const addExpense = useCallback(async (fields) => {
    const token = await ensureToken();
    await businessApi.insert(syncCfg, token, 'expenses', [withBiz(fields)]);
    await refreshAll();
  }, [syncCfg, ensureToken, business, refreshAll]);

  const updateExpense = useCallback(async (id, patch) => {
    const token = await ensureToken();
    await businessApi.update(syncCfg, token, 'expenses', `id=eq.${id}`, patch);
    await refreshAll();
  }, [syncCfg, ensureToken, refreshAll]);

  const inviteMember = useCallback(async (email, role) => {
    const token = await ensureToken();
    await businessApi.insert(syncCfg, token, 'business_members', [{ business_id: business.id, email, role, status: 'invited' }]);
    await refreshAll();
  }, [syncCfg, ensureToken, business, refreshAll]);

  const updateMemberRole = useCallback(async (email, role) => {
    const token = await ensureToken();
    await businessApi.update(syncCfg, token, 'business_members', `business_id=eq.${business.id}&email=eq.${encodeURIComponent(email)}`, { role });
    await refreshAll();
  }, [syncCfg, ensureToken, business, refreshAll]);

  const removeMember = useCallback(async (email) => {
    const token = await ensureToken();
    await businessApi.remove(syncCfg, token, 'business_members', `business_id=eq.${business.id}&email=eq.${encodeURIComponent(email)}`);
    await refreshAll();
  }, [syncCfg, ensureToken, business, refreshAll]);

  // Claims a pending invite for the signed-in user's own email - called once
  // after sign-in so someone invited to a business actually gets in.
  const claimInvites = useCallback(async () => {
    if (!syncCfg.token || !syncCfg.email) return;
    try {
      const token = await ensureToken();
      const invites = await businessApi.select(syncCfg, token, 'business_members', `email=eq.${encodeURIComponent(syncCfg.email)}&status=eq.invited&select=*`);
      for (const inv of (invites || [])) {
        await businessApi.update(syncCfg, token, 'business_members', `business_id=eq.${inv.business_id}&email=eq.${encodeURIComponent(syncCfg.email)}`,
          { user_id: syncCfg.userId, status: 'active', joined_at: new Date().toISOString() });
      }
      if (invites && invites.length) await loadBusiness();
    } catch (e) { console.warn('claimInvites failed', e); }
  }, [syncCfg, ensureToken, loadBusiness]);

  const addBankAccount = useCallback(async (name) => {
    const token = await ensureToken();
    await businessApi.insert(syncCfg, token, 'bank_accounts', [withBiz({ name })]);
    await refreshAll();
  }, [syncCfg, ensureToken, business, refreshAll]);

  const value = {
    business, loading, checked, hasBusiness: !!business, ...data,
    createBusiness, updateBusiness, refreshAll,
    addCustomer, updateCustomer, addTransaction, addTransactions, updateTransaction,
    createInvoice, updateInvoice, makeInvoiceRecurring, updateRecurringInvoice, addExpense, updateExpense,
    inviteMember, updateMemberRole, removeMember, claimInvites, addBankAccount,
    justGenerated, clearJustGenerated: () => setJustGenerated(0),
    myRole: (data.members.find(m => m.user_id === syncCfg.userId) || {}).role || (business && business.owner_id === syncCfg.userId ? 'owner' : null),
  };

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}
