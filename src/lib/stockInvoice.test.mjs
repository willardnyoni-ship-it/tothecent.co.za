// Run with:  node src/lib/stockInvoice.test.mjs
import assert from 'node:assert/strict';
import { tokens, similarity, matchItem, normaliseInvoice, costing, guessPack, unitsDiffer } from './stockInvoice.js';

assert.deepEqual(tokens('COCA COLA 2 L PET (6)'), ['coca', 'cola', '2l', 'pet', '6']);
assert.deepEqual(tokens('Eggs & Bacon'), ['egg', 'and', 'bacon']);

const items = [
  { id: 1, name: 'Coca-Cola 2L' }, { id: 2, name: 'Coca-Cola 500ml' }, { id: 3, name: 'White bread' },
  { id: 4, name: 'Eggs (tray of 30)' }, { id: 5, name: 'Maize meal 5kg' }, { id: 6, name: 'Coffee beans 1kg' },
];
assert.equal(matchItem('COCA COLA 2L PET', items).item.id, 1, 'same product and size');
assert.equal(matchItem('Coca Cola 500 ml', items).item.id, 2, 'different size picks the right one');
assert.equal(matchItem('Coca-Cola 330ml can', items), null, 'a size you don\'t stock is a new item');
assert.equal(matchItem('White Bread loaf', items).item.id, 3);
assert.equal(matchItem('EGGS TRAY 30', items).item.id, 4);
assert.equal(matchItem('Maize Meal 5KG Ace', items).item.id, 5);
assert.equal(matchItem('Sunflower oil 750ml', items), null, 'unrelated item is new');
assert.equal(matchItem('', items), null);
assert.ok(similarity('Coffee beans 1kg', 'Coffee beans 250g') === 0, 'sizes that disagree never match');

// reading / typing an invoice
const inc = normaliseInvoice({ prices_include_vat: true, supplier: ' Makro ', invoice_number: 'M-1', date: '2026-10-02',
  lines: [{ description: 'Cooking oil 750ml', qty: 12, unit_price: 57.5 }, { description: 'Sugar 2.5kg', qty: '6', line_total: 330 }, { description: '', qty: 1 }, { description: 'Zero', qty: 0, unit_price: 5 }] });
assert.equal(inc.supplier, 'Makro'); assert.equal(inc.reference, 'M-1'); assert.equal(inc.date, '2026-10-02'); assert.equal(inc.vatMode, 'incl');
assert.equal(inc.lines.length, 2, 'blank and zero-quantity lines dropped');
assert.equal(inc.lines[0].price, 57.5, 'price kept exactly as printed');
assert.equal(inc.lines[1].price, 55, 'unit price from line total (330/6)');
const exc = normaliseInvoice({ prices_include_vat: false, lines: [{ description: 'Flour', qty: 4, unit_price: '48,50' }] });
assert.equal(exc.lines[0].price, 48.5, 'decimal comma accepted'); assert.equal(exc.lines[0].unit, 'each'); assert.equal(exc.vatMode, 'excl');
assert.equal(normaliseInvoice(null).lines.length, 0);
assert.equal(normaliseInvoice({ date: '02/10/2026', lines: [] }).date, '', 'bad date ignored');

// costing: prices include VAT, business IS VAT-registered -> stock valued excl VAT
let c = costing([{ qty: 12, price: 57.5 }, { qty: 8, price: 57.5 }], 'incl', true);
assert.equal(c.subtotal, 1000); assert.equal(c.vat, 150); assert.equal(c.total, 1150);
assert.equal(c.stockUnit({ price: 57.5 }), 50, 'registered: 57.50 incl VAT -> 50.00 on the shelf');
// ... not registered -> the VAT is a real cost
c = costing([{ qty: 12, price: 57.5 }], 'incl', false);
assert.equal(c.stockUnit({ price: 57.5 }), 57.5);
assert.equal(c.total, 690);
// prices exclude VAT (VAT added on top)
c = costing([{ qty: 10, price: 100 }], 'excl', true);
assert.equal(c.subtotal, 1000); assert.equal(c.vat, 150); assert.equal(c.total, 1150); assert.equal(c.stockUnit({ price: 100 }), 100);
c = costing([{ qty: 10, price: 100 }], 'excl', false);
assert.equal(c.stockUnit({ price: 100 }), 115, 'not registered: VAT on top is part of the cost');
// no VAT on the invoice at all
c = costing([{ qty: 10, price: 100 }], 'none', false);
assert.equal(c.vat, 0); assert.equal(c.total, 1000); assert.equal(c.stockUnit({ price: 100 }), 100);
assert.equal(c.lineTotal({ qty: 3, price: 12.5 }), 37.5);

assert.equal(guessPack('Avocados (box of 20)'), 20); assert.equal(guessPack('Takeaway cups 50pk'), 50); assert.equal(guessPack('Eggs tray of 30'), 30);
assert.equal(guessPack('Cola 6 x 2L'), 6); assert.equal(guessPack('Cake flour 2.5kg'), 0); assert.equal(guessPack(''), 0); assert.equal(guessPack('Coke 2L'), 0);
assert.equal(unitsDiffer('box', 'each'), true); assert.equal(unitsDiffer('each', 'ea'), false); assert.equal(unitsDiffer('', 'each'), false); assert.equal(unitsDiffer('tray', 'tray'), false);

const ai = normaliseInvoice({ lines: [{ description: 'AVO BOX 20', name: ' Avocados ', category: 'Fresh produce', pack_size: 20, qty: 3, unit: 'box', unit_price: 220 }, { description: 'Milk', qty: 1, unit_price: 30, pack_size: 1 }, { description: 'Cups', qty: 2, unit_price: 5, pack_size: 'x' }] });
assert.equal(ai.lines[0].name, 'Avocados'); assert.equal(ai.lines[0].category, 'Fresh produce'); assert.equal(ai.lines[0].pack, 20);
assert.equal(ai.lines[1].pack, 0, 'a pack of 1 is just one'); assert.equal(ai.lines[2].pack, 0, 'junk pack size ignored'); assert.equal(ai.lines[1].name, '');

console.log('stockInvoice: all checks passed');
