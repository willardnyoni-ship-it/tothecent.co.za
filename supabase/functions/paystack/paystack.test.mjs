// Run with:  node --experimental-strip-types supabase/functions/paystack/paystack.test.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature, startPlan, dateOf, planFromCode, isPlan, PLAN_PRICES } from './paystackLogic.ts';

const body = '{"event":"charge.success","data":{"id":1}}';
const sig = createHmac('sha512', 'sk_test_abc').update(body).digest('hex');
assert.equal(await verifySignature('sk_test_abc', body, sig), true);
assert.equal(await verifySignature('sk_test_abc', body + ' ', sig), false, 'changed body');
assert.equal(await verifySignature('sk_test_other', body, sig), false, 'wrong key');
assert.equal(await verifySignature('sk_test_abc', body, null), false, 'no signature');
assert.equal(await verifySignature('', body, sig), false, 'no secret');
assert.equal(await verifySignature('sk_test_abc', body, sig.slice(0, 20)), false, 'short signature');

assert.deepEqual(startPlan('2026-11-12', '2026-10-20'), { trialing: true, startDate: '2026-11-12T08:00:00.000Z' });
assert.deepEqual(startPlan('2026-10-20', '2026-10-20'), { trialing: false, startDate: null }, 'last day of trial: charge now');
assert.deepEqual(startPlan('2026-10-01', '2026-10-20'), { trialing: false, startDate: null });

assert.equal(dateOf('2026-11-12T08:00:00.000Z'), '2026-11-12'); assert.equal(dateOf('2026-11-12T23:30:00.000Z'), '2026-11-13', 'South African date'); assert.equal(dateOf(null), null); assert.equal(dateOf('x'), null);
assert.equal(planFromCode('PLN_b', [{ plan: 'personal', plan_code: 'PLN_a' }, { plan: 'business', plan_code: 'PLN_b' }]), 'business'); assert.equal(planFromCode('nope', []), null);
assert.ok(isPlan('personal') && isPlan('business') && !isPlan('x'));
assert.equal(PLAN_PRICES.personal.amount, 8900); assert.equal(PLAN_PRICES.business.amount, 38900);
console.log('paystack: all checks passed');
