import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useBudget } from '../store/BudgetStore.jsx';
import { useBusiness } from '../store/BusinessStore.jsx';
import { useSheet } from '../components/Sheet.jsx';
import { businessApi } from '../lib/businessApi.js';
import { bookingUrl, slugify, toMin, validSlug } from '../lib/bookingSlots.js';
import { isDemo } from '../lib/demo.js';

const DAYS = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['0', 'Sunday']];
const DEFAULT_HOURS = { 1: ['09:00', '17:00'], 2: ['09:00', '17:00'], 3: ['09:00', '17:00'], 4: ['09:00', '17:00'], 5: ['09:00', '17:00'], 6: ['09:00', '13:00'] };

// The public link for a saved short name. (In the owner portal's preview there
// is no real link, so it points at the example page.)
export const linkFor = slug => (isDemo() ? `${location.origin}/book/?demo=appointments` : bookingUrl(slug));

// SMS used this month, and the test-message button's call.
export function useSmsUsage() {
  const { syncCfg, ensureToken } = useBudget();
  const { business } = useBusiness();
  const [u, setU] = useState(null);
  useEffect(() => {
    if (!business) return;
    if (isDemo()) { setU({ sent: 12, cap: 300 }); return; }
    (async () => {
      try {
        const token = await ensureToken();
        const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/rest/v1/rpc/sms_usage', { method: 'POST', headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_business: business.id }) });
        if (r.ok) setU(await r.json());
      } catch { /* not shown */ }
    })();
  }, [business && business.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return u;
}
async function sendTestSms(syncCfg, ensureToken, businessId, to) {
  if (isDemo()) { await new Promise(r => setTimeout(r, 700)); return { ok: true, demo: true }; }
  const token = await ensureToken();
  const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/booking-sms', {
    method: 'POST', headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', business_id: businessId, to }),
  });
  return r.json().catch(() => ({ ok: false, error: 'Could not reach the SMS service.' }));
}

