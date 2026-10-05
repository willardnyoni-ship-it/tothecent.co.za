// Run with:  node src/lib/monthEnd.test.mjs
import assert from 'node:assert/strict';
import { monthBounds, shiftMonth, monthKey, monthEndReport, monthEndCsv } from './monthEnd.js';

assert.deepEqual(monthBounds('2026-02'), { from: '2026-02-01', to: '2026-02-28' }); assert.equal(monthBounds('2028-02').to, '2028-02-29'); assert.equal(monthBounds('2026-12').to, '2026-12-31');
assert.equal(shiftMonth('2026-01', -1), '2025-12'); assert.equal(shiftMonth('2026-11', 2), '2027-01'); assert.equal(monthKey('2026-10-05'), '2026-10');

const customers = [{ id: 'c1', name: 'Karabo Media' }];
const transactions = [
  { id: 't1', date: '2026-09-03', kind: 'income', amount: 5000, status: 'needs_review', category: null, source: 'statement', description: 'Karabo Media payment' },
  { id: 't2', date: '2026-09-10', kind: 'expense', amount: 800, status: 'reviewed', category: 'Fuel', source: 'statement', description: 'Engen' },
  { id: 't3', date: '2026-09-12', kind: 'transfer', amount: 100, status: 'reviewed', category: null, source: 'statement', description: 'Own account' },
  { id: 't4', date: '2026-08-30', kind: 'expense', amount: 999, status: 'needs_review', category: null, source: 'statement' },   // another month
];
const expenses = [
  { id: 'e1', date: '2026-09-05', amount: 200, status: 'needs_review', receipt_storage_path: null, vat: 0, description: 'Stationery' },
  { id: 'e2', date: '2026-09-06', amount: 300, status: 'approved', receipt_storage_path: 'x.jpg', vat: 0, description: 'Printing' },
  { id: 'e3', date: '2026-09-07', amount: 800, status: 'approved', receipt_storage_path: 'y.jpg', vat: 104, matched_transaction_id: 't2', description: 'Engen slip' },
  { id: 'e4', date: '2026-09-08', amount: 50, status: 'rejected', receipt_storage_path: null },
];
const invoices = [
  { id: 'i1', invoice_number: 'INV-1', customer_id: 'c1', issue_date: '2026-09-01', due_date: '2026-09-15', status: 'sent', total: 5000, paid_amount: 0 },
  { id: 'i2', invoice_number: 'INV-2', customer_id: 'c1', issue_date: '2026-09-20', due_date: '2026-10-20', status: 'draft', total: 700 },
  { id: 'i3', invoice_number: 'INV-3', customer_id: 'c1', issue_date: '2026-09-02', due_date: '2026-09-30', status: 'paid', total: 1000, paid_amount: 1000 },
  { id: 'i4', invoice_number: 'INV-4', customer_id: 'c1', issue_date: '2026-09-04', due_date: '2026-12-01', status: 'sent', total: 100, currency: 'USD', exchange_rate: 18, paid_amount: 0 },
];
const base = { month: '2026-09', today: '2026-10-06', features: ['vat'], transactions, expenses, invoices, customers };
const r = monthEndReport(base);
const by = k => r.checks.find(c => c.key === k);

assert.equal(r.complete, true);
assert.equal(r.numbers.income, 5000); assert.equal(r.numbers.spent, 800 + 200 + 300, 'bank line + unmatched expense records; the matched slip and rejected one are not added again');
assert.equal(r.numbers.net, 5000 - 1300); assert.equal(r.numbers.invoiced, 5000 + 1000 + 1800, 'drafts are not invoiced; foreign at its rate');
assert.equal(r.numbers.owed, 5000 + 1800, 'open at month end');
assert.equal(by('review_bank').count, 1); assert.equal(by('review_bank').status, 'todo');
assert.equal(by('review_expenses').count, 1);
assert.equal(by('uncategorised').count, 1, 'transfers and other months are left out');
assert.equal(by('receipts').count, 1, 'rejected expenses do not count');
assert.equal(by('vat_details').count, 1, 'receipt attached but VAT missing: e2');
assert.equal(by('overdue').count, 1, 'INV-1 was past due on 30 Sept; the dollar one was not'); assert.equal(by('overdue').items[0].amount, 5000);
assert.equal(by('drafts').count, 1);
assert.equal(by('matches').count, 1, 'the R5 000 payment looks like INV-1');
assert.equal(by('coverage').status, 'warn', 'statement stops on the 12th'); assert.equal(r.ready, false); assert.equal(r.todo, 2);

// a fully clean month is ready
const clean = monthEndReport({ month: '2026-09', today: '2026-10-06', features: [], transactions: [{ date: '2026-09-30', kind: 'income', amount: 10, status: 'reviewed', category: 'Sales', source: 'statement' }], expenses: [], invoices: [], customers: [] });
assert.equal(clean.ready, true); assert.equal(clean.todo, 0); assert.equal(clean.checks.find(c => c.key === 'coverage').status, 'ok');

// the current month is not complete: no coverage check, overdue is measured today
const cur = monthEndReport({ ...base, month: '2026-10', today: '2026-10-06' });
assert.equal(cur.complete, false); assert.ok(!cur.checks.some(c => c.key === 'coverage' || c.key === 'payroll'));
assert.equal(cur.checks.find(c => c.key === 'overdue').label, 'Invoices overdue now');

// payroll
const pay = { ...base, features: ['payroll'], employees: [{ id: 'e' }] };
assert.equal(monthEndReport({ ...pay, payRuns: [] }).checks.find(c => c.key === 'payroll').status, 'todo');
assert.equal(monthEndReport({ ...pay, payRuns: [{ period: '2026-09' }] }).checks.find(c => c.key === 'payroll').status, 'ok');
assert.equal(monthEndReport({ ...base, features: ['payroll'] }).checks.some(c => c.key === 'payroll'), false, 'no employees, no payroll check');

// nothing in the month at all
const empty = monthEndReport({ month: '2026-09', today: '2026-10-06' });
assert.equal(empty.ready, true); assert.equal(empty.numbers.net, 0);

// csv
const csv = monthEndCsv(r, 'Karabo & Co', { reviewed_by_email: 'a@b.co', reviewed_at: '2026-10-07T08:00:00Z' }).replace('﻿', '');
assert.ok(csv.startsWith('"Month-end check","Karabo & Co"')); assert.ok(csv.includes('Reviewed by a@b.co on 2026-10-07')); assert.ok(csv.includes('"Bank lines still to review","To fix","1"'));
console.log('monthEnd: all checks passed');
