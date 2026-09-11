import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useBudget } from './BudgetStore.jsx';
import { businessApi } from '../lib/businessApi.js';

const BusinessContext = createContext(null);
export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used inside <BusinessProvider>');
  return ctx;
}

const EMPTY = { customers: [], invoices: [], transactions: [], expenses: [], members: [], bankAccounts: [], categories: [] };

export function BusinessProvider({ children }) {
  const { syncCfg, ensureToken } = useBudget();
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState(EMPTY);

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
    const [customers, invoices, items, transactions, expenses, members, bankAccounts, categories] = await Promise.all([
      businessApi.select(syncCfg, token, 'customers', `${biz}&select=*&order=name.asc`),
      businessApi.select(syncCfg, token, 'invoices', `${biz}&select=*&order=created_at.desc`),
      businessApi.select(syncCfg, token, 'invoice_items', `select=*,invoices!inner(business_id)&invoices.business_id=eq.${business.id}`),
      businessApi.select(syncCfg, token, 'business_transactions', `${biz}&select=*&order=date.desc`),
      businessApi.select(syncCfg, token, 'expenses', `${biz}&select=*&order=date.desc`),
      businessApi.select(syncCfg, token, 'business_members', `${biz}&select=*&order=invited_at.asc`),
      businessApi.select(syncCfg, token, 'bank_accounts', `${biz}&select=*&order=name.asc`),
      businessApi.select(syncCfg, token, 'business_categories', `${biz}&select=*&order=name.asc`),
    ]);
    const itemsByInvoice = {};
    (items || []).forEach(it => { (itemsByInvoice[it.invoice_id] = itemsByInvoice[it.invoice_id] || []).push(it); });
    setData({
      customers: customers || [], expenses: expenses || [], members: members || [],
      bankAccounts: bankAccounts || [], categories: categories || [],
      transactions: transactions || [],
      invoices: (invoices || []).map(inv => ({ ...inv, items: itemsByInvoice[inv.id] || [] })),
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
    await businessApi.insert(syncCfg, token, 'customers', [withBiz(fields)]);
    await refreshAll();
  }, [syncCfg, ensureToken, business, refreshAll]);

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
    addCustomer, addTransaction, addTransactions, updateTransaction,
    createInvoice, updateInvoice, addExpense, updateExpense,
    inviteMember, updateMemberRole, removeMember, claimInvites, addBankAccount,
    myRole: (data.members.find(m => m.user_id === syncCfg.userId) || {}).role || (business && business.owner_id === syncCfg.userId ? 'owner' : null),
  };

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}
