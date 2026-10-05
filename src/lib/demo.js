// Demo mode: /app/?demo=<business type> runs the real business app against
// example data held in memory - no sign-in, no server, nothing saved. The
// owner portal uses it to preview each kind of business.
//
// Two things keep a demo from ever touching real data:
//  1. The browser's localStorage is replaced by an in-memory copy for the
//     whole page, so the app can't read or overwrite the real budget or
//     session (a demo inside the portal shares the browser with the owner's
//     real sign-in).
//  2. Every business request is answered here instead of going to Supabase.
import { buildDemoDb, demoOwnerEmail, DEMO_BIZ_ID, DEMO_USER_ID } from './demoData.js';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const PROFILE = params.get('demo') || '';
export const isDemo = () => !!PROFILE;
export const demoProfile = () => PROFILE;

const DEMO_SESSION = {
  url: '', key: 'demo', token: 'demo-token', refresh: '', userId: DEMO_USER_ID, email: demoOwnerEmail(PROFILE),
  expires: Date.now() + 1e12, auto: false,
};

export function installDemo() {
  if (!PROFILE) return;
  // The demo's clock never says earlier than the 18th of the month. Home and
  // the reports count "this month" and "this week", so on the 3rd they'd look
  // empty. Every date in the page - the example data included - moves with it.
  const RealDate = Date;
  const dom = new RealDate().getDate();
  const shift = dom < 16 ? (18 - dom) * 86400000 : 0;
  if (shift) {
    class DemoDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(RealDate.now() + shift); else super(...a); }
      static now() { return RealDate.now() + shift; }
    }
    window.Date = DemoDate;
  }
  const store = new Map([
    ['wnSync_v1', JSON.stringify(DEMO_SESSION)], ['wnAppMode', 'business'], ['wnTourDone_business', '1'], ['wnTourDone', '1'],
  ]);
  const api = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: k => { store.delete(k); },
    clear: () => store.clear(),
    key: i => [...store.keys()][i] ?? null,
  };
  const shim = new Proxy(api, {
    get: (t, k) => (k === 'length' ? store.size : k in t ? t[k] : store.has(k) ? store.get(k) : undefined),
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k), writable: true } : undefined),
    has: (t, k) => k in t || store.has(k),
  });
  try { Object.defineProperty(window, 'localStorage', { configurable: true, value: shim }); } catch (e) { /* ignore */ }
}

let db = null;
function data() {
  if (!db) db = buildDemoDb(PROFILE, { vat: params.get('vat') === '1', payroll: params.get('payroll') === '1' });
  return db;
}

// ---- a tiny PostgREST: eq / neq / in / is / gte / lte filters, order, limit, ----
// ---- and the one embedded join the app uses (invoice_items -> invoices).     ----
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2));

