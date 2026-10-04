// Run with:  node --experimental-strip-types supabase/functions/yoco/yocoOrders.test.mjs
import assert from 'node:assert/strict';
import { nameKey, orderLines, mapRefunds } from './yocoOrders.ts';
import { usageFor as usageTs } from './stockUsage.ts';
import { usageFor as usageJs } from '../../../src/lib/recipeMath.js';

assert.equal(nameKey(' Flat-White  '), 'flat white'); assert.equal(nameKey('Fish & Chips'), 'fish and chips'); assert.equal(nameKey(''), '');

const order = {
  id: 'o1', status: 'completed', created_at: '2026-10-05T09:00:00Z', closed_at: '2026-10-05T09:05:00Z',
  line_items: [
    { id: 'l1', name: 'Flat white', quantity: '2', item_type: 'product', unit_price: { amount: 3800 }, total_price: { amount: 7600 }, net_amount: { amount: 7600 } },
    { id: 'l2', name: 'Muffin', quantity: '1.5', item_type: 'product', unit_price: { amount: 2500 }, total_price: { amount: 3750 } },
    { id: 'l3', name: 'Custom amount', quantity: '1', item_type: 'custom_amount', unit_price: { amount: 5000 } },
    { id: 'l4', name: 'Gift card', quantity: '1', item_type: 'gift_voucher', unit_price: { amount: 10000 } },
    { id: 'l5', name: '', quantity: '1', item_type: 'product' }, { name: 'No id', quantity: '1', item_type: 'product' }, { id: 'l6', name: 'Zero', quantity: '0', item_type: 'product' },
  ],
};
const ol = orderLines(order);
assert.equal(ol.length, 2, 'only real product lines');
assert.equal(ol[0].qty, 2); assert.equal(ol[0].unit_price, 38); assert.equal(ol[0].revenue, 76); assert.equal(ol[0].name_key, 'flat white');
assert.equal(ol[1].qty, 1.5); assert.equal(ol[1].revenue, 37.5, 'falls back to total_price'); assert.equal(ol[0].sold_at, '2026-10-05T09:05:00Z');
assert.deepEqual(orderLines({}), []); assert.deepEqual(orderLines(null), []);

const rf = mapRefunds({ id: 'p1', receipt_number: 'R9', created_at: '2026-10-05T09:00:00Z', refunds: [{ id: 'rf1', amount: { amount: 1500 }, created_at: '2026-10-06T08:00:00Z' }, { amount: 700 }, { id: 'x', amount: { amount: 0 } }] });
assert.equal(rf.length, 2); assert.equal(rf[0].amount, 15); assert.equal(rf[0].external_id, 'p1:refund:rf1'); assert.equal(rf[1].amount, 7); assert.equal(rf[1].external_id, 'p1:refund:1');
assert.equal(rf[0].kind, 'expense'); assert.deepEqual(mapRefunds({ id: 'p', refunds: [] }), []); assert.deepEqual(mapRefunds(null), []);

// the app and the Edge Function must agree on how a dish uses stock
const items = [{ id: 'beans', cost_price: 245 }, { id: 'milk', cost_price: 34 }, { id: 'cup', cost_price: 1.92 }];
const recs = [{ id: 'r1', yield_portions: 20, selling_price: 38 }];
const rl = [{ recipe_id: 'r1', item_id: 'beans', qty: 0.36 }, { recipe_id: 'r1', item_id: 'milk', qty: 3 }, { recipe_id: 'r1', item_id: 'cup', qty: 20 }];
const sale = [{ recipe_id: 'r1', qty: 4, price: 38 }, { stock_item_id: 'milk', qty: 2, price: 40 }, { recipe_id: 'gone', qty: 1 }];
assert.deepEqual(usageTs(sale, recs, rl, items), usageJs(sale, recs, rl, items), 'Edge Function copy matches the app maths');

console.log('yoco orders / refunds / usage: all checks passed');
