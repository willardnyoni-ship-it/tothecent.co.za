// Budget cycle (pay-day-to-pay-day month) math. Ported unchanged from app.html.
export function cycleAt(cycleDay, off) {
  const cd = cycleDay || 1, d = new Date();
  let s = new Date(d.getFullYear(), d.getMonth(), cd);
  if (d.getDate() < cd) s = new Date(d.getFullYear(), d.getMonth() - 1, cd);
  s = new Date(s.getFullYear(), s.getMonth() + off, cd);
  const e = new Date(s.getFullYear(), s.getMonth() + 1, cd);
  e.setDate(e.getDate() - 1);
  return { s, e };
}

export const inCycle = (t, c) => {
  const d = new Date(t.d + 'T12:00:00');
  return d >= c.s && d <= new Date(c.e.getFullYear(), c.e.getMonth(), c.e.getDate(), 23, 59);
};

export function oldestOffset(tx, cycleDay) {
  if (!tx.length) return 0;
  const oldest = tx.map(t => t.d).sort()[0];
  for (let o = 0; o > -60; o--) {
    if (cycleAt(cycleDay, o).s <= new Date(oldest + 'T12:00:00')) return o;
  }
  return -60;
}

export function weeksIn(c) { return Math.max(1, Math.ceil(((c.e - c.s) / 86400000 + 1) / 7)); }
export function weekWindow(c, idx) {
  const s = new Date(c.s); s.setDate(s.getDate() + idx * 7);
  const e = new Date(s); e.setDate(e.getDate() + 6);
  if (e > c.e) e.setTime(c.e.getTime());
  return { s, e };
}
export function currentWeekIdx(c) {
  const now = new Date();
  if (now < c.s) return 0;
  return Math.min(weeksIn(c) - 1, Math.floor((now - c.s) / 86400000 / 7));
}

export function dailyAllowance(c, budTot, spent, fixedRem) {
  const msDay = 86400000, now = new Date();
  const totalDays = Math.round((c.e - c.s) / msDay) + 1;
  const dayN = Math.min(Math.max(1, Math.floor((now - c.s) / msDay) + 1), totalDays);
  const daysLeft = Math.max(1, totalDays - dayN + 1);
  const flex = budTot - fixedRem;
  const perDayFlat = flex / totalDays;
  const left = budTot - spent - fixedRem;
  return { totalDays, dayN, daysLeft, perDayFlat, perDayNow: left / daysLeft, left, ahead: perDayFlat * dayN - spent };
}
