// Run with:  node src/lib/signupResult.test.mjs
import assert from 'node:assert/strict';
import { signupOutcome, waitSeconds } from './signupResult.js';

// the real answer for an email that already has an account (a placeholder user, no identities, no email sent)
const existing = { id: 'f2c45a4a-eace-43f0-a9d9-548923617b52', aud: 'authenticated', role: '', email: 'sales@tothecent.co.za', identities: [], app_metadata: { provider: 'email' }, user_metadata: { segment: 'personal' } };
assert.equal(signupOutcome(existing), 'exists');
// older shape, wrapped
assert.equal(signupOutcome({ user: { id: 'x', email: 'a@b.co', identities: [] } }), 'exists');
// a genuine new sign-up waiting for the confirmation email: the user has an identity
assert.equal(signupOutcome({ id: 'y', email: 'new@b.co', identities: [{ id: '1', provider: 'email' }] }), 'confirm');
assert.equal(signupOutcome({ user: { id: 'y', email: 'new@b.co', identities: [{ id: '1' }] } }), 'confirm');
// confirmation switched off: signed straight in
assert.equal(signupOutcome({ access_token: 't', user: { id: 'z', identities: [{ id: '1' }] } }), 'signed_in');
assert.equal(signupOutcome({ access_token: 't', user: { id: 'z', identities: [] } }), 'signed_in', 'a session always wins');
// anything unexpected is treated as "check your email", never as an error
assert.equal(signupOutcome({}), 'confirm'); assert.equal(signupOutcome(null), 'confirm'); assert.equal(signupOutcome({ id: 'q' }), 'confirm');

assert.equal(waitSeconds('For security purposes, you can only request this after 79 seconds.'), 79);
assert.equal(waitSeconds('only request this after 1 second'), 1); assert.equal(waitSeconds('email rate limit exceeded'), null); assert.equal(waitSeconds(null), null);
console.log('signupResult: all checks passed');
