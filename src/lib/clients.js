// The numbers an accountant scans across clients. The database function
// my_clients_overview() returns the same figures; this builds them from loaded
// rows (used by the demo, and tested to agree with the SQL's rules).
import { zar } from './currency.js';

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', accountant: 'Accountant', bookkeeper: 'Bookkeeper', employee: 'Staff', viewer: 'View only' };
export const roleLabel = r => ROLE_LABEL[r] || (r ? r[0].toUpperCase() + r.slice(1) : '');

const OPEN = s => !['paid', 'cancelled', 'draft'].includes(s);

export function overviewFor(business, role, { invoices = [], transactions = [], expenses = [] }, today) {
  const inv = invoices.filter(i => i.business_id === business.id);
  const open = inv.filter(i => OPEN(i.status));
  const tx = transactions.filter(t => t.business_id === business.id);
  const ex = expenses.filter(e => e.business_id === business.id);
  const stamps = [...inv, ...tx, ...ex].map(r => r.created_at).filter(Boolean).sort();
  return {
    business_id: business.id, name: business.name, profile: business.business_profile || null, role,
    outstanding: Math.round(open.reduce((a, i) => a + zar(i, +i.total - +(i.paid_amount || 0)), 0) * 100) / 100,
    overdue_count: open.filter(i => i.due_date && i.due_date < today).length,
    review_count: tx.filter(t => t.status === 'needs_review').length + ex.filter(e => e.status === 'needs_review' || e.status === 'pending_approval').length,
    no_receipt_count: ex.filter(e => e.status !== 'rejected' && !e.receipt_storage_path).length,
    last_activity: stamps.length ? stamps[stamps.length - 1] : null,
  };
}

// "needs attention" score for sorting: overdue invoices and unreviewed items first
export const attention = c => c.overdue_count * 3 + c.review_count + c.no_receipt_count;
