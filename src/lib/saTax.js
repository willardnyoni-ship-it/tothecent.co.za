// South African payroll, VAT and travel numbers used by the business tools.
// Everything here is an ESTIMATE to help a small business owner - screens
// that use it say so and let the owner override the figure. Update the
// tables below when SARS publishes new ones each February.

export const PAYE_TABLE_LABEL = '2025/26 SARS tables';

// Annual taxable income brackets: [from, baseTax, rate]
const BRACKETS = [
  [0, 0, 0.18],
  [237101, 42678, 0.26],
  [370501, 77362, 0.31],
  [512801, 121475, 0.36],
  [673001, 179147, 0.39],
  [857901, 251258, 0.41],
  [1817001, 644489, 0.45],
];
const PRIMARY_REBATE = 17235;

// UIF: 1% from the employee and 1% from the employer, on earnings up to
// the monthly ceiling.
export const UIF_RATE = 0.01;
export const UIF_MONTHLY_CEILING = 17712;

export function annualTax(taxable) {
  if (taxable <= 0) return 0;
  let b = BRACKETS[0];
  for (const row of BRACKETS) if (taxable >= row[0]) b = row;
  const from = b[0] === 0 ? 0 : b[0] - 1;
  return Math.max(0, b[1] + (taxable - from) * b[2] - PRIMARY_REBATE);
}

// Monthly PAYE for a regular monthly wage: annualise, tax it, divide back.
// Uses the primary rebate only (under 65) and ignores medical credits and
// retirement contributions - good enough to plan with, not to file with.
export function monthlyPaye(gross) {
  return round2(annualTax((+gross || 0) * 12) / 12);
}

export function uif(gross) {
  const each = round2(Math.min(+gross || 0, UIF_MONTHLY_CEILING) * UIF_RATE);
  return { employee: each, employer: each };
}

export function payslipFor(gross, otherDeductions = 0) {
  const g = round2(+gross || 0);
  const paye = monthlyPaye(g);
  const u = uif(g);
  const net = round2(g - paye - u.employee - (+otherDeductions || 0));
  return { gross: g, paye, uif_employee: u.employee, uif_employer: u.employer, other_deductions: +otherDeductions || 0, net };
}

// ---------- VAT ----------
// Category A vendors file every two months, periods ending in even months
// (Jan-Feb, Mar-Apr, ...); Category B periods end in odd months.
export function vatPeriods(year, category = 'A') {
  const out = [];
  const startMonths = category === 'A' ? [0, 2, 4, 6, 8, 10] : [-1, 1, 3, 5, 7, 9, 11];
  for (const m of startMonths) {
    const start = new Date(Date.UTC(year, m, 1));
    const end = new Date(Date.UTC(year, m + 2, 0));
    out.push({
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      label: start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric', timeZone: 'UTC' }) + ' - ' + end.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      // VAT201 is due by the 25th of the month after the period ends
      // (the last business day of that month if filed on eFiling).
      due: new Date(Date.UTC(year, m + 2, 25)).toISOString().slice(0, 10),
    });
  }
  return out;
}

export function currentVatPeriod(category = 'A', today = new Date()) {
  const key = today.toISOString().slice(0, 10);
  const all = [...vatPeriods(today.getUTCFullYear() - 1, category), ...vatPeriods(today.getUTCFullYear(), category), ...vatPeriods(today.getUTCFullYear() + 1, category)];
  return all.find(p => p.from <= key && key <= p.to);
}

// ---------- travel ----------
// SARS simplified per-km rate, used when no logbook-based cost is kept.
// The business can change it in Settings -> Features.
export const DEFAULT_MILEAGE_RATE = 4.76;

function round2(n) { return Math.round(n * 100) / 100; }
