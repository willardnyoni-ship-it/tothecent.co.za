// Run with:  node src/lib/provisionalTax.test.mjs
import assert from 'node:assert/strict';
import { taxYearOf, projectProfit, taxOnProfit, provisionalPlan } from './provisionalTax.js';

// tax years
assert.deepEqual(taxYearOf('2026-10-06'), { startYear: 2026, from: '2026-03-01', to: '2027-02-28', firstDue: '2026-08-31', secondDue: '2027-02-28' });
assert.equal(taxYearOf('2027-02-10').startYear, 2026, 'January and February belong to the year that started the March before');
assert.equal(taxYearOf('2027-03-01').startYear, 2027);
assert.equal(taxYearOf('2027-10-01').secondDue, '2028-02-29', 'leap year');

// tax tables (2025/26): R400 000 -> 77 362 + 31% of the part above 370 500, less the 17 235 rebate
assert.equal(taxOnProfit(400000), 77362 + (400000 - 370500) * 0.31 - 17235);
assert.equal(taxOnProfit(95000), 0, 'under the threshold nothing is due');
assert.equal(taxOnProfit(-500), 0); assert.equal(taxOnProfit(0), 0);
assert.equal(taxOnProfit(1000000, { company: true }), 270000);

// projecting: 215 days (1 Mar to 1 Oct inclusive) of a 365-day year, R200 000 so far
const proj = projectProfit(200000, '2026-10-01');
assert.equal(proj, Math.round((200000 * 365 / 215) * 100) / 100);
assert.equal(projectProfit(10000, '2026-03-05'), Math.round((10000 * 365 / 30) * 100) / 100, 'first days are treated as 30');
assert.equal(projectProfit(-5000, '2026-10-01'), 0);

// plan in October: the next payment is the second one, for the whole year's tax less what is paid
const plan = provisionalPlan({ ytd: 200000, expected: '', paid: 0, today: '2026-10-01' });
assert.equal(plan.dueWhich, 'second'); assert.equal(plan.dueDate, '2027-02-28');
assert.equal(plan.profit, plan.projected); assert.equal(plan.usedExpected, false);
assert.equal(plan.dueAmount, plan.tax);
assert.equal(plan.monthsLeft, 5, 'Oct, Nov, Dec, Jan, Feb');
assert.ok(Math.abs(plan.perMonth * 5 - plan.dueAmount) < 0.03);
const paid = provisionalPlan({ ytd: 200000, expected: '', paid: 20000, today: '2026-10-01' });
assert.equal(paid.dueAmount, plan.tax - 20000); assert.equal(paid.paid, 20000);
assert.equal(provisionalPlan({ ytd: 200000, expected: '', paid: 999999, today: '2026-10-01' }).dueAmount, 0, 'overpaid owes nothing');

// the owner's own figure wins
const own = provisionalPlan({ ytd: 200000, expected: 300000, paid: 0, today: '2026-10-01' });
assert.equal(own.profit, 300000); assert.equal(own.usedExpected, true); assert.equal(own.tax, taxOnProfit(300000));

// before 31 August the first payment is half the year's tax
const early = provisionalPlan({ ytd: 80000, expected: 400000, paid: 0, today: '2026-06-15' });
assert.equal(early.dueWhich, 'first'); assert.equal(early.dueDate, '2026-08-31'); assert.equal(early.dueAmount, Math.round(early.tax / 2 * 100) / 100);
// on the day itself it is still the first
assert.equal(provisionalPlan({ ytd: 1, expected: 400000, paid: 0, today: '2026-08-31' }).dueWhich, 'first');
assert.equal(provisionalPlan({ ytd: 1, expected: 400000, paid: 0, today: '2026-09-01' }).dueWhich, 'second');

// companies pay a flat rate
assert.equal(provisionalPlan({ ytd: 100000, expected: 1000000, paid: 0, company: true, today: '2026-10-01' }).tax, 270000);
// nothing earned: nothing to put aside
const none = provisionalPlan({ ytd: 0, expected: '', paid: 0, today: '2026-10-01' });
assert.equal(none.tax, 0); assert.equal(none.dueAmount, 0); assert.equal(none.perMonth, 0);
console.log('provisionalTax: all checks passed');
