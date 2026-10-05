// Run with:  node src/lib/clients.test.mjs
import assert from 'node:assert/strict';
import { overviewFor, attention, roleLabel } from './clients.js';

const biz = { id: 'b1', name: 'Mokoena Plumbing', business_profile: 'trades' };
const rows = {
  invoices: [
    { id: 'i1', business_id: 'b1', status: 'sent', total: 1000, paid_amount: 200, due_date: '2026-09-01', created_at: '2026-08-20T08:00:00Z' },
    { id: 'i2', business_id: 'b1', status: 'paid', total: 500, paid_amount: 500, due_date: '2026-09-01', created_at: '2026-08-21T08:00:00Z' },
    { id: 'i3', business_id: 'b1', status: 'draft', total: 700, due_date: '2026-09-01', created_at: '2026-08-22T08:00:00Z' },
    { id: 'i4', business_id: 'b1', status: 'sent', total: 100, currency: 'USD', exchange_rate: 18, paid_amount: 0, due_date: '2026-12-01', created_at: '2026-09-02T08:00:00Z' },
    { id: 'i5', business_id: 'OTHER', status: 'sent', total: 9999, paid_amount: 0, due_date: '2026-01-01' },
  ],
  transactions: [
    { business_id: 'b1', status: 'needs_review', created_at: '2026-09-05T08:00:00Z' }, { business_id: 'b1', status: 'reviewed' }, { business_id: 'OTHER', status: 'needs_review' },
  ],
  expenses: [
    { business_id: 'b1', status: 'needs_review', receipt_storage_path: null }, { business_id: 'b1', status: 'approved', receipt_storage_path: 'x.jpg' },
    { business_id: 'b1', status: 'rejected', receipt_storage_path: null }, { business_id: 'b1', status: 'pending_approval', receipt_storage_path: 'y.jpg' },
  ],
};
const o = overviewFor(biz, 'accountant', rows, '2026-10-05');
assert.equal(o.outstanding, 800 + 1800, 'open invoices only, foreign at its rate');
assert.equal(o.overdue_count, 1, 'only the rand one is past due');
assert.equal(o.review_count, 1 + 2, 'one bank line and two expenses');
assert.equal(o.no_receipt_count, 1, 'rejected ones do not count');
assert.equal(o.last_activity, '2026-09-05T08:00:00Z'); assert.equal(o.role, 'accountant'); assert.equal(o.profile, 'trades');
// other clients' rows never leak in
assert.equal(overviewFor({ id: 'OTHER', name: 'X' }, 'owner', rows, '2026-10-05').outstanding, 9999);
// empty business
assert.deepEqual(overviewFor({ id: 'z', name: 'Z' }, 'owner', {}, '2026-10-05'), { business_id: 'z', name: 'Z', profile: null, role: 'owner', outstanding: 0, overdue_count: 0, review_count: 0, no_receipt_count: 0, last_activity: null });
assert.equal(attention(o), 1 * 3 + 3 + 1);
assert.equal(roleLabel('accountant'), 'Accountant'); assert.equal(roleLabel('employee'), 'Staff'); assert.equal(roleLabel('x'), 'X'); assert.equal(roleLabel(null), '');
console.log('clients: all checks passed');
