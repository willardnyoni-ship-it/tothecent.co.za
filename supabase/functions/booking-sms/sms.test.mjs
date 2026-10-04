// Run with:  node --experimental-strip-types supabase/functions/booking-sms/sms.test.mjs
import assert from 'node:assert/strict';
import { normalisePhone, gsm, segments, dayLabel, dayWords, buildMessage } from './sms.ts';

// phone numbers
for (const [raw, want] of [['082 555 0101', '+27825550101'], ['0825550101', '+27825550101'], ['(082) 555-0101', '+27825550101'], ['+27 82 555 0101', '+27825550101'], ['27825550101', '+27825550101'],
  ['0027825550101', '+27825550101'], ['825550101', '+27825550101'], ['+44 7700 900123', '+447700900123'], ['', null], ['123', null], ['abc', null], ['082 555', null], ['+0123456789', null]]) {
  assert.equal(normalisePhone(raw), want, `phone ${raw}`);
}

// plain characters only
assert.equal(gsm('Café “Crème” – Nomsa’s…'), 'Cafe "Creme" - Nomsa\'s...');
assert.equal(gsm('Hi 😀 there {x}'), 'Hi there x'); assert.equal(segments('x'.repeat(160)), 1); assert.equal(segments('x'.repeat(161)), 2); assert.equal(segments('x'.repeat(306)), 2);

// days
assert.equal(dayLabel('2026-10-19'), 'Mon 19 Oct'); assert.equal(dayWords('2026-10-19', '2026-10-19'), 'today'); assert.equal(dayWords('2026-10-20', '2026-10-19'), 'tomorrow'); assert.equal(dayWords('2026-10-23', '2026-10-19'), 'on Fri 23 Oct');
assert.equal(dayWords('2026-11-01', '2026-10-31'), 'tomorrow', 'across month end');

const base = { client_name: 'Thandi Mokoena', service: 'Box braids', date: '2026-10-20', start_time: '10:00', biz_name: "Nomsa's Hair Studio", contact_phone: '082 555 0100', slug: 'nomsas-hair-studio', deposit_due: 200, reference: 'ABC123' };
const rem = buildMessage({ ...base, kind: 'reminder' }, '2026-10-19');
assert.equal(rem, "Hi Thandi, reminder: Box braids at Nomsa's Hair Studio tomorrow at 10:00. To change, call/WhatsApp 082 555 0100. See you!");
assert.ok(rem.length <= 160 && segments(rem) === 1);
const conf = buildMessage({ ...base, kind: 'confirmation' }, '2026-10-19');
assert.equal(conf, "Hi Thandi, your Box braids at Nomsa's Hair Studio is booked for Tue 20 Oct at 10:00. R200 deposit holds your slot. Ref ABC123. Questions? 082 555 0100");
assert.ok(conf.length <= 160, 'confirmation fits one SMS: ' + conf.length);
const can = buildMessage({ ...base, kind: 'cancelled' }, '2026-10-19');
assert.equal(can, "Hi Thandi, sorry - Nomsa's Hair Studio can't go ahead with your Box braids on Tue 20 Oct at 10:00. Book another time: https://tothecent.co.za/book/?b=nomsas-hair-studio");
// long names are trimmed, extras dropped, still one clean message; no deposit/phone are simply left out
const long = buildMessage({ ...base, kind: 'confirmation', service: 'Brazilian blowout with keratin treatment and trim', biz_name: 'The Very Long Named Hair And Beauty Studio', client_name: 'Bongiwe-Nomalanga' }, '2026-10-19');
assert.ok(long.length <= 160, 'trimmed to fit: ' + long.length + ' ' + long); assert.match(long, /Ref ABC123/); assert.ok(!/[^\x20-\x7E]/.test(long));
const bare = buildMessage({ ...base, kind: 'reminder', contact_phone: null, deposit_due: 0 }, '2026-10-20');
assert.equal(bare, "Hi Thandi, reminder: Box braids at Nomsa's Hair Studio today at 10:00. See you!");
assert.equal(buildMessage({ ...base, kind: 'reminder', client_name: '' }, '2026-10-19').startsWith('Hi there,'), true);

console.log('booking-sms: all checks passed');
