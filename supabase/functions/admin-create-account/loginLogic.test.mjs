// Run with:  node --experimental-strip-types supabase/functions/admin-create-account/loginLogic.test.mjs
import assert from 'node:assert/strict';
import { makePassword, loginEmail, esc } from './loginLogic.ts';

// passwords: right length, only unambiguous characters, different every time
const seen = new Set();
for (let i = 0; i < 2000; i++) {
  const p = makePassword();
  assert.equal(p.length, 12); assert.match(p, /^[A-HJKMNP-Za-hjkmnp-z2-9]{12}$/); assert.ok(!/[0O1lI]/.test(p));
  seen.add(p);
}
assert.equal(seen.size, 2000, 'no repeats in 2000');
assert.equal(makePassword(20).length, 20);
// every position and every character gets used (no bias toward a few letters)
const counts = {}; for (let i = 0; i < 4000; i++) for (const c of makePassword()) counts[c] = (counts[c] || 0) + 1;
assert.equal(Object.keys(counts).length, 54, 'all 54 characters appear');
const vals = Object.values(counts); assert.ok(Math.max(...vals) / Math.min(...vals) < 1.3, 'roughly even');
// the password must always contain a mix, so it is not accidentally all one case or all digits
let allSame = 0; for (let i = 0; i < 500; i++) { const p = makePassword(); if (/^[a-z]+$/.test(p) || /^[A-Z]+$/.test(p) || /^[2-9]+$/.test(p)) allSame++; }
assert.equal(allSame, 0);

const m = loginEmail({ name: 'Thandi Mokoena', email: 'thandi@example.co.za', password: 'Abc234Xyz567', site: 'https://tothecent.co.za/' });
assert.equal(m.subject, 'Your To The Cent login');
assert.ok(m.text.startsWith('Hi Thandi,')); assert.ok(m.text.includes('Email: thandi@example.co.za') && m.text.includes('Password: Abc234Xyz567') && m.text.includes('https://tothecent.co.za/'));
assert.ok(m.text.includes('choose a password of your own'));
assert.ok(m.html.includes('Abc234Xyz567') && m.html.includes('href="https://tothecent.co.za/"'));
assert.ok(loginEmail({ email: 'a@b.co', password: 'x', site: 's' }).text.startsWith('Hi,'), 'no name is fine');
// a hostile name cannot inject markup
const bad = loginEmail({ name: '<script>alert(1)</script>', email: 'a@b.co', password: 'p', site: 'https://x' });
assert.ok(!bad.html.includes('<script>')); assert.equal(esc('a&b<"'), 'a&amp;b&lt;&quot;');
console.log('loginLogic: all checks passed');
