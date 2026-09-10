import { R } from './format.js';
import { cycleAt, inCycle } from './cycle.js';

export function netSaved(flows) {
  const f = flows || [];
  return f.filter(x => x.dir === 'out').reduce((a, x) => a + x.a, 0) - f.filter(x => x.dir === 'in').reduce((a, x) => a + x.a, 0);
}

export function closedCycleUnderBudget(tx, cats, cycleDay) {
  const budTot = cats.reduce((a, c) => a + c.t, 0);
  if (!budTot) return null;
  for (let o = -1; o > -13; o--) {
    const c = cycleAt(cycleDay, o);
    const cTx = tx.filter(t => !t.mt && inCycle(t, c));
    if (!cTx.length) continue;
    const sp = cTx.reduce((a, t) => a + t.a, 0);
    if (sp < budTot) return budTot - sp;
  }
  return null;
}

export function unallocated(income, cats) { return (income || 0) - cats.reduce((a, c) => a + c.t, 0); }

// Milestones, checked once per state change. `test`/`body` take the whole
// state object so they can be evaluated without a global `S`.
export const MILESTONES = [
  { id: 'first-import', test: S => S.tx.length > 0,
    title: 'First statement imported', body: () => 'You can now see where the money actually went.' },
  { id: 'all-categorised', test: S => S.tx.length > 20 && !S.tx.some(t => !t.mt && t.c === 'Uncategorised'),
    title: 'Everything categorised', body: () => 'Every transaction has a home. Your numbers can be trusted now.' },
  { id: 'first-slip', test: S => S.tx.some(t => t.src === 'slip'),
    title: 'First slip captured', body: () => 'Catching spend as it happens is what makes the month-end reconcile.' },
  { id: 'under-budget', test: S => closedCycleUnderBudget(S.tx, S.cats, S.cycleDay) !== null,
    title: 'First month under budget', body: S => 'You came in under by ' + R(closedCycleUnderBudget(S.tx, S.cats, S.cycleDay)) + '. That is the whole game.' },
  { id: 'saved-1000', test: S => netSaved(S.flows) >= 1000,
    title: 'First R1 000 saved', body: S => 'Net ' + R(netSaved(S.flows)) + ' put away and kept there.' },
  { id: 'saved-10000', test: S => netSaved(S.flows) >= 10000,
    title: 'R10 000 saved', body: S => 'Net ' + R(netSaved(S.flows)) + '. That is a real emergency buffer.' },
  { id: 'zero-based', test: S => S.method === 'zero' && Math.abs(unallocated(S.income, S.cats)) < 1 && S.income > 0,
    title: 'Every rand allocated', body: () => 'Zero-based budget balanced. Nothing is drifting.' },
];

// Returns the first newly-earned milestone, or null. Caller is responsible
// for recording S.achievements and celebrating.
export function checkMilestones(S) {
  const done = new Set(S.achievements || []);
  for (const m of MILESTONES) {
    if (done.has(m.id)) continue;
    let ok = false; try { ok = m.test(S); } catch (e) { /* ignore */ }
    if (!ok) continue;
    return { id: m.id, title: m.title, body: m.body(S) };
  }
  return null;
}
