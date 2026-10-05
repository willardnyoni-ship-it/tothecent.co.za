// Run with:  node src/lib/currency.test.mjs
import assert from 'node:assert/strict';
import { fmt, fmtDoc, zar, rateOf, isForeign, currencyOf, rateText, plausibleRand, isCode, fetchRate } from './currency.js';

const nb = s => s.replace(/ | /g, ' '); // locale spaces
assert.equal(nb(fmt(1234.5)), 'R1 234,50'); assert.equal(nb(fmt(1234.5, 'ZAR')), 'R1 234,50');
assert.equal(nb(fmt(1234.5, 'USD')), 'USD 1 234,50'); assert.equal(nb(fmt(-80, 'EUR')), '-EUR 80,00'); assert.equal(fmt(null, 'GBP'), 'GBP 0,00');

const usd = { currency: 'USD', exchange_rate: '18.45' };
assert.equal(currencyOf(usd), 'USD'); assert.equal(isForeign(usd), true); assert.equal(rateOf(usd), 18.45);
assert.equal(zar(usd, 1200), 22140); assert.equal(zar(usd, 33.333), Math.round(33.333 * 18.45 * 100) / 100);
// plain rand and old rows with no currency stay as they were
for (const d of [{}, { currency: 'ZAR', exchange_rate: 5 }, { currency: null }, undefined]) { assert.equal(isForeign(d), false); assert.equal(rateOf(d), 1); assert.equal(currencyOf(d), 'ZAR'); }
assert.equal(zar({ currency: 'ZAR' }, 100), 100);
// a bad rate on a foreign invoice falls back to 1 rather than zeroing the money
assert.equal(rateOf({ currency: 'USD', exchange_rate: 0 }), 1);
assert.equal(nb(fmtDoc(usd, 50)), 'USD 50,00');
assert.equal(nb(rateText('USD', 18.45)), 'R18,4500 per USD');

// bank deposit recognition
assert.equal(plausibleRand(usd, 1200, 21500), true, 'rand moved a little');
assert.equal(plausibleRand(usd, 1200, 28000), false, 'too far from the rate');
assert.equal(plausibleRand(usd, 1200, 1200), false, 'looks like the dollar figure, not rand');

assert.equal(isCode('USD'), true); assert.equal(isCode('usd'), false); assert.equal(isCode('US'), false);
assert.equal(await fetchRate('ZAR'), 1); assert.equal(await fetchRate('bad'), 1);
console.log('currency: all checks passed');
