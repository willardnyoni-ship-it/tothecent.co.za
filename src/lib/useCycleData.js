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

    // Rollover (opt-in, Budget tab): unused budget in a category carries
    // into the next cycle as extra headroom, on top of its normal target.
    // Only kicks in once there's a prior cycle with real activity - without
    // this guard, a brand-new budget with no history yet would see every
    // category's full target treated as "unused last cycle" and doubled.
    let catTargets = S.cats.map(x => ({ ...x, rollover: 0 }));
    const prev = cycleAt(S.cycleDay, cycleOffset - 1);
    const hasPriorHistory = active.some(t => inCycle(t, prev));
    if (S.budgetRollover && hasPriorHistory) {
      const prevTx = active.filter(t => inCycle(t, prev));
      const prevSpentBy = {};
      prevTx.forEach(t => prevSpentBy[t.c] = (prevSpentBy[t.c] || 0) + t.a);
      catTargets = S.cats.map(x => {
        const rollover = Math.max(0, x.t - (prevSpentBy[x.n] || 0));
        return { ...x, t: x.t + rollover, rollover };
      });
    }
    const budTot = catTargets.reduce((a, x) => a + x.t, 0);
    const pct = budTot ? spent / budTot * 100 : 0;
    const due = dueThisCycle(active, tx, cycleOffset);
    const dueTot = due.reduce((a, r) => a + r.amount, 0);
    return { c, active, tx, spentBy, spent, budTot, pct, due, dueTot, catTargets };
  }, [S.tx, S.cats, S.cycleDay, cycleOffset, S.budgetRollover]);
}
