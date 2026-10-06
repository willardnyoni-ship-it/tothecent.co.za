// What Supabase's sign-up call actually means. With email confirmation on, the answer to /auth/v1/signup is
// the user object ITSELF (not wrapped in { user }), and for an email that already has an account it is a
// placeholder user with no identities and NO email is sent. Reading it wrongly leaves a returning
// customer waiting for a confirmation email that never comes.

// -> 'signed_in' | 'exists' | 'confirm'
export function signupOutcome(d) {
  if (d && d.access_token) return 'signed_in';
  const u = d && (d.user || (d.id && d.email ? d : null));
  if (u && Array.isArray(u.identities) && u.identities.length === 0) return 'exists';
  return 'confirm';
}

// "For security purposes, you can only request this after 79 seconds." -> 79 (or null)
export function waitSeconds(message) {
  const m = /only request this after (\d+) seconds?/i.exec(String(message || ''));
  return m ? +m[1] : null;
}
