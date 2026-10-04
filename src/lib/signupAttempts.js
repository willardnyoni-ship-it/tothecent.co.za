// Sign-up attempt reporting, so the owner portal can alert on people who
// tried to create an account and failed. Used by the landing page's
// sign-up form; the portal uses REASONS to describe each failure.
import { deviceLabel } from './device.js';

// reason key -> [plain-English label, what to suggest to the person]
export const REASONS = {
  already_registered: ['Already has an account', 'They signed up before - they should log in, or use "Forgot password?".'],
  password_short: ['Password too short', 'Passwords need at least 6 characters.'],
  password_weak: ['Password too weak', 'Supabase rejected the password as too easy to guess.'],
  email_invalid: ['Email address not valid', 'Probably a typo in the email address.'],
  missing_fields: ['Left email or password empty', 'They pressed Create account without filling everything in.'],
  no_plan: ['Didn\'t choose a plan', 'They didn\'t pick "I run a business" or "It\'s for me".'],
  rate_limited: ['Too many sign-ups at once', 'Supabase\'s email limit was hit, so no confirmation email could be sent. Consider your own email provider (SMTP) in Supabase.'],
  email_send_failed: ['Confirmation email failed to send', 'Supabase couldn\'t send the confirmation email - check Auth → Emails / SMTP in Supabase.'],
  signups_disabled: ['Sign-ups are switched off', 'New sign-ups are disabled in Supabase Auth settings.'],
  oauth_error: ['Google / Apple sign-in failed', 'They cancelled, or the provider returned an error - see the exact message.'],
  network: ['Network problem', 'Their connection dropped or the server couldn\'t be reached.'],
  other: ['Something else went wrong', 'See the exact message.'],
};

export function classifySignupError(message) {
  const m = String(message || '').toLowerCase();
  if (/already (been )?registered|already exists|user_already_exists/.test(m)) return 'already_registered';
  if (/weak|pwned|leaked|easy to guess/.test(m)) return 'password_weak';
  if (/password/.test(m) && /(at least|6 char|too short|length)/.test(m)) return 'password_short';
  if (/invalid.*email|email.*invalid|validate email|format/.test(m)) return 'email_invalid';
  if (/rate limit|too many|only request this after|over_email_send_rate/.test(m)) return 'rate_limited';
  if (/sending (confirmation )?email|smtp|error sending/.test(m)) return 'email_send_failed';
  if (/signups? (not allowed|disabled)|signup_disabled/.test(m)) return 'signups_disabled';
  if (/failed to fetch|network|load failed|timeout/.test(m)) return 'network';
  return 'other';
}

// Fire-and-forget: never delays or breaks the sign-up itself. keepalive
// lets the request finish even though a successful sign-up immediately
// navigates away to the app.
export function reportSignupAttempt(supaUrl, supaKey, { email, outcome, stage, reason, message, segment }) {
  try {
    fetch(supaUrl + '/rest/v1/rpc/log_signup_attempt', {
      method: 'POST',
      keepalive: true,
      headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_email: String(email || '').trim().toLowerCase().slice(0, 200) || null,
        p_outcome: outcome, p_stage: stage || null, p_reason: reason || null,
        p_message: message ? String(message).slice(0, 300) : null,
        p_device: deviceLabel(), p_segment: segment || null,
      }),
    }).catch(() => {});
  } catch { /* reporting must never get in the way */ }
}
