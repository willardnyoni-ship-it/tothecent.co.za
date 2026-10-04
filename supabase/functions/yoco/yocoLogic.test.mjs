// Run with:  node --experimental-strip-types supabase/functions/yoco/yocoLogic.test.mjs
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { verifySignature, mapPayment, sastDate } from './yocoLogic.ts';

// --- signature: sign the way Yoco documents it, then verify ---
const secretBytes = randomBytes(24);
const secret = 'whsec_' + secretBytes.toString('base64');
const id = 'msg_123', ts = String(Math.floor(Date.now() / 1000));
const body = JSON.stringify({ business_id: 'b', event_type: 'payment.created', order_id: 'o', payment_id: 'p' });
const sig = createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64');

assert.equal(await verifySignature(secret, id, ts, body, 'v1,' + sig), true, 'valid signature');
assert.equal(await verifySignature(secret, id, ts, body, 'v1,AAAA v1,' + sig), true, 'one of several signatures');
assert.equal(await verifySignature(secret, id, ts, body + ' ', 'v1,' + sig), false, 'body changed');
assert.equal(await verifySignature(secret, 'msg_999', ts, body, 'v1,' + sig), false, 'id changed');
assert.equal(await verifySignature(secret + 'x', id, ts, body, 'v1,' + sig), false, 'wrong secret');
assert.equal(await verifySignature(secret, id, ts, body, ''), false, 'no signature');
const old = String(Math.floor(Date.now() / 1000) - 600);
const oldSig = createHmac('sha256', secretBytes).update(`${id}.${old}.${body}`).digest('base64');
assert.equal(await verifySignature(secret, id, old, body, 'v1,' + oldSig), false, 'too old (replay)');

// --- payment mapping ---
assert.equal(sastDate('2026-10-05T23:30:00Z'), '2026-10-06', 'SAST is UTC+2');
const pay = {
  id: 'pay1', status: 'approved', created_at: '2026-10-05T10:15:00Z', payment_method: 'card', payment_source: 'card_machine',
  receipt_number: 'R-77', amount_excl_tip: { amount: 31240, currency: 'ZAR' }, tip_amount: { amount: 2000, currency: 'ZAR' },
  total_amount: { amount: 33240, currency: 'ZAR' }, processing_fees: [{ type: 'initial', amount: { amount: 812, currency: 'ZAR' } }],
};
const rows = mapPayment(pay);
assert.equal(rows.length, 2);
assert.equal(rows[0].amount, 312.4); assert.equal(rows[0].kind, 'income'); assert.equal(rows[0].external_id, 'pay1');
assert.match(rows[0].description, /card sale \(card machine\).*receipt R-77.*tip R20\.00 not counted/);
assert.equal(rows[1].amount, 8.12); assert.equal(rows[1].kind, 'expense'); assert.equal(rows[1].external_id, 'pay1:fee');
assert.deepEqual(mapPayment({ ...pay, status: 'pending' }), [], 'only approved payments');
assert.deepEqual(mapPayment({ ...pay, status: 'failed' }), []);
assert.equal(mapPayment({ ...pay, processing_fees: [] }).length, 1, 'no fee row without fees');
assert.equal(mapPayment({ ...pay, processing_fees: [{ type: 'initial', amount: 500 }] })[1].amount, 5, 'fee as plain number');
assert.equal(mapPayment({ ...pay, amount_excl_tip: undefined })[0].amount, 312.4, 'falls back to total minus tip');
assert.deepEqual(mapPayment(null), []);

console.log('yocoLogic: all checks passed');
