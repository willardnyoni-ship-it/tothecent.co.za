// The month-end check for one business: the month's numbers, and what still needs
// doing before an accountant can sign the month off.
import { findInvoiceMatches } from './businessMath.js';
import { zar } from './currency.js';

const r2 = n => Math.round(n * 100) / 100;
const pad = n => String(n).padStart(2, '0');

export const monthKey = d => String(d).slice(0, 7);
export function monthBounds(m) {
  const [y, mo] = m.split('-').map(Number);
  return { from: `${m}-01`, to: `${m}-${pad(new Date(Date.UTC(y, mo, 0)).getUTCDate())}` };
}
export function shiftMonth(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export const monthLabel = m => new Date(m + '-01T12:00:00').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

const OPEN = s => !['paid', 'cancelled', 'draft'].includes(s);
const LIMIT = 40;

// today: 'YYYY-MM-DD' (South African date)
export function monthEndReport({ month, today, features = [], transactions = [], expenses = [], invoices = [], customers = [], employees = [], payRuns = [] }) {
  const { from, to } = monthBounds(month);
  const complete = today > to;
  const asOf = complete ? to : today;
  const inM = d => d && d >= from && d <= to;

  const tx = transactions.filter(t => inM(t.date));
  const ex = expenses.filter(e => inM(e.date) && e.status !== 'rejected');

  // same union as the Home dashboard: bank lines plus expense records not already folded into one
  const income = r2(tx.filter(t => t.kind === 'income').reduce((a, t) => a + +t.amount, 0));
  const spent = r2(tx.filter(t => t.kind === 'expense').reduce((a, t) => a + +t.amount, 0) + ex.filter(e => !e.matched_transaction_id).reduce((a, e) => a + +e.amount, 0));
  const issued = invoices.filter(i => inM(i.issue_date) && !['draft', 'cancelled'].includes(i.status));
  const invoiced = r2(issued.reduce((a, i) => a + zar(i, +i.total), 0));
  const openAtEnd = invoices.filter(i => OPEN(i.status) && i.issue_date && i.issue_date <= asOf);
  const owed = r2(openAtEnd.reduce((a, i) => a + zar(i, +i.total - +(i.paid_amount || 0)), 0));

  const nameOf = id => (customers.find(c => c.id === id) || {}).name || '';
  const txItem = t => ({ date: t.date, text: t.description || '(no description)', amount: +t.amount });
  const exItem = e => ({ date: e.date, text: e.description || e.merchant || '(no description)', amount: +e.amount });
  const check = (key, label, status, items, extra = {}) => ({ key, label, status: items.length || extra.force ? status : 'ok', count: items.length, items: items.slice(0, LIMIT), ...extra });
  const checks = [];

  checks.push(check('review_bank', 'Bank lines still to review', 'todo', tx.filter(t => t.status === 'needs_review').map(txItem), { go: 'money', hint: 'Open Money and mark each line reviewed.' }));
  checks.push(check('review_expenses', 'Expenses waiting for approval', 'todo', ex.filter(e => e.status === 'needs_review' || e.status === 'pending_approval').map(exItem), { go: 'expenses', hint: 'Approve or reject them under Expenses.' }));
  checks.push(check('uncategorised', 'Bank lines with no category', 'warn', tx.filter(t => t.kind !== 'transfer' && !t.category).map(txItem), { go: 'money', hint: 'Tap a line in Money to set its category.' }));
  checks.push(check('receipts', 'Expenses with no receipt', 'warn', ex.filter(e => !e.receipt_storage_path).map(exItem), { go: 'expenses', hint: 'Ask for the slip, or attach it under Expenses.' }));
  if (features.includes('vat')) {
    checks.push(check('vat_details', 'Receipts with no VAT amount', 'warn', ex.filter(e => e.receipt_storage_path && !e.vat).map(exItem), { go: 'expenses', hint: 'Add the VAT from the slip so it can be claimed.' }));
  }
  const matches = findInvoiceMatches(invoices.map(i => ({ ...i, customerName: nameOf(i.customer_id) })), transactions);
  checks.push(check('matches', 'Payments that look like invoice payments, not yet matched', 'warn',
    matches.map(m => ({ date: m.transaction.date, text: `${m.invoice.invoice_number} · ${m.transaction.description || ''}`.trim(), amount: +m.transaction.amount })), { go: 'invoices', hint: 'Confirm the match under Invoices.' }));
  checks.push(check('overdue', complete ? 'Invoices overdue at month end' : 'Invoices overdue now', 'warn',
    openAtEnd.filter(i => i.due_date && i.due_date < asOf).map(i => ({ date: i.due_date, text: `${i.invoice_number} · ${nameOf(i.customer_id)}`.trim(), amount: zar(i, +i.total - +(i.paid_amount || 0)) })), { go: 'invoices', hint: 'Follow up with the customer.' }));
  checks.push(check('drafts', 'Draft invoices from this month, never sent', 'warn',
    invoices.filter(i => i.status === 'draft' && inM(i.issue_date)).map(i => ({ date: i.issue_date, text: `${i.invoice_number} · ${nameOf(i.customer_id)}`.trim(), amount: zar(i, +i.total) })), { go: 'invoices', hint: 'Send them or delete them.' }));

  if (complete) {
    const stmt = transactions.filter(t => t.source === 'statement' && inM(t.date)).map(t => t.date).sort();
    const active = tx.length + ex.length + issued.length > 0;
    if (!stmt.length && active) {
      checks.push({ key: 'coverage', label: 'No bank statement for this month', status: 'warn', count: 1, items: [], go: 'money', hint: 'Upload the month\'s statement under Money, unless this business does not bank this way.' });
    } else if (stmt.length && stmt[stmt.length - 1] < `${to.slice(0, 8)}${pad(Math.max(1, +to.slice(8) - 7))}`) {
      checks.push({ key: 'coverage', label: `Bank statement may stop early (last line ${stmt[stmt.length - 1]})`, status: 'warn', count: 1, items: [], go: 'money', hint: 'Check the statement covers the whole month.' });
    } else checks.push({ key: 'coverage', label: 'Bank statement covers the month', status: 'ok', count: 0, items: [] });
  }
  if (features.includes('payroll') && employees.length && complete) {
    const ran = payRuns.some(r => r.period === month);
    checks.push({ key: 'payroll', label: ran ? 'Payslips run for the month' : 'Payslips not run for this month', status: ran ? 'ok' : 'todo', count: ran ? 0 : employees.length, items: [], go: 'team', hint: 'Run payroll under Team.' });
  }

  const todo = checks.filter(c => c.status === 'todo').length;
  const warn = checks.filter(c => c.status === 'warn').length;
  return { month, from, to, complete, numbers: { income, spent, net: r2(income - spent), invoiced, owed }, checks, todo, warn, ready: todo === 0 };
}

const csvCell = v => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t) && isNaN(Number(t))) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
export function monthEndCsv(report, businessName, review) {
  const n = report.numbers;
  const rows = [
    ['Month-end check', businessName, monthLabel(report.month)],
    ['Status', report.ready ? 'Ready for review' : `${report.todo} to fix first`, review ? `Reviewed by ${review.reviewed_by_email} on ${String(review.reviewed_at).slice(0, 10)}` : 'Not yet reviewed'],
    [],
    ['Income', n.income], ['Expenses', n.spent], ['Net profit', n.net], ['Invoiced (rand)', n.invoiced], ['Owed by customers (rand)', n.owed],
    [],
    ['Check', 'Result', 'Count'],
    ...report.checks.map(c => [c.label, c.status === 'ok' ? 'OK' : c.status === 'todo' ? 'To fix' : 'Look at', c.count]),
    [],
    ['Check', 'Date', 'Item', 'Amount'],
    ...report.checks.flatMap(c => c.items.map(i => [c.label, i.date, i.text, i.amount])),
  ];
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