function matcher(table, qs) {
  const checks = [];
  for (const [k, raw] of qs.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot), val = raw.slice(dot + 1);
    const get = k.includes('.')
      ? row => { const [rel, col] = k.split('.'); const parent = (data()[rel] || []).find(p => p.id === row[rel === 'invoices' ? 'invoice_id' : rel.replace(/s$/, '_id')]); return parent ? parent[col] : undefined; }
      : row => row[k];
    if (op === 'eq') checks.push(row => String(get(row)) === val);
    else if (op === 'neq') checks.push(row => String(get(row)) !== val);
    else if (op === 'in') { const set = new Set(val.replace(/^\(|\)$/g, '').split(',')); checks.push(row => set.has(String(get(row)))); }
    else if (op === 'is') checks.push(row => (val === 'null' ? get(row) == null : get(row) != null));
    else if (op === 'gte') checks.push(row => get(row) >= val);
    else if (op === 'lte') checks.push(row => get(row) <= val);
    else if (op === 'ilike') { const re = new RegExp('^' + decodeURIComponent(val).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'); checks.push(row => re.test(String(get(row) ?? ''))); }
  }
  return row => checks.every(c => c(row));
}

function sortRows(rows, order) {
  if (!order) return rows;
  const keys = order.split(',').map(p => { const [c, d] = p.split('.'); return [c, d === 'desc' ? -1 : 1]; });
  return [...rows].sort((a, b) => {
    for (const [c, dir] of keys) {
      const x = a[c], y = b[c];
      if (x == null && y == null) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      if (x < y) return -dir;
      if (x > y) return dir;
    }
    return 0;
  });
}

const clone = v => JSON.parse(JSON.stringify(v));

// The database's month lock, for the demo (see the month_lock migration for the real rules).
const LOCK_DATE = { invoices: 'issue_date', pay_runs: 'period' };
const LOCK_ALLOWED = {
  business_transactions: ['linked_invoice_id', 'job_id', 'vehicle_id'],
  expenses: ['receipt_storage_path', 'matched_transaction_id', 'vehicle_id', 'job_id'],
  invoices: ['paid_amount', 'last_reminded_at', 'due_date', 'notes', 'payment_terms', 'banking_details', 'job_id', 'recurring_invoice_id', 'quote_id', 'share_token'],
  pay_runs: [],
};
function lockedMonthOf(table, row) {
  if (!(table in LOCK_ALLOWED)) return null;
  const col = LOCK_DATE[table] || 'date';
  const m = String(row[col] || '').slice(0, 7);
  return m && (data().month_reviews || []).some(r => r.business_id === row.business_id && String(r.month).slice(0, 7) === m) ? m : null;
}
function lockCheck(table, method, rows, body) {
  for (const row of rows) {
    const m = lockedMonthOf(table, row) || (method === 'PATCH' && body ? lockedMonthOf(table, { ...row, ...body }) : null);
    if (!m) continue;
    if (method === 'PATCH') {
      const bad = Object.keys(body || {}).some(k => !LOCK_ALLOWED[table].includes(k) && k !== 'updated_at' && body[k] !== row[k]
        && !(table === 'invoices' && k === 'status' && !['cancelled', 'draft'].includes(body[k]) && !['cancelled', 'draft'].includes(row[k])));
      if (!bad) continue;
    }
    const label = new Date(m + '-01T12:00:00').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    throw new Error(`MONTH_LOCKED: ${label} is signed off. Re-open it under Month-end to add or change entries dated in it.`);
  }
}

export async function demoRequest(path, opts = {}) {
  const [pathname, query = ''] = path.split('?');
  const table = pathname.replace(/^\//, '');
  const qs = new URLSearchParams(query);
  const rows = (data()[table] = data()[table] || []);
  const method = (opts.method || 'GET').toUpperCase();
  const minimal = opts.prefer === 'return=minimal';
  const body = opts.body ? JSON.parse(opts.body) : null;
  const where = matcher(table, qs);

  if (method === 'GET') {
    let out = sortRows(rows.filter(where), qs.get('order'));
    if (qs.get('offset')) out = out.slice(+qs.get('offset'));
    if (qs.get('limit')) out = out.slice(0, +qs.get('limit'));
    out = clone(out);
    if (table === 'invoice_items' && /invoices!inner/.test(qs.get('select') || '')) {
      out.forEach(it => { const inv = data().invoices.find(i => i.id === it.invoice_id); it.invoices = { business_id: inv ? inv.business_id : null }; });
    }
    return out;
  }
  if (method === 'POST') {
    lockCheck(table, 'POST', Array.isArray(body) ? body : [body], null);
    const made = (Array.isArray(body) ? body : [body]).map(r => ({ id: uuid(), created_at: new Date().toISOString(), ...(table === 'invoices' ? { share_token: uuid(), paid_amount: 0, status: 'draft' } : {}), ...r }));
    made.forEach(r => rows.push(r));
    return minimal ? null : clone(made);
  }
  if (method === 'PATCH') {
    const hit = rows.filter(where);
    lockCheck(table, 'PATCH', hit, body);
    hit.forEach(r => Object.assign(r, body));
    return minimal ? null : clone(hit);
  }
  if (method === 'DELETE') {
    lockCheck(table, 'DELETE', rows.filter(where), null);
    const hit = new Set(rows.filter(where));
    data()[table] = rows.filter(r => !hit.has(r));
    if (table === 'invoices') data().invoice_items = data().invoice_items.filter(it => data().invoices.some(i => i.id === it.invoice_id));
    return null;
  }
  return null;
}

export { DEMO_BIZ_ID };
