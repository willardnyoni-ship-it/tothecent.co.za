import { useMemo } from 'react';
import { cycleAt, inCycle } from './cycle.js';
import { dueThisCycle } from './recurring.js';

// The core per-cycle numbers every budget tab needs: which transactions fall
// in the shown cycle, spend per category, totals. Centralised so Home,
// Spending and Budget all agree with each other.
export function useCycleData(S, cycleOffset) {
  return useMemo(() => {
    const c = cycleAt(S.cycleDay, cycleOffset);
    const active = S.tx.filter(t => !t.mt);
    const tx = active.filter(t => inCycle(t, c));
    const spentBy = {};
    tx.forEach(t => spentBy[t.c] = (spentBy[t.c] || 0) + t.a);
    const spent = tx.reduce((a, t) => a + t.a, 0);
    const budTot = S.cats.reduce((a, x) => a + x.t, 0);
    const pct = budTot ? spent / budTot * 100 : 0;
    const due = dueThisCycle(active, tx, cycleOffset);
    const dueTot = due.reduce((a, r) => a + r.amount, 0);
    return { c, active, tx, spentBy, spent, budTot, pct, due, dueTot };
  }, [S.tx, S.cats, S.cycleDay, cycleOffset]);
}
