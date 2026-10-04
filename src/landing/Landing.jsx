import { useEffect, useRef, useState } from 'react';
import { classifySignupError, reportSignupAttempt } from '../lib/signupAttempts.js';

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
  const [busy, setBusy] = useState(false);
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);
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

  function openAuth(mode) {
    setAuthModeState(mode || 'signin');
    setSegment('');
    setMsg('');
    setAuthOpen(true);
    setTimeout(() => (mode === 'recover' ? passRef : emailRef).current?.focus(), 150);
  }
  function closeAuth() { setAuthOpen(false); }

  async function forgotPassword() {
    if (!email.trim()) { setMsg('Enter your email above first.'); return; }
    setMsg('Sending…');
    try {
      const redirect = encodeURIComponent(location.href.split('#')[0].split('?')[0]);
      await authFetch('/auth/v1/recover?redirect_to=' + redirect, { email: email.trim() });
      setMsg('Check your email for a reset link.');
    } catch (err) { setMsg(err.message); }
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
    if (authMode === 'signup' && !segment) { setMsg('Choose Individual or Business to continue.'); if (email.trim()) report('failed', 'form', 'no_plan'); return; }
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
        if (d && d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0 && !d.access_token) {
          report('failed', 'server', 'already_registered', 'Email already has an account');
          setMsg('There is already an account with this email. Log in instead, or use "Forgot password?" below.');
          setAuthModeState('signin');
          return;
        }
        report('succeeded', 'server', d.access_token ? 'signed_in' : 'confirm_email');
        if (d.access_token) {
          saveSession(d);
          location.href = segment === 'business' ? '/app/?mode=business' : '/app/?onboard=1';
        }
        else setMsg('Check your email to confirm the account, then log in.');
      }
    } catch (err) {
      if (authMode === 'signup') {
        const reason = classifySignupError(err.message);
        report('failed', reason === 'network' ? 'network' : 'server', reason, err.message);
        if (reason === 'already_registered') { setMsg('There is already an account with this email. Log in instead, or use "Forgot password?" below.'); setAuthModeState('signin'); return; }
        if (reason === 'rate_limited') { setMsg("We're getting a lot of sign-ups right now and couldn't send your confirmation email. Please try again in a few minutes."); return; }
      }
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  const isRecover = authMode === 'recover';

  return (
    <div ref={rootRef}>
      <div className="glow" />

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
            <button className="btn" disabled={busy} onClick={submitAuth} type="button">
              {isRecover ? 'Set new password' : authMode === 'signin' ? 'Log in' : 'Create account'}
            </button>
            {!isRecover && (
              <p className="mini" style={{ margin: '10px 0 0', textAlign: 'center' }}>
                <a href="#" onClick={e => { e.preventDefault(); forgotPassword(); }} style={{ color: 'var(--blue)' }}>Forgot password?</a>
              </p>
            )}
            <div className="mini" style={{ marginTop: 12, minHeight: 18 }}>{msg}</div>
          </div>
        </div>
      )}

      <div className="wrap">
        <div className="topnav">
          {alreadySignedIn
            ? <button className="loginlink" onClick={() => { location.href = '/app/'; }} type="button">Open app &rarr;</button>
            : <button className="loginlink" onClick={() => openAuth('signin')} type="button">Log in</button>}
        </div>

        <section style={{ paddingTop: 56 }}>
          <div className="hero-grid">
            <div>
              <h1 className="reveal">EVERY RAND, DOWN TO THE CENT.</h1>
              <p className="lede reveal d2">Upload your financial data. We organize it, understand it, and tell you what matters.</p>
              <div style={{ height: 30 }} />
              <button className="btn reveal d3" style={{ maxWidth: 300 }} onClick={() => openAuth('signup')}>Get started</button>
            </div>

            <div className="reveal d2">
              <div className="phone" id="phone">
                <div className="scan" />
                <div className="notch" />
                <div className="pcard phero">
                  <div className="plbl">Safe to spend today</div>
                  <div className="pbig" data-count="327" data-prefix="R">R0</div>
                  <div className="pnote">R1 309 left this week (week 1 of 5)<br />R3 499 of bills still to come</div>
                </div>
                <div className="pcard">
                  <div className="prow"><span className="mini" style={{ fontSize: 18 }}>Spent</span>
                    <span className="mini" style={{ fontSize: 18 }}>Budget</span></div>
                  <div className="prow" style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
                    <span data-count="35" data-prefix="R">R0</span>
                    <span style={{ color: 'var(--dim)' }} data-count="10219" data-prefix="R">R0</span></div>
                  <div className="pbar"><i style={{ width: '4%' }} /></div>
                </div>
                <div className="pcard">
                  <div className="prow" style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 18 }}>Still to come</span>
                    <span style={{ fontWeight: 800, fontSize: 18 }} data-count="3499" data-prefix="R">R0</span></div>
                  <div className="pline"><span><span className="n">Rent</span><br /><span className="s">usually the 4th</span></span><span>R2 519</span></div>
                  <div className="pline"><span><span className="n">Internet</span><br /><span className="s">usually the 15th</span></span><span>R715</span></div>
                  <div className="pline"><span><span className="n">Laundry</span><br /><span className="s">usually the 14th</span></span><span>R80</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="reveal">
          <h2 className="sec-h">How it works</h2>
          <p className="sec-sub">Four things, in either order - snap slips as you spend, drop in a statement whenever suits you.</p>
          <div className="grid four">
            <div className="feature"><div className="num">1</div><h3>Snap a slip</h3><p>Photograph a till slip and the amount, date and merchant are read for you - no typing.</p></div>
            <div className="feature"><div className="num">2</div><h3>Import a statement</h3><p>Download a CSV or PDF from your bank's own app and drop it in. Capitec, FNB, Standard Bank, Absa, Nedbank - no bank login, ever.</p></div>
            <div className="feature"><div className="num">3</div><h3>It reconciles itself</h3><p>Slips you logged are matched against the statement automatically, so you can see what's accounted for and what still needs a receipt.</p></div>
            <div className="feature"><div className="num">4</div><h3>See what matters</h3><p>A daily safe-to-spend number that already accounts for upcoming bills, category budgets, and a monthly review of where it actually went.</p></div>
          </div>
        </section>

        <section className="reveal" style={{ paddingTop: 10 }}>
          <h2 className="sec-h">About</h2>
          <div className="about-card">
            <p>To The Cent is built in South Africa, for the way people actually get paid and spend here - pay-day-to-pay-day budgeting, till slips, and bank statements from the big five, not a generic monthly calendar built for somewhere else.</p>
            <p>Your account keeps everything in sync, so your budget and your business are the same on your phone and your computer. And we will never ask you to hand over a bank login.</p>
            <p style={{ marginTop: 16 }}>Questions, feedback, or something not working right? <a href="mailto:info@tothecent.co.za">info@tothecent.co.za</a></p>
          </div>
        </section>
      </div>

      <footer className="site">
        <div className="wrap">
          <div className="frow">
            <div className="fbrand">To The Cent</div>
            <div className="flinks">
              <a href="mailto:info@tothecent.co.za">Contact</a>
              <a href="/privacy/">Privacy Policy</a>
              <a href="/terms/">Terms of Service</a>
            </div>
          </div>
          <div className="fcopy">&copy; {new Date().getFullYear()} To The Cent. Built in South Africa.</div>
        </div>
      </footer>
    </div>
  );
}
