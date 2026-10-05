// Turns an audit_log row into words an accountant can read.

export const TABLE_LABEL = {
  invoices: 'Invoice', quotes: 'Quote', customers: 'Customer', business_transactions: 'Bank transaction', expenses: 'Expense', business_members: 'Team member',
  businesses: 'Business settings', vehicles: 'Vehicle', employees: 'Employee', pay_runs: 'Payslips', recurring_invoices: 'Recurring invoice', jobs: 'Job', bank_accounts: 'Bank account',
};
// the "Type" filter groups
export const TYPE_FILTERS = [
  ['', 'Everything'], ['invoices', 'Invoices'], ['quotes', 'Quotes'], ['business_transactions', 'Bank transactions'], ['expenses', 'Expenses'], ['customers', 'Customers'],
  ['vehicles', 'Vehicles'], ['jobs', 'Jobs'], ['recurring_invoices', 'Recurring invoices'], ['employees', 'Employees'], ['pay_runs', 'Payslips'],
  ['business_members', 'Team'], ['businesses', 'Business settings'], ['bank_accounts', 'Bank accounts'],
];
export const ACTION_LABEL = { insert: 'Added', update: 'Changed', delete: 'Deleted' };

const COLUMN_LABEL = {
  vat_amount: 'VAT', vat: 'VAT', amount: 'Amount', total: 'Total', subtotal: 'Subtotal', paid_amount: 'Paid so far', discount: 'Discount', category: 'Category', status: 'Status',
  description: 'Description', merchant: 'Merchant', date: 'Date', due_date: 'Due date', issue_date: 'Issue date', valid_until: 'Valid until', invoice_number: 'Invoice number', quote_number: 'Quote number',
  name: 'Name', email: 'Email', phone: 'Phone', address: 'Address', tax_number: 'Tax/VAT number', role: 'Role', kind: 'Type', notes: 'Notes', currency: 'Currency', exchange_rate: 'Exchange rate',
  hourly_rate: 'Hourly rate', purchase_price: 'Bought for', sold_price: 'Sold for', asking_price: 'Asking price', sold_date: 'Date sold', purchase_date: 'Date bought', reg: 'Reg number',
  make: 'Make', model: 'Model', year: 'Year', business_profile: 'Business type', features: 'Tools', payment_terms: 'Payment terms', banking_details: 'Banking details', invoice_prefix: 'Invoice prefix',
  budget: 'Budget', deposit_pct: 'Deposit %', frequency: 'Frequency', gross: 'Gross pay', net: 'Net pay', period: 'Period', pay_type: 'Pay type', source: 'Source',
};
// columns that are plumbing, not facts a person needs to read
const HIDE = new Set(['id', 'business_id', 'updated_at', 'created_at', 'share_token', 'items', 'external_id', 'invited_at', 'joined_at', 'user_id', 'submitted_by', 'created_by', 'bank_account_id', 'sort_order']);
const LINK = { linked_invoice_id: 'Linked invoice', matched_transaction_id: 'Matched bank line', job_id: 'Job', customer_id: 'Customer', quote_id: 'Quote', vehicle_id: 'Vehicle',
  recurring_invoice_id: 'Recurring series', deposit_invoice_id: 'Deposit invoice', final_invoice_id: 'Final invoice', sale_invoice_id: 'Sale invoice', sold_to_customer_id: 'Buyer', receipt_storage_path: 'Receipt' };
const MONEY = new Set(['amount', 'total', 'subtotal', 'vat', 'vat_amount', 'paid_amount', 'discount', 'purchase_price', 'sold_price', 'asking_price', 'hourly_rate', 'budget', 'gross', 'net']);
const PRIORITY = ['kind', 'amount', 'total', 'date', 'due_date', 'status', 'category', 'role', 'email', 'make', 'purchase_price', 'name'];

const nice = c => COLUMN_LABEL[c] || c.replace(/_/g, ' ').replace(/^./, x => x.toUpperCase());

export function formatValue(col, v, table) {
  if (v === null || v === undefined || v === '') return 'empty';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none';
  if (typeof v === 'object') return 'changed';
  if (MONEY.has(col) && !isNaN(+v)) {
    const n = (+v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // rand for transactions and expenses; invoices may be in another currency, so those are left as plain numbers
    return ['business_transactions', 'expenses', 'vehicles'].includes(table) ? 'R' + n : n;
  }
  const s = String(v);
  return s.length > 70 ? s.slice(0, 67) + '...' : s;
}

// -> { title, lines: [{ label, from, to, text }] }
export function describe(e) {
  const kind = TABLE_LABEL[e.table_name] || e.table_name;
  const title = `${ACTION_LABEL[e.action] || e.action} ${kind.toLowerCase()}${e.label ? ' ' + e.label : ''}`;
  const ch = e.changes || {};
  const lines = [];
  if (e.action === 'update') {
    Object.entries(ch).forEach(([col, pair]) => {
      if (col === 'items') { lines.push({ label: 'Items', text: 'changed' }); return; }
      if (HIDE.has(col) && !LINK[col]) return;
      const [from, to] = Array.isArray(pair) ? pair : [null, pair];
      if (LINK[col]) { lines.push({ label: LINK[col], text: from == null ? 'added' : to == null ? 'removed' : 'changed' }); return; }
      lines.push({ label: nice(col), from: formatValue(col, from, e.table_name), to: formatValue(col, to, e.table_name) });
    });
  } else {
    const keys = [...PRIORITY.filter(k => k in ch), ...Object.keys(ch).filter(k => !PRIORITY.includes(k))]
      .filter(k => !HIDE.has(k) && !LINK[k] && ch[k] !== null && ch[k] !== '' && typeof ch[k] !== 'object').slice(0, 5);
    keys.forEach(k => lines.push({ label: nice(k), text: formatValue(k, ch[k], e.table_name) }));
  }
  return { title, lines };
}

const csvCell = v => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t) && isNaN(Number(t))) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
export function auditCsv(entries) {
  const rows = [['When', 'Who', 'Action', 'What', 'Record', 'Details']].concat(entries.map(e => {
    const d = describe(e);
    return [e.changed_at, e.actor_email || '', ACTION_LABEL[e.action] || e.action, TABLE_LABEL[e.table_name] || e.table_name, e.label || '',
      d.lines.map(l => (l.text != null ? `${l.label}: ${l.text}` : `${l.label}: ${l.from} -> ${l.to}`)).join('; ')];
  }));
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
