// A working estimate of provisional tax for a freelancer or sole trader.
// Estimates only: it uses the tax tables in saTax.js, the primary rebate and
// no other deductions or credits (medical, retirement, home office...).
// Companies are taxed at a flat 27% of profit.

import { annualTax } from './saTax.js';

export const COMPANY_RATE = 0.27;
const r2 = n => Math.round(n * 100) / 100;
const DAY = 86400000;
const t = s => new Date(s + 'T12:00:00Z').getTime();
const lastDayOfFeb = year => new Date(Date.UTC(year, 2, 0)).toISOString().slice(0, 10);

// The tax year that today falls in (1 March to the end of February), with the
// two provisional payment dates: 31 August, and the last day of February.
export function taxYearOf(today) {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const start = m >= 3 ? y : y - 1;
  return { startYear: start, from: `${start}-03-01`, to: lastDayOfFeb(start + 1), firstDue: `${start}-08-31`, secondDue: lastDayOfFeb(start + 1) };
}

// Profit so far, stretched to a full year. Before a month has passed it is
// treated as one month, so a single early invoice does not swing the guess.
export function projectProfit(ytd, today) {
  const ty = taxYearOf(today);
  const elapsed = Math.max(30, Math.round((t(today) - t(ty.from)) / DAY) + 1);
  const yearDays = Math.round((t(ty.to) - t(ty.from)) / DAY) + 1;
  return ytd > 0 ? r2((ytd * yearDays) / elapsed) : 0;
}

export function taxOnProfit(profit, { company = false } = {}) {
  if (!(profit > 0)) return 0;
  return r2(company ? profit * COMPANY_RATE : annualTax(profit));
}

const monthsBetween = (a, b) => Math.max(1, (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)) + (+b.slice(8, 10) >= +a.slice(8, 10) ? 1 : 0));

// ytd: profit so far this tax year. expected: what the owner expects for the
// whole year (blank = project from the profit so far). paid: provisional tax
// already paid this tax year.
export function provisionalPlan({ ytd, expected, paid, company, today }) {
  const ty = taxYearOf(today);
  const projected = projectProfit(ytd, today);
  const profit = expected != null && expected !== '' && +expected >= 0 ? +expected : projected;
  const tax = taxOnProfit(profit, { company });
  const paidSoFar = Math.max(0, +paid || 0);
  const beforeFirst = today <= ty.firstDue;
  // 1st payment covers half the year's tax; the 2nd brings the total to the whole of it
  const dueDate = beforeFirst ? ty.firstDue : ty.secondDue;
  const target = beforeFirst ? r2(tax / 2) : tax;
  const dueAmount = Math.max(0, r2(target - paidSoFar));
  const monthsLeft = monthsBetween(today, dueDate);
  const yearDays = Math.round((t(ty.to) - t(ty.from)) / DAY) + 1;
  const elapsed = Math.min(yearDays, Math.max(0, Math.round((t(today) - t(ty.from)) / DAY) + 1));
  return {
    ty, projected, profit, usedExpected: profit !== projected, tax, paid: paidSoFar,
    dueDate, dueWhich: beforeFirst ? 'first' : 'second', dueAmount,
    perMonth: dueAmount > 0 ? r2(dueAmount / monthsLeft) : 0, monthsLeft,
    // what a year's tax says should be sitting in savings by today, less what has gone to SARS already
    shouldHaveSaved: Math.max(0, r2((tax * elapsed) / yearDays - paidSoFar)),
    company: !!company,
  };
}
