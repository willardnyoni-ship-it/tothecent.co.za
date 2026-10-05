// Run with:  node src/lib/vehicles.test.mjs
import assert from 'node:assert/strict';
import { vehicleFinancials, lotSummary, vehicleTitle, costsFor, paintColour } from './vehicles.js';

const polo = { id: 'v1', make: 'VW', model: 'Polo 1.4', year: 2018, status: 'in_stock', purchase_price: 120000, purchase_date: '2026-09-20', asking_price: 149000 };
const exp = [
  { id: 'e1', vehicle_id: 'v1', amount: 3500, status: 'approved' },
  { id: 'e2', vehicle_id: 'v1', amount: 1200.5, status: 'approved' },
  { id: 'e3', vehicle_id: 'v1', amount: 999, status: 'rejected' },
  { id: 'e4', vehicle_id: 'v2', amount: 7777, status: 'approved' },
  { id: 'e5', vehicle_id: null, amount: 50, status: 'approved' },
];
assert.equal(vehicleTitle(polo), '2018 VW Polo 1.4'); assert.equal(vehicleTitle({ make: 'Toyota' }), 'Toyota'); assert.equal(vehicleTitle({}), 'Vehicle');
assert.equal(costsFor(polo, exp).length, 2, 'rejected and other cars are left out');

const f = vehicleFinancials(polo, exp, '2026-10-05');
assert.equal(f.costs, 4700.5); assert.equal(f.totalIn, 124700.5); assert.equal(f.profit, null);
assert.equal(f.expected, 24299.5); assert.equal(f.underwater, false); assert.equal(f.daysIn, 15);

// priced below what it has cost
assert.equal(vehicleFinancials({ ...polo, asking_price: 100000 }, exp, '2026-10-05').underwater, true);
// no asking price yet
assert.equal(vehicleFinancials({ ...polo, asking_price: null }, exp, '2026-10-05').expected, null);

// sold: profit is the sale less everything that went in; days stop at the sale date
const sold = { ...polo, status: 'sold', sold_price: 145000, sold_date: '2026-10-02' };
const s = vehicleFinancials(sold, exp, '2026-10-30');
assert.equal(s.profit, 20299.5); assert.equal(s.daysIn, 12); assert.equal(s.expected, null);
// a loss shows as negative
assert.equal(vehicleFinancials({ ...sold, sold_price: 110000 }, exp, '2026-10-30').profit, -14700.5);

// the lot
const other = { id: 'v2', make: 'Toyota', model: 'Hilux', year: 2020, status: 'reserved', purchase_price: 300000, purchase_date: '2026-10-01', asking_price: 349000 };
const old = { id: 'v3', make: 'Ford', model: 'Figo', status: 'sold', purchase_price: 80000, purchase_date: '2026-08-01', sold_price: 95000, sold_date: '2026-09-10' };
const sum = lotSummary([polo, other, sold, old], exp, '2026-10-05');
assert.equal(sum.inStock, 1); assert.equal(sum.reserved, 1); assert.equal(sum.soldThisMonth, 1); assert.equal(sum.profitThisMonth, 20299.5, 'only this month, last month excluded');
assert.equal(sum.tiedUp, 124700.5 + 307777); assert.equal(sum.avgDays, Math.round((15 + 4) / 2));
assert.deepEqual(lotSummary([], [], '2026-10-05'), { inStock: 0, reserved: 0, tiedUp: 0, soldThisMonth: 0, profitThisMonth: 0, avgDays: 0 });
assert.equal(paintColour('Pearl White'), '#F3F4F6'); assert.equal(paintColour('dark blue'), '#8FB4E3'); assert.equal(paintColour(''), null); assert.equal(paintColour('Chameleon'), null);
console.log('vehicles: all checks passed');
