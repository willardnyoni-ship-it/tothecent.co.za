import { useEffect, useRef, useState } from 'react';

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
    if (hp.get('type') === 'recovery' && hp.get('access_token')) {
      recoverRef.current = { token: hp.get('access_token'), refresh: hp.get('refresh_token'), expiresIn: hp.get('expires_in') };
      history.replaceState(null, '', location.pathname + location.search);
      openAuth('recover');
    }
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
        location.href = '/app/';
      } catch (err) { setMsg(err.message); } finally { setBusy(false); }
      return;
    }
    if (authMode === 'signup' && !segment) { setMsg('Choose Individual or Business to continue.'); return; }
    if (!email.trim() || !pass) { setMsg('Email and password are both needed.'); return; }
    if (authMode === 'signup' && pass.length < 6) { setMsg('Password must be at least 6 characters.'); return; }
    setMsg('Working…'); setBusy(true);
    try {
      if (authMode === 'signin') {
        const d = await authFetch('/auth/v1/token?grant_type=password', { email: email.trim(), password: pass });
        saveSession(d);
        location.href = '/app/';
      } else {
        const d = await authFetch('/auth/v1/signup', { email: email.trim(), password: pass, data: { segment } });
        if (d.access_token) {
          saveSession(d);
          location.href = segment === 'business' ? '/app/?mode=business' : '/app/?onboard=1';
        }
        else setMsg('Check your email to confirm the account, then log in.');
      }
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }

  const isRecover = authMode === 'recover';

  return (
    <div ref={rootRef}>
      <div className="glow" />

      {authOpen && (
        <div className="authOverlay on" id="authOverlay" onClick={e => { if (e.target.id === 'authOverlay') closeAuth(); }}>
          <div className="authBox">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{isRecover ? 'Set a new password' : 'Your account'}</h3>
              <button className="authClose" onClick={closeAuth} aria-label="Close">&times;</button>
            </div>
            <p className="mini" style={{ marginTop: 6 }}>
              {isRecover ? 'Choose a new password for your account.' : 'Same account, works in the app on any device.'}
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
      </div>
    </div>
  );
}