// The business's online-booking setup, loaded once and reloadable.
export function useBookingSetup() {
  const { syncCfg, ensureToken } = useBudget();
  const { business } = useBusiness();
  const [data, setData] = useState({ loaded: false, settings: null, services: [] });
  const load = useCallback(async () => {
    if (!business) return;
    try {
      const token = await ensureToken();
      const biz = `business_id=eq.${business.id}`;
      const [s, v] = await Promise.all([
        businessApi.select(syncCfg, token, 'booking_settings', `${biz}&select=*`),
        businessApi.select(syncCfg, token, 'booking_services', `${biz}&select=*&order=sort_order.asc,created_at.asc`),
      ]);
      setData({ loaded: true, settings: (s && s[0]) || null, services: v || [] });
    } catch { setData(d => ({ ...d, loaded: true })); }
  }, [syncCfg, ensureToken, business && business.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { ...data, reload: load };
}

// ---------------- the panel ----------------
function OnlineBookingContent({ onChanged }) {
  const { close } = useSheet();
  const { syncCfg, ensureToken } = useBudget();
  const { business, bookings } = useBusiness();
  const setup = useBookingSetup();
  const [f, setF] = useState(null);
  const [svc, setSvc] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [qr, setQr] = useState('');
  const [dayOff, setDayOff] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState(null);
  const [testing, setTesting] = useState(false);
  const usage = useSmsUsage();
  const seq = useRef(0);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  // Fill the form from what's saved - or, the first time, from what we can
  // already see: the business name, past bookings' services and staff.
  useEffect(() => {
    if (!setup.loaded || f) return;
    const s = setup.settings;
    if (s) {
      const hours = {}; DAYS.forEach(([d]) => { const h = (s.hours || {})[d]; hours[d] = h ? { on: true, open: h.open, close: h.close } : { on: false, open: '09:00', close: '17:00' }; });
      setF({ ...s, hours, staff: (s.staff || []).join(', '), days_off: s.days_off || [], headline: s.headline || '', intro: s.intro || '', deposit_note: s.deposit_note || '', contact_phone: s.contact_phone || '' });
      setSvc(setup.services.map(v => ({ ...v, key: v.id })));
    } else {
      const hours = {}; DAYS.forEach(([d]) => { const h = DEFAULT_HOURS[d]; hours[d] = h ? { on: true, open: h[0], close: h[1] } : { on: false, open: '09:00', close: '17:00' }; });
      const seen = {};
      bookings.filter(b => b.service).forEach(b => { const e = seen[b.service] || (seen[b.service] = { n: 0, mins: [], price: 0, deposit: 0 }); e.n++; e.mins.push(+b.duration_min || 60); e.price = +b.price || e.price; e.deposit = +b.deposit || e.deposit; });
      const guess = Object.entries(seen).sort((a, b) => b[1].n - a[1].n).slice(0, 8)
        .map(([name, e]) => ({ key: 'n' + ++seq.current, name, duration_min: e.mins.sort((a, b) => a - b)[Math.floor(e.mins.length / 2)], price: e.price, deposit: e.deposit, active: true }));
      setF({
        slug: slugify(business.name) || 'book', enabled: false, headline: 'Book your appointment', intro: '', approval: 'instant', slot_minutes: 30, min_notice_hours: 2, max_days_ahead: 30,
        sms_reminders: true, reminder_hours: 24, sms_confirm: true,
        hours, days_off: [], staff: [...new Set(bookings.map(b => b.staff_name).filter(Boolean))].join(', '), capacity: 1, deposit_note: '', contact_phone: business.phone || '',
      });
      setSvc(guess.length ? guess : [{ key: 'n' + ++seq.current, name: '', duration_min: 60, price: 0, deposit: 0, active: true }]);
    }
  }, [setup.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = !!setup.settings;
  const url = f ? linkFor(saved ? setup.settings.slug : f.slug) : '';
  useEffect(() => { if (saved && setup.settings.enabled) QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#0A0A0A', light: '#FFFFFF' } }).then(setQr).catch(() => setQr('')); else setQr(''); }, [url, saved, setup.settings && setup.settings.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!f) return <><div className="row"><h1>Online booking</h1><button className="b g sm" onClick={close}>Close</button></div><div className="mini">Loading…</div></>;

  const setService = (key, patch) => setSvc(list => list.map(x => (x.key === key ? { ...x, ...patch } : x)));
  const setHours = (d, patch) => setF(x => ({ ...x, hours: { ...x.hours, [d]: { ...x.hours[d], ...patch } } }));

  async function save() {
    setMsg(null);
    const slug = f.slug.trim().toLowerCase();
    if (!validSlug(slug)) { setMsg({ e: true, t: 'The short name needs 3-40 letters, numbers or dashes, e.g. nomsas-hair.' }); return; }
    const list = svc.filter(x => x.name.trim());
    if (f.enabled && !list.some(x => x.active)) { setMsg({ e: true, t: 'Add at least one service people can book.' }); return; }
    const hours = {};
    for (const [d, label] of DAYS) {
      const h = f.hours[d];
      if (!h.on) continue;
      if (toMin(h.close) <= toMin(h.open)) { setMsg({ e: true, t: `${label}: closing time must be after opening time.` }); return; }
      hours[d] = { open: h.open, close: h.close };
    }
    const staff = [...new Set(String(f.staff).split(/[,\n]/).map(x => x.trim()).filter(Boolean))].slice(0, 20);
    setBusy(true);
    try {
      const token = await ensureToken();
      const row = {
        enabled: !!f.enabled, headline: f.headline.trim() || null, intro: f.intro.trim() || null, approval: f.approval, slot_minutes: +f.slot_minutes,
        min_notice_hours: +f.min_notice_hours, max_days_ahead: +f.max_days_ahead, hours, days_off: [...new Set(f.days_off)].sort(), staff, capacity: Math.max(1, +f.capacity || 1),
        deposit_note: f.deposit_note.trim() || null, contact_phone: f.contact_phone.trim() || null, updated_at: new Date().toISOString(),
        sms_reminders: f.sms_reminders !== false, reminder_hours: +f.reminder_hours || 24, sms_confirm: f.sms_confirm !== false,
      };
      if (saved) {
        await businessApi.update(syncCfg, token, 'booking_settings', `business_id=eq.${business.id}`, { ...row, slug });
      } else {
        // Someone else may already have the short name - try a few variations.
        let ok = false, lastErr = null;
        for (const cand of [slug, ...[2, 3, 4, 5].map(n => `${slug.slice(0, 36)}-${n}`)]) {
          try { await businessApi.insert(syncCfg, token, 'booking_settings', [{ ...row, business_id: business.id, slug: cand }]); set('slug', cand); ok = true; break; }
          catch (e) { lastErr = e; if (!/slug|duplicate|unique/i.test(e.message)) throw e; }
        }
        if (!ok) throw lastErr;
      }
      // services: update, add, remove
      const keep = new Set(list.filter(x => x.id).map(x => x.id));
      await Promise.all(setup.services.filter(x => !keep.has(x.id)).map(x => businessApi.remove(syncCfg, token, 'booking_services', `id=eq.${x.id}`)));
      await Promise.all(list.map((x, i) => {
        const body = { name: x.name.trim().slice(0, 80), duration_min: Math.max(5, Math.min(480, +x.duration_min || 60)), price: Math.max(0, +x.price || 0), deposit: Math.max(0, +x.deposit || 0), active: x.active !== false, sort_order: i };
        return x.id ? businessApi.update(syncCfg, token, 'booking_services', `id=eq.${x.id}`, body) : businessApi.insert(syncCfg, token, 'booking_services', [{ ...body, business_id: business.id }]);
      }));
      await setup.reload(); onChanged && onChanged();
      setMsg({ t: f.enabled ? 'Saved - your booking link is live.' : 'Saved. Switch online booking on when you\'re ready to share the link.' });
      // reload service rows so new ones get their ids
      const fresh = await businessApi.select(syncCfg, token, 'booking_services', `business_id=eq.${business.id}&select=*&order=sort_order.asc,created_at.asc`);
      setSvc((fresh || []).map(v => ({ ...v, key: v.id })));
    } catch (e) {
      setMsg({ e: true, t: /slug|duplicate|unique/i.test(e.message) ? 'That short name is taken - try another.' : e.message });
    } finally { setBusy(false); }
  }

  async function runTest() {
    setTesting(true); setTestMsg(null);
    try {
      const r = await sendTestSms(syncCfg, ensureToken, business.id, testTo.trim() || f.contact_phone);
      setTestMsg(r.ok ? { t: r.demo ? 'Preview: in your real account this sends a test SMS to that number.' : 'Test message sent - check your phone.' } : { e: true, t: r.error || 'Could not send.' });
    } catch (e) { setTestMsg({ e: true, t: e.message }); } finally { setTesting(false); }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(url); setMsg({ t: 'Link copied. Paste it anywhere - WhatsApp status, Instagram bio, Facebook, your email signature.' }); } catch { setMsg({ e: true, t: 'Copy failed - select the link and copy it.' }); } };
  const shareText = `Book your appointment at ${business.name}: ${url}`;

  return (
    <>
      <div className="row"><h1>Online booking</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="mini" style={{ marginBottom: 10 }}>Give clients a link where they pick a service and a free time themselves. You choose what's on offer and when - it all lands in your Bookings.</div>

      <div className="card ob-switch">
        <label className="chk" style={{ margin: 0 }}><input type="checkbox" checked={!!f.enabled} onChange={e => set('enabled', e.target.checked)} /><span><b>Accept online bookings</b></span></label>
        <div className="mini">{f.enabled ? 'On - press Save to publish your changes.' : 'Off - nobody can book through your link.'}</div>
      </div>

      {saved && setup.settings.enabled && (
        <div className="card ob-link">
          <div className="mini" style={{ marginBottom: 4 }}>{isDemo() ? 'In the preview this opens an example page. Your real link looks like this:' : 'Your booking link - share it anywhere'}</div>
          <input readOnly value={isDemo() ? bookingUrl(setup.settings.slug) : url} onFocus={e => e.target.select()} />
          <div className="ob-actions">
            <button className="b sm" onClick={copy}>Copy link</button>
            <a className="b g sm" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
            <a className="b g sm" href={url} target="_blank" rel="noreferrer">Open my page</a>
          </div>
          {qr && (
            <div className="ob-qr">
              <img src={qr} alt="QR code for your booking link" width="140" height="140" />
              <div>
                <b>Print it for your door or counter</b>
                <div className="mini">Clients scan it with their phone camera to book.</div>
                <a className="b g sm" style={{ marginTop: 6 }} href={qr} download={`${f.slug}-booking-qr.png`}>Download QR code</a>
              </div>
            </div>
          )}
        </div>
      )}

      <h2>Services people can book</h2>
      <div className="mini" style={{ marginBottom: 6 }}>{saved ? '' : "We've started this from your past bookings - check and change it."}</div>
      {svc.map(x => (
        <div className="sc-line" key={x.key}>
          <div className="sc-top">
            <input placeholder="Service name, e.g. Box braids" value={x.name} onChange={e => setService(x.key, { name: e.target.value })} />
            <button className="sc-x" aria-label="Remove" onClick={() => setSvc(l => l.filter(y => y.key !== x.key))}>&times;</button>
          </div>
          <div className="sc-nums">
            <label>Minutes<input type="number" inputMode="numeric" value={x.duration_min} onChange={e => setService(x.key, { duration_min: e.target.value })} /></label>
            <label>Price (R)<input type="number" inputMode="decimal" value={x.price} onChange={e => setService(x.key, { price: e.target.value })} /></label>
            <label>Deposit (R)<input type="number" inputMode="decimal" value={x.deposit} onChange={e => setService(x.key, { deposit: e.target.value })} /></label>
          </div>
          <label className="chk" style={{ marginTop: 8 }}><input type="checkbox" checked={x.active !== false} onChange={e => setService(x.key, { active: e.target.checked })} /><span>Show on my booking page</span></label>
        </div>
      ))}
      <button className="b g" style={{ marginTop: 8 }} onClick={() => setSvc(l => [...l, { key: 'n' + ++seq.current, name: '', duration_min: 60, price: 0, deposit: 0, active: true }])}>+ Add a service</button>

      <h2>Opening hours</h2>
      <div className="card ob-hours">
        {DAYS.map(([d, label]) => (
          <div className="ob-day" key={d}>
            <label className="chk" style={{ margin: 0 }}><input type="checkbox" checked={f.hours[d].on} onChange={e => setHours(d, { on: e.target.checked })} /><span>{label}</span></label>
            {f.hours[d].on
              ? <span className="ob-times"><input type="time" value={f.hours[d].open} onChange={e => setHours(d, { open: e.target.value })} /> to <input type="time" value={f.hours[d].close} onChange={e => setHours(d, { close: e.target.value })} /></span>
              : <span className="mini">Closed</span>}
          </div>
        ))}
      </div>
      <label>Days off <span className="mini">holidays, leave - clients can't book these days</span></label>
      <div className="ob-off">
        <input type="date" value={dayOff} onChange={e => setDayOff(e.target.value)} />
        <button className="b g sm" disabled={!dayOff} onClick={() => { set('days_off', [...new Set([...f.days_off, dayOff])].sort()); setDayOff(''); }}>Add</button>
      </div>
      {f.days_off.length > 0 && <div className="ob-chips">{f.days_off.map(d => <span key={d}>{new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}<button aria-label="Remove" onClick={() => set('days_off', f.days_off.filter(x => x !== d))}>&times;</button></span>)}</div>}

      <h2>Who does the work?</h2>
      <label style={{ marginTop: 0 }}>Staff names <span className="mini">separated by commas - leave empty if it's just you</span></label>
      <input value={f.staff} onChange={e => set('staff', e.target.value)} placeholder="Thandeka, Lindiwe, Palesa" />
      {!String(f.staff).trim() && (<><label>How many clients at the same time?</label><input type="number" min="1" max="20" value={f.capacity} onChange={e => set('capacity', e.target.value)} /></>)}
      <div className="mini" style={{ marginTop: 4 }}>With staff listed, clients can pick a person or "anyone free", and two people never get the same stylist at the same time.</div>

      <h2>How bookings work</h2>
      <div className="seg" style={{ margin: 0 }}>
        <button className={f.approval === 'instant' ? 'on' : ''} onClick={() => set('approval', 'instant')}>Confirm instantly</button>
        <button className={f.approval === 'approve' ? 'on' : ''} onClick={() => set('approval', 'approve')}>I approve each one</button>
      </div>
      <div className="mini" style={{ marginTop: 4 }}>{f.approval === 'instant' ? 'The booking is confirmed as soon as the client books. The slot is taken straight away.' : 'Bookings arrive as requests under "Awaiting your OK". The slot is held while you decide.'}</div>
      <div className="biz-grid" style={{ marginTop: 10 }}>
        <div><label style={{ marginTop: 0 }}>Earliest booking</label>
          <select value={f.min_notice_hours} onChange={e => set('min_notice_hours', e.target.value)}>{[[0, 'Any time'], [1, '1 hour ahead'], [2, '2 hours ahead'], [4, '4 hours ahead'], [12, '12 hours ahead'], [24, '1 day ahead'], [48, '2 days ahead']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label style={{ marginTop: 0 }}>Furthest ahead</label>
          <select value={f.max_days_ahead} onChange={e => set('max_days_ahead', e.target.value)}>{[[14, '2 weeks'], [30, '1 month'], [60, '2 months'], [90, '3 months']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label style={{ marginTop: 0 }}>Time slots every</label>
          <select value={f.slot_minutes} onChange={e => set('slot_minutes', e.target.value)}>{[[15, '15 min'], [30, '30 min'], [60, '1 hour']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>

      <h2>Automatic SMS reminders</h2>
      <div className="card ob-sms">
        <label className="chk" style={{ margin: 0 }}><input type="checkbox" checked={f.sms_reminders !== false} onChange={e => set('sms_reminders', e.target.checked)} /><span><b>Remind clients by SMS</b> before their appointment</span></label>
        {f.sms_reminders !== false && (
          <>
            <label>Send it</label>
            <select value={f.reminder_hours} onChange={e => set('reminder_hours', e.target.value)}>
              {[[2, '2 hours before'], [3, '3 hours before'], [6, '6 hours before'], [12, '12 hours before'], [24, '1 day before'], [48, '2 days before']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </>
        )}
        <label className="chk" style={{ marginTop: 12 }}><input type="checkbox" checked={f.sms_confirm !== false} onChange={e => set('sms_confirm', e.target.checked)} /><span>Text clients when an online booking is confirmed - or can't go ahead</span></label>
        <div className="ob-sample">
          <div className="mini">What a reminder looks like</div>
          <p>Hi Thandi, reminder: Box braids at {business.name.slice(0, 26)} tomorrow at 10:00.{f.contact_phone ? ` To change, call/WhatsApp ${f.contact_phone}.` : ''} See you!</p>
        </div>
        <div className="mini">Sent automatically, for online bookings and ones you add yourself (if you enter the client's phone number). Included in your plan{usage ? ` - ${usage.sent} of ${usage.cap} sent this month` : ''}.</div>
        <label>Try it: send a test SMS to</label>
        <div className="ob-off">
          <input type="tel" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder={f.contact_phone || '082 123 4567'} />
          <button className="b g sm" disabled={testing} onClick={runTest}>{testing ? 'Sending…' : 'Send test'}</button>
        </div>
        {testMsg && <div className={'msg ' + (testMsg.e ? 'e' : 's')}>{testMsg.t}</div>}
      </div>

      <h2>What clients see</h2>
      <label style={{ marginTop: 0 }}>Heading</label><input value={f.headline} onChange={e => set('headline', e.target.value)} placeholder="Book your appointment" />
      <label>Welcome message <span className="mini">optional</span></label><textarea rows="2" value={f.intro} onChange={e => set('intro', e.target.value)} placeholder="e.g. Please arrive 5 minutes early. Bring a photo of the style you want." />
      <label>How to pay the deposit <span className="mini">shown to clients when a deposit is set</span></label><textarea rows="2" value={f.deposit_note} onChange={e => set('deposit_note', e.target.value)} placeholder="e.g. EFT to FNB 62 0000 0000, use your name as the reference." />
      <label>Your WhatsApp number <span className="mini">so clients can message you after booking</span></label><input type="tel" value={f.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="082 123 4567" />
      <label>Short name in your link <span className="mini">{saved ? 'changing it breaks links you already shared' : ''}</span></label>
      <input value={f.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
      <div className="mini" style={{ marginTop: 4 }}>{bookingUrl(f.slug || 'your-name')}</div>

      {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
      <div style={{ height: 12 }} />
      <button className="b" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      <div style={{ height: 24 }} />
    </>
  );
}

// What has been texted for each booking: { [bookingId]: { reminder: 'sent', confirmation: 'failed', ... } }
export function useSmsLog(refreshKey) {
  const { syncCfg, ensureToken } = useBudget();
  const { business } = useBusiness();
  const [log, setLog] = useState({});
  useEffect(() => {
    if (!business) return;
    (async () => {
      try {
        const token = await ensureToken();
        const rows = await businessApi.select(syncCfg, token, 'sms_outbox', `business_id=eq.${business.id}&booking_id=not.is.null&select=booking_id,kind,status&order=created_at.desc&limit=1000`);
        const m = {};
        (rows || []).forEach(r => { (m[r.booking_id] = m[r.booking_id] || {})[r.kind] = r.status; });
        setLog(m);
      } catch { /* the status just isn't shown */ }
    })();
  }, [business && business.id, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return log;
}

export function useOnlineBookingSheet() {
  const { open } = useSheet();
  return (onChanged) => open(() => <OnlineBookingContent onChanged={onChanged} />);
}

