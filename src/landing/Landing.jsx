import { useEffect, useRef, useState } from 'react';
import { classifySignupError, reportSignupAttempt } from '../lib/signupAttempts.js';
import { signupOutcome, waitSeconds } from '../lib/signupResult.js';
import { Ic, I, BIZ_TYPES, ESSENTIALS, SECURITY, FAQ, BizStory, HeroScene, PROBLEMS, PLANS } from './content.jsx';

const HOSTED_SUPA_URL = 'https://pkbpmnpevxjrqjnepsjd.supabase.co';
const HOSTED_SUPA_KEY = 'sb_publishable_foyO2Py6QAR3oG8IK4OyzQ_WOFBcuiN';
const SYNC_KEY = 'wnSync_v1';

async function authFetch(path, body) {
  const r = await fetch(HOSTED_SUPA_URL + path, {
    method: 'POST', headers: { apikey: HOSTED_SUPA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.msg || d.error_description || d.message || 'Request failed (' + r.status + ')');
  return d;
}
function saveSession(d) {
  const cfg = {
    url: HOSTED_SUPA_URL, key: HOSTED_SUPA_KEY,
    token: d.access_token, refresh: d.refresh_token,
    userId: d.user && d.user.id, email: d.user && d.user.email,
    expires: Date.now() + ((d.expires_in || 3600) * 1000) - 60000,
    auto: true, // keep this account's data in sync across devices
  };
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
}

// Google / Apple sign-in goes through Supabase's hosted OAuth flow and comes
// back to this page with the session in the URL fragment. The plan picked on
// "Create account" is kept here across that round trip.
const PENDING_SEGMENT_KEY = 'wnPendingSegment';
const OAUTH_PROVIDERS = [
  ['google', 'Continue with Google'],
  ['apple', 'Continue with Apple'],
];
function ProviderLogo({ id }) {
  if (id === 'google') return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27z" />
    </svg>
  );
}

// Numbers count up when they scroll into view. Ease-out so they decelerate
// into place. Ported unchanged from index.html.
function fmt(n, prefix, suffix) {
  const neg = n < 0;
  const v = Math.round(Math.abs(n)).toLocaleString('en-ZA').replace(/,/g, ' ');
  return (neg ? '-' : '') + (prefix || '') + v + (suffix || '');
}

function useRevealAndCounts() {
  const rootRef = useRef(null);
  useEffect(() => {
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function countUp(el) {
      if (el._done) return; el._done = true;
      const to = parseFloat(el.dataset.count);
      const prefix = el.dataset.prefix || '', suffix = el.dataset.suffix || '';
      if (REDUCED) { el.textContent = fmt(to, prefix, suffix); return; }
      const dur = 1150, t0 = performance.now();
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(to * e, prefix, suffix);
        if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(to, prefix, suffix);
      };
      requestAnimationFrame(step);
    }
    function startCounts(root) {
      if (!root) return;
      if (root.hasAttribute('data-count')) countUp(root);
      root.querySelectorAll('[data-count]').forEach(countUp);
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
        if (e.target.hasAttribute('data-count') || e.target.querySelector('[data-count]')) startCounts(e.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -60px 0px' });
    rootRef.current?.querySelectorAll('.reveal').forEach(el => io.observe(el));

    // The phone is above the fold, so it runs on load rather than on scroll.
    const t = setTimeout(() => startCounts(document.getElementById('phone')), 450);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return rootRef;
}

export default function Landing() {
  const rootRef = useRevealAndCounts();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthModeState] = useState('signin');
  const [segment, setSegment] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const [resendable, setResendable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);
  const [providers, setProviders] = useState([]); // OAuth providers switched on in Supabase
  const [scrolled, setScrolled] = useState(false);
  const [bizType, setBizType] = useState('trades');
  const activeType = BIZ_TYPES.find(t => t.key === bizType) || BIZ_TYPES[0];

  // The navigation bar turns solid once the page scrolls past the hero top.
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 20);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const [invite, setInvite] = useState(null); // { email, name } from an ?invite= link
  const recoverRef = useRef({ token: null, refresh: null, expiresIn: null });
  const emailRef = useRef(null), passRef = useRef(null);

  // Already signed in? Don't make a returning visitor sit through the pitch
  // again - swap the top-corner link to go straight into the app.
  useEffect(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}');
      if (cfg.token) setAlreadySignedIn(true);
    } catch (e) { /* ignore */ }
  }, []);

  // Only show the Google / Apple buttons for providers that are switched on
  // in Supabase, so a half-configured provider never leads to an error page.
  useEffect(() => {
    fetch(HOSTED_SUPA_URL + '/auth/v1/settings', { headers: { apikey: HOSTED_SUPA_KEY } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && d.external) setProviders(OAUTH_PROVIDERS.filter(([id]) => d.external[id])); })
      .catch(() => { /* offline - email sign-in still works */ });
  }, []);

  // Back from Google / Apple: the session is in the fragment (or an error in
  // the query/fragment). Save it, record the plan for a new account, go in.
  useEffect(() => {
    const hp = new URLSearchParams(location.hash.slice(1));
    const qp = new URLSearchParams(location.search);
    const err = hp.get('error_description') || qp.get('error_description') || hp.get('error') || qp.get('error');
    let pending = '';
    try { pending = localStorage.getItem(PENDING_SEGMENT_KEY) || ''; } catch (e) { /* ignore */ }
    if (err) {
      history.replaceState(null, '', location.pathname);
      try { localStorage.removeItem(PENDING_SEGMENT_KEY); } catch (e) { /* ignore */ }
      if (pending) reportSignupAttempt(HOSTED_SUPA_URL, HOSTED_SUPA_KEY, { email: '', outcome: 'failed', stage: 'server', reason: 'oauth_error', message: err, segment: pending });
      openAuth(pending ? 'signup' : 'signin');
      setMsg(/denied|cancel/i.test(err) ? 'Sign-in was cancelled. You can try again, or use your email instead.' : 'Sign-in didn\'t work: ' + err);
      return;
    }
    const token = hp.get('access_token');
    const type = hp.get('type');
    if (!token || type === 'recovery' || type === 'invite') return;
    history.replaceState(null, '', location.pathname + location.search);
    (async () => {
      try {
        const r = await fetch(HOSTED_SUPA_URL + '/auth/v1/user', { headers: { apikey: HOSTED_SUPA_KEY, Authorization: 'Bearer ' + token } });
        let user = await r.json();
        if (!r.ok || !user.id) throw new Error(user.msg || user.message || 'Could not finish signing in.');
        const meta = user.user_metadata || {};
        const isNew = !meta.segment && Date.now() - new Date(user.created_at).getTime() < 10 * 60 * 1000;
        let segmentNow = meta.segment || '';
        if (isNew) {
          segmentNow = pending || 'personal';
          const u = await fetch(HOSTED_SUPA_URL + '/auth/v1/user', {
            method: 'PUT',
            headers: { apikey: HOSTED_SUPA_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { segment: segmentNow } }),
          });
          if (u.ok) user = await u.json();
          reportSignupAttempt(HOSTED_SUPA_URL, HOSTED_SUPA_KEY, { email: user.email || '', outcome: 'succeeded', stage: 'server', reason: 'signed_in', message: 'via ' + ((user.app_metadata && user.app_metadata.provider) || 'oauth'), segment: segmentNow });
        }
        try { localStorage.removeItem(PENDING_SEGMENT_KEY); } catch (e) { /* ignore */ }
        saveSession({ access_token: token, refresh_token: hp.get('refresh_token'), expires_in: Number(hp.get('expires_in')) || 3600, user });
        location.href = !isNew ? '/app/' : segmentNow === 'business' ? '/app/?mode=business' : '/app/?onboard=1';
      } catch (e2) {
        openAuth('signin');
        setMsg(e2.message || 'Could not finish signing in. Please try again.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Landing here from a password-reset email link - Supabase appends the
  // recovery token as a URL fragment. Pull it out, scrub it from the URL.
  useEffect(() => {
    if (!location.hash) return;
    const hp = new URLSearchParams(location.hash.slice(1));
    // An account created for someone from the owner portal arrives the same
    // way with type=invite - they likewise just need to choose a password.
    if ((hp.get('type') === 'recovery' || hp.get('type') === 'invite') && hp.get('access_token')) {
      recoverRef.current = { token: hp.get('access_token'), refresh: hp.get('refresh_token'), expiresIn: hp.get('expires_in'), invited: hp.get('type') === 'invite' };
      history.replaceState(null, '', location.pathname + location.search);
      openAuth('recover');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opened from an invite link (tothecent.co.za/?invite=<code>) - look the
  // code up, greet them by name and open "Create account" with their email
  // filled in. An unknown or withdrawn code just shows the normal page.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('invite');
    if (!code || !/^[0-9a-f-]{36}$/i.test(code)) return;
    (async () => {
      try {
        const r = await fetch(HOSTED_SUPA_URL + '/rest/v1/rpc/invite_details', {
          method: 'POST',
          headers: { apikey: HOSTED_SUPA_KEY, Authorization: 'Bearer ' + HOSTED_SUPA_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite_code: code }),
        });
        const rows = r.ok ? await r.json() : [];
        if (!rows || !rows[0]) return;
        setInvite(rows[0]);
        setEmail(rows[0].email || '');
        openAuth('signup');
      } catch (e) { /* offline or old link - normal landing page */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The app sends signed-out visitors here with ?auth=signin or ?auth=signup.
  useEffect(() => {
    const a = new URLSearchParams(location.search).get('auth');
    if (a === 'signin' || a === 'signup') openAuth(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAuth(mode, seg) {
    setAuthModeState(mode || 'signin');
    setSegment(seg || '');
    setMsg('');
    setAuthOpen(true);
    setTimeout(() => (mode === 'recover' ? passRef : emailRef).current?.focus(), 150);
  }
  function closeAuth() { setAuthOpen(false); }

  function signInWith(provider) {
    if (authMode === 'signup' && !segment) { setMsg('Choose your plan first, then continue.'); return; }
    try {
      if (authMode === 'signup') localStorage.setItem(PENDING_SEGMENT_KEY, segment);
      else localStorage.removeItem(PENDING_SEGMENT_KEY);
    } catch (e) { /* ignore */ }
    setBusy(true);
    setMsg('Opening ' + (provider === 'google' ? 'Google' : 'Apple') + '…');
    const back = location.origin + '/';
    location.href = HOSTED_SUPA_URL + '/auth/v1/authorize?provider=' + provider + '&redirect_to=' + encodeURIComponent(back);
  }

  async function forgotPassword() {
    if (!email.trim()) { setMsg('Enter your email above first.'); return; }
    setMsg('Sending…');
    try {
      const redirect = encodeURIComponent(location.href.split('#')[0].split('?')[0]);
      await authFetch('/auth/v1/recover?redirect_to=' + redirect, { email: email.trim() });
      setMsg('Check your email for a reset link.');
    } catch (err) { setMsg(err.message); }
  }

  async function resendConfirmation() {
    setMsg('Sending…');
    try {
      await authFetch('/auth/v1/resend', { type: 'signup', email: email.trim() });
      setMsg(`Sent again to ${email.trim()}. Check your inbox and spam folder.`);
    } catch (err) {
      const wait = waitSeconds(err.message);
      setMsg(wait ? `Please wait about ${wait} seconds before asking for another email.` : err.message);
    }
  }

  async function submitAuth() {
    if (authMode === 'recover') {
      if (!pass || pass.length < 6) { setMsg('Password must be at least 6 characters.'); return; }
      setMsg('Working…'); setBusy(true);
      try {
        const { token, refresh, expiresIn } = recoverRef.current;
        const r = await fetch(HOSTED_SUPA_URL + '/auth/v1/user', {
          method: 'PUT',
          headers: { apikey: HOSTED_SUPA_KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ password: pass }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.msg || d.error_description || d.message || 'Request failed (' + r.status + ')');
        saveSession({ access_token: token, refresh_token: refresh, expires_in: expiresIn, user: d });
        // Someone whose business was set up for them lands in it directly.
        location.href = d.user_metadata && d.user_metadata.segment === 'business' ? '/app/?mode=business' : '/app/';
      } catch (err) { setMsg(err.message); } finally { setBusy(false); }
      return;
    }
    // Sign-up attempts are reported (fire-and-forget) so the owner portal
    // can alert on people who tried to create an account and failed.
    const report = (outcome, stage, reason, message) => {
      if (authMode === 'signup') reportSignupAttempt(HOSTED_SUPA_URL, HOSTED_SUPA_KEY, { email, outcome, stage, reason, message, segment });
    };
    setResendable(false);
    if (authMode === 'signup' && !segment) { setMsg('Please choose "I run a business" or "It\'s for me" above first.'); if (email.trim()) report('failed', 'form', 'no_plan'); return; }
    if (!email.trim() || !pass) { setMsg('Email and password are both needed.'); if (email.trim()) report('failed', 'form', 'missing_fields'); return; }
    if (authMode === 'signup' && pass.length < 6) { setMsg('Password must be at least 6 characters.'); report('failed', 'form', 'password_short'); return; }
    setMsg('Working…'); setBusy(true);
    try {
      if (authMode === 'signin') {
        const d = await authFetch('/auth/v1/token?grant_type=password', { email: email.trim(), password: pass });
        saveSession(d);
        location.href = '/app/';
      } else {
        const d = await authFetch('/auth/v1/signup', { email: email.trim(), password: pass, data: { segment } });
        // Supabase doesn't reveal an existing account as an error: it returns
        // a placeholder user with no identities and sends no email. Without
        // this check the person waits for a confirmation that never comes.
        const outcome = signupOutcome(d);
        if (outcome === 'exists') {
          report('failed', 'server', 'already_registered', 'Email already has an account');
          setMsg('You already have an account with this email, so we have not sent a new confirmation. Log in instead, or choose "Forgot password?" below to set a new password.');
          setAuthModeState('signin');
          return;
        }
        report('succeeded', 'server', outcome === 'signed_in' ? 'signed_in' : 'confirm_email');
        if (outcome === 'signed_in') {
          saveSession(d);
          location.href = segment === 'business' ? '/app/?mode=business' : '/app/?onboard=1';
        }
        else { setMsg(`We sent a confirmation link to ${email.trim()}. It can take a minute to arrive - check your spam folder too. Open the link, then log in.`); setResendable(true); }
      }
    } catch (err) {
      if (authMode === 'signup') {
        const reason = classifySignupError(err.message);
        report('failed', reason === 'network' ? 'network' : 'server', reason, err.message);
        if (reason === 'already_registered') { setMsg('There is already an account with this email. Log in instead, or use "Forgot password?" below.'); setAuthModeState('signin'); return; }
        const wait = waitSeconds(err.message);
        if (wait) { setMsg(`We have just sent you an email. Please wait about ${wait} seconds before asking for another, and check your spam folder.`); setResendable(true); return; }
        if (reason === 'rate_limited') { setMsg("We're getting a lot of sign-ups right now and couldn't send your confirmation email. Please try again in a few minutes."); return; }
      }
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  const isRecover = authMode === 'recover';

  return (
    <div ref={rootRef}>

      {authOpen && (
        <div className="authOverlay on" id="authOverlay" onClick={e => { if (e.target.id === 'authOverlay') closeAuth(); }}>
          <div className="authBox">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{isRecover ? (recoverRef.current.invited ? 'Welcome to To The Cent' : 'Set a new password') : 'Your account'}</h3>
              <button className="authClose" onClick={closeAuth} aria-label="Close">&times;</button>
            </div>
            <p className="mini" style={{ marginTop: 6 }}>
              {isRecover ? (recoverRef.current.invited ? 'Your account is ready - choose a password to finish setting it up.' : 'Choose a new password for your account.')
                : invite && authMode === 'signup' ? `Welcome${invite.name ? ', ' + invite.name.split(' ')[0] : ''} - you've been invited to To The Cent. Choose a plan and a password to get started.`
                : 'Same account, works in the app on any device.'}
            </p>
            {!isRecover && (
              <div className="authTabs">
                <button className={authMode === 'signin' ? 'on' : ''} onClick={() => setAuthModeState('signin')} type="button">Log in</button>
                <button className={authMode === 'signup' ? 'on' : ''} onClick={() => setAuthModeState('signup')} type="button">Create account</button>
              </div>
            )}
            {authMode === 'signup' && (
              <div style={{ display: 'flex', flexDirection: 'column', margin: '16px 0' }}>
                <label style={{ margin: '0 0 7px' }}>Choose your plan</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className={'pathbtn segbtn' + (segment === 'business' ? ' on' : '')} type="button" onClick={() => setSegment('business')}>
                    <div className="t">I run a business <span className="arrow">&rarr;</span></div>
                    <div className="d">Turn slips and statements into tidy SARS records</div>
                  </button>
                  <button className={'pathbtn segbtn' + (segment === 'personal' ? ' on' : '')} type="button" onClick={() => setSegment('personal')}>
                    <div className="t">It's for me <span className="arrow">&rarr;</span></div>
                    <div className="d">Find out where the money actually goes each month</div>
                  </button>
                </div>
              </div>
            )}
            {!isRecover && providers.length > 0 && (
              <div className="oauth">
                {providers.map(([id, label]) => (
                  <button key={id} type="button" className={'oauthBtn ' + id} disabled={busy} onClick={() => signInWith(id)}>
                    <ProviderLogo id={id} />{label}
                  </button>
                ))}
                <div className="orline"><span>or use your email</span></div>
              </div>
            )}
            {!isRecover && (
              <div>
                <label>Email</label>
                <input ref={emailRef} type="email" autoComplete="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            )}
            <label>{isRecover ? 'New password' : 'Password'}</label>
            <input ref={passRef} type="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
              placeholder="At least 6 characters" value={pass}
              onChange={e => setPass(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAuth(); }} />
            <div style={{ height: 6 }} />
            <button className="btn primary" disabled={busy} onClick={submitAuth} type="button">
              {isRecover ? 'Set new password' : authMode === 'signin' ? 'Log in' : 'Create account'}
            </button>
            {!isRecover && (
              <p className="mini" style={{ margin: '10px 0 0', textAlign: 'center' }}>
                <a href="#" onClick={e => { e.preventDefault(); forgotPassword(); }} style={{ color: 'var(--blue)' }}>Forgot password?</a>
              </p>
            )}
            <div className="mini" style={{ marginTop: 12, minHeight: 18 }} role="status">{msg}</div>
            {resendable && <p className="mini" style={{ margin: '6px 0 0' }}><a href="#" onClick={e => { e.preventDefault(); resendConfirmation(); }} style={{ color: 'var(--blue)' }}>Send the confirmation email again</a></p>}
          </div>
        </div>
      )}

      <nav className={'nav' + (scrolled ? ' scrolled' : '')}>
        <div className="wrap">
          <a className="logo" href="/"><span className="mark">TC</span><span>To The Cent</span></a>
          <div className="links">
            <a href="#personal">Personal</a>
            <a href="#business">Business</a>
            <a href="#pricing">Pricing</a>
            <a href="#how">How it works</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="right">
            {alreadySignedIn
              ? <a className="btn primary sm" href="/app/">Open the app</a>
              : <>
                  <button className="login" type="button" onClick={() => openAuth('signin')}>Log in</button>
                  <button className="btn primary sm" type="button" onClick={() => openAuth('signup')}>Get started</button>
                </>}
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <div className="hero-split">
          <div className="hero-top">
            <h1 className="reveal">Every rand,<br /><em>down to the cent.</em></h1>
            <p className="lede reveal d1">Money slips away for families and small businesses alike - late-paying clients, lost receipts, surprise debit orders, SARS deadlines. To The Cent puts your personal budget and your business books in one app, so you always know where you stand.</p>
            <div className="ctas reveal d2">
              <button className="btn primary" type="button" onClick={() => openAuth('signup')}>Create your account <Ic d={I.arrow} /></button>
              <a className="btn light" href="#problems">See what it fixes</a>
            </div>
            <div className="ticks reveal d2">
              <span><Ic d={I.check} /> No bank login, ever</span>
              <span><Ic d={I.check} /> Same data on phone &amp; PC</span>
              <span><Ic d={I.check} /> Personal &amp; business</span>
            </div>
          </div>
          <div className="hero-art reveal d3"><HeroScene /></div>
          </div>
          <p className="scene-note">Example data, shown for illustration.</p>
        </div>
      </header>

      <div className="banks">
        <div className="wrap">
          <span className="lab">Import statements from</span>
          {['Capitec', 'FNB', 'Standard Bank', 'Absa', 'Nedbank'].map(b => <span className="bank" key={b}>{b}</span>)}
          <span className="note"><Ic d={I.lock} /> No bank login needed</span>
        </div>
      </div>

      <section id="problems" className="problems">
        <div className="wrap">
          <div className="center reveal">
            <span className="eyebrow">Sound familiar?</span>
            <h2 className="sec">The money problems we fix.</h2>
            <p className="sub">Whether it's your household or your business, the same things keep going wrong. Here's what To The Cent does about each one.</p>
          </div>
          <div className="pgrid">
            {[['people', I.home, 'For you and your family', PROBLEMS.people], ['business', I.briefcase, 'For your business', PROBLEMS.business]].map(([k, ic, t, rows]) => (
              <div className={'pcol reveal ' + k} key={k}>
                <div className="phead"><span aria-hidden="true"><Ic d={ic} /></span><b>{t}</b></div>
                {rows.map(([p, f]) => (
                  <div className="prow" key={p}>
                    <div className="pain"><i aria-hidden="true">✕</i>{p}</div>
                    <div className="fix"><i aria-hidden="true">✓</i>{f}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="personal">
        <div className="wrap split">
          <div className="reveal">
            <span className="eyebrow">Personal budget</span>
            <h2 className="sec">Know what you can spend - today.</h2>
            <p className="sub">Built around how South Africans actually get paid: pay day to pay day, with the bills that are still coming already set aside.</p>
            <ul className="flist">
              <li><span className="fi"><Ic d={I.wallet} /></span><div><b>Safe to spend, every day</b><p>One number that already accounts for rent, subscriptions and debit orders still to come this cycle.</p></div></li>
              <li><span className="fi"><Ic d={I.scan} /></span><div><b>Snap a till slip</b><p>Take a photo - the shop, date, total and line items are read for you. No typing.</p></div></li>
              <li><span className="fi"><Ic d={I.doc} /></span><div><b>Drop in your bank statement</b><p>PDF or CSV from your bank's app. Slips and statement lines match up automatically, so nothing is counted twice.</p></div></li>
              <li><span className="fi"><Ic d={I.chat} /></span><div><b>Ask Khanyiso</b><p>A built-in assistant that answers questions about your own spending, like "where did my money go this month?"</p></div></li>
            </ul>
          </div>
          <div className="shot reveal d2">
            <div className="convo">
              <div className="persona"><span className="avatar" aria-hidden="true">T</span>Example: Thandi, a nurse in Durban</div>
              <div className="bub me">Payday was 10 days ago. Can I afford dinner out tonight?</div>
              <div className="bub app"><div className="who">To The Cent</div>Yes - you can safely spend <b>R327</b> today. Rent and your phone contract are already set aside.</div>
            </div>
            <div className="card slip">
              <div className="top"><span className="ic"><Ic d={I.scan} /></span><span><b>Slip read</b><span>Just now · from a photo</span></span></div>
              <div className="field"><span>Shop</span><b>Woolworths Food</b></div>
              <div className="field"><span>Date</span><b>3 Oct 2026</b></div>
              <div className="field"><span>Category</span><b>Groceries</b></div>
              <div className="field"><span>VAT</span><b>R40,75</b></div>
              <div className="field"><span>Total</span><b>R312,40</b></div>
            </div>
            <div className="card match">
              <div className="h">Statement matching</div>
              <div className="m"><span>Woolworths · R312,40</span><span className="ok">✓ Matched</span></div>
              <div className="m"><span>Engen · R650,00</span><span className="ok">✓ Matched</span></div>
              <div className="m"><span>Takealot · R899,00</span><span style={{ color: 'var(--warn)', fontWeight: 700 }}>No slip</span></div>
            </div>
          </div>
        </div>
      </section>

      <section id="business" className="biz">
        <div className="wrap">
          <div className="center reveal">
            <span className="eyebrow">For business</span>
            <h2 className="sec">Tools that fit the business you run.</h2>
            <p className="sub">Tell us what you do when you sign up and the right tools switch on. Change them any time.</p>
          </div>
          <div className="types" role="tablist">
            {BIZ_TYPES.map(t => (
              <button key={t.key} role="tab" aria-selected={bizType === t.key} className={bizType === t.key ? 'on' : ''} onClick={() => setBizType(t.key)} type="button">
                <Ic d={t.icon} />{t.label}
              </button>
            ))}
          </div>
          <div className="types-body" key={bizType}>
            <div className="bizinfo">
              <div className="bfor"><span>Built for</span>{activeType.for}</div>
              <p className="bpain">{activeType.pain}</p>
              <div className="tools">
                {activeType.tools.map(([icon, name, desc, stat], i) => (
                  <div className="tool" key={name} style={{ animationDelay: i * 0.05 + 's' }}>
                    <span className="fi" aria-hidden="true"><Ic d={icon} /></span>
                    <div><b>{name}</b><p>{desc}</p><span className="stat">{stat}</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="preview">
              <BizStory kind={bizType} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="center reveal">
            <span className="eyebrow">Every business gets</span>
            <h2 className="sec">The essentials, done properly.</h2>
          </div>
          <div className="grid3">
            {ESSENTIALS.map(([icon, title, text], i) => (
              <div className={'card ess reveal d' + (i % 3)} key={title}>
                <span className="fi"><Ic d={icon} /></span><h3>{title}</h3><p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="center reveal">
            <span className="eyebrow">How it works</span>
            <h2 className="sec">Up and running in minutes.</h2>
          </div>
          <div className="steps">
            <div className="card step reveal"><div className="n">1</div><h3>Create your account</h3><p>Choose personal or business. For a business, pick what you do and the right tools switch on.</p></div>
            <div className="card step reveal d1"><div className="n">2</div><h3>Add your money</h3><p>Snap slips as you spend and drop in a bank statement whenever it suits you. No bank login.</p></div>
            <div className="card step reveal d2"><div className="n">3</div><h3>See what matters</h3><p>Safe-to-spend, overdue invoices, VAT and what still needs a receipt - all waiting on your home screen.</p></div>
          </div>
        </div>
      </section>

      <section className="sync">
        <div className="wrap split">
          <div className="reveal">
            <span className="eyebrow" style={{ color: 'var(--mint)' }}>Phone and computer</span>
            <h2 className="sec">Start on your phone. Finish on your PC.</h2>
            <p className="sub">Everything is saved to your account within seconds, so the slip you snapped at the till is already there when you sit down to do the books. Invite your accountant or staff with their own access.</p>
          </div>
          <div className="devs reveal d2">
            <div className="dev"><Ic d={I.phone} cls="ic" /><b>Phone</b><span>Snap slips on the go</span></div>
            <span className="synclink"><i /> in sync <i /></span>
            <div className="dev"><Ic d={I.laptop} cls="ic" /><b>Computer</b><span>Invoices &amp; reports</span></div>
          </div>
        </div>
      </section>

      <section id="pricing" className="pricing">
        <div className="wrap">
          <div className="center reveal">
            <span className="eyebrow">Pricing</span>
            <h2 className="sec">Simple pricing. Your first month is free.</h2>
            <p className="sub">Try either plan free for a month. After that it's a simple monthly subscription, and you can cancel any time.</p>
          </div>
          <div className="plans">
            {PLANS.map((pl, i) => (
              <div className={'plan reveal d' + i + (pl.dark ? ' dark' : '')} key={pl.key}>
                <div className="pname">{pl.name}</div>
                <p className="ptag">{pl.tagline}</p>
                <div className="pprice"><span className="rand">R</span>{pl.price}<span className="per">/ month</span></div>
                <div className="pfree">1 month free, then R{pl.price} a month</div>
                {alreadySignedIn
                  ? <a className="btn primary" href="/app/">Open the app <Ic d={I.arrow} /></a>
                  : <button className="btn primary" type="button" onClick={() => openAuth('signup', pl.segment)}>Start your free month <Ic d={I.arrow} /></button>}
                {pl.includes && <div className="pinc">{pl.includes}</div>}
                <ul>
                  {pl.features.map(f => <li key={f}><Ic d={I.check} />{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="pnotes reveal">
            <span><Ic d={I.check} /> One month free on either plan</span>
            <span><Ic d={I.check} /> Monthly subscription</span>
            <span><Ic d={I.check} /> Cancel any time</span>
            <span><Ic d={I.check} /> No bank login, ever</span>
          </div>
          <p className="pfoot">All prices are in South African rand. Questions about which plan fits? <a href="mailto:info@tothecent.co.za">Email us</a>.</p>
        </div>
      </section>

      <section id="security">
        <div className="wrap">
          <div className="center reveal">
            <span className="eyebrow">Security &amp; privacy</span>
            <h2 className="sec">Your money stays yours.</h2>
            <p className="sub">We built To The Cent so you never have to hand over the keys to your bank account.</p>
          </div>
          <div className="sec-grid">
            {SECURITY.map(([icon, title, text], i) => (
              <div className={'card secc reveal d' + (i % 3)} key={title}><span className="fi"><Ic d={icon} /></span><h3>{title}</h3><p>{text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="center reveal">
            <span className="eyebrow">FAQ</span>
            <h2 className="sec">Questions, answered.</h2>
          </div>
          <div className="faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
      </section>

      <section className="final">
        <div className="wrap">
          <div className="box reveal">
            <h2>Take control of every rand.</h2>
            <p>Your budget and your business, on your phone and your computer.</p>
            {alreadySignedIn
              ? <a className="btn primary" href="/app/">Open the app <Ic d={I.arrow} /></a>
              : <button className="btn primary" type="button" onClick={() => openAuth('signup')}>Create your account <Ic d={I.arrow} /></button>}
          </div>
        </div>
      </section>

      <footer className="site">
        <div className="wrap">
          <div className="frow">
            <a className="logo" href="/"><span className="mark">TC</span><span>To The Cent</span></a>
            <div className="flinks">
              <a href="#personal">Personal</a>
              <a href="#business">Business</a>
              <a href="#pricing">Pricing</a>
              <a href="mailto:info@tothecent.co.za">Contact</a>
              <a href="/privacy/">Privacy Policy</a>
              <a href="/terms/">Terms of Service</a>
            </div>
          </div>
          <div className="fcopy">&copy; {new Date().getFullYear()} To The Cent. Built in South Africa. Not a bank, and not financial or tax advice.</div>
        </div>
      </footer>
    </div>
  );
}
