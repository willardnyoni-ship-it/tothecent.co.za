import { merchantOf } from './categorize.js';

// A charge counts as recurring if the same merchant appears in 2+ different
// months at a stable amount. Ported unchanged from app.html.
export function recurring(tx) {
  const g = {};
  for (const t of tx) {
    if (t.mt) continue;
    const k = merchantOf(t.note).toLowerCase();
    if (k === '(bank fee)') continue;
    (g[k] = g[k] || []).push(t);
  }
  const out = [];
  for (const list of Object.values(g)) {
    const months = new Set(list.map(t => t.d.slice(0, 7)));
    if (months.size < 2) continue;
    const amts = list.map(t => t.a).sort((a, b) => a - b);
    const med = amts[Math.floor(amts.length / 2)];
    const tol = Math.max(3, med * 0.12);
    const stable = amts.filter(a => Math.abs(a - med) <= tol).length;
    if (stable < Math.max(2, Math.ceil(list.length * 0.6))) continue;
    const days = list.map(t => +t.d.slice(8, 10)).sort((a, b) => a - b);
    out.push({
      name: merchantOf(list[0].note), amount: med,
      day: days[Math.floor(days.length / 2)], months: months.size,
      count: list.length, cat: list[0].c, key: merchantOf(list[0].note).toLowerCase(),
    });
  }
  return out.sort((a, b) => b.amount * b.months - a.amount * a.months);
}

// Recurring charges that have not yet landed in the cycle being shown.
export function dueThisCycle(tx, txInCycle, cycleOffset) {
  const seen = new Set(txInCycle.map(t => merchantOf(t.note).toLowerCase()));
  const isCurrent = cycleOffset === 0;
  return recurring(tx).filter(r => {
    if (seen.has(r.key)) return false;
    if (!isCurrent) return false;
    return true;
  });
}
