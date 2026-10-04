// Run with:  node src/lib/recipeMath.test.mjs
import assert from 'node:assert/strict';
import { recipeCost, usageFor, roundPrice, markupPrice, priceForMargin, suggestPrice, foodCostTone } from './recipeMath.js';

const items = [
  { id: 'beans', name: 'Coffee beans 1kg', cost_price: 245 },   // per kg bag
  { id: 'milk', name: 'Milk 2L', cost_price: 34 },
  { id: 'cup', name: 'Cups (each)', cost_price: 1.92 },
  { id: 'egg', name: 'Eggs', cost_price: 2.4 },
  { id: 'free', name: 'Unpriced thing', cost_price: 0 },
];
// 20 flat whites from a batch: 0.36 of a bag of beans (360g), 3 x 2L milk, 20 cups
const flat = { id: 'r1', name: 'Flat white', yield_portions: 20, selling_price: 38, extra_cost: 0.5 };
const lines = [
  { recipe_id: 'r1', item_id: 'beans', qty: 0.36 }, { recipe_id: 'r1', item_id: 'milk', qty: 3 }, { recipe_id: 'r1', item_id: 'cup', qty: 20 },
];
const c = recipeCost(flat, lines, items);
assert.equal(c.batch, 88.2 + 102 + 38.4);                           // 228.6
assert.equal(c.costPerPortion, 11.93);                              // 228.6/20 + 0.5
assert.equal(c.margin, 26.07);
assert.equal(c.foodCostPct, 31.4); assert.equal(c.marginPct, 68.6);
assert.equal(foodCostTone(c.foodCostPct), 'good'); assert.equal(foodCostTone(36), 'warn'); assert.equal(foodCostTone(55), 'bad'); assert.equal(foodCostTone(null), 'muted');

// missing / unpriced ingredients are counted, never crash
const odd = recipeCost({ yield_portions: 0, selling_price: 0 }, [{ item_id: 'gone', qty: 2 }, { item_id: 'free', qty: 1 }], items);
assert.equal(odd.missing, 1); assert.equal(odd.unpriced, 1); assert.equal(odd.foodCostPct, null); assert.equal(odd.costPerPortion, 0);

// prices
assert.equal(roundPrice(37.8), 38); assert.equal(roundPrice(37.2), 37); assert.equal(roundPrice(37.3), 37.5);
assert.equal(markupPrice(100, 40), 140); assert.equal(markupPrice(21.5, 40), 30);
assert.equal(priceForMargin(60, 40), 100); assert.equal(priceForMargin(60, 0), 0); assert.equal(priceForMargin(60, 100), 0);
assert.equal(suggestPrice(11.93, 30), 40);                          // 39.77 -> 40

// selling things uses stock
const recs = [flat]; const rl = lines;
const u = usageFor([{ recipe_id: 'r1', qty: 4, price: 38 }, { stock_item_id: 'egg', qty: 12, price: 5 }, { stock_item_id: 'egg', qty: 6, price: 5 }], recs, rl, items);
assert.equal(u.beans.qty, 0.072); assert.equal(u.milk.qty, 0.6); assert.equal(u.cup.qty, 4);   // 4 flat whites
assert.equal(u.egg.qty, 18); assert.equal(u.egg.revenue, 90, 'two egg lines add up');
const rev = u.beans.revenue + u.milk.revenue + u.cup.revenue;
assert.ok(Math.abs(rev - 4 * 38) < 0.05, 'recipe revenue is shared out and adds back to 152, got ' + rev);
assert.deepEqual(usageFor([{ recipe_id: 'nope', qty: 2, price: 5 }, { stock_item_id: 'milk', qty: 0 }, {}], recs, rl, items), {}, 'unknown recipe / zero qty ignored');

console.log('recipeMath: all checks passed');
