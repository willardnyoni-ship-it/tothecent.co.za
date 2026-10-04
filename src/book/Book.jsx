import { useEffect, useMemo, useRef, useState } from 'react';
import { book, demoMode, getBusy, getPage, slugFromUrl } from '../lib/bookApi.js';
import { addDays, dayAvailability, icsFor, slotsFor } from '../lib/bookingSlots.js';

const money = n => 'R' + Math.round(+n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const longDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
const hrs = m => (m < 60 ? m + ' min' : m % 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m / 60 + ' h');
const waNumber = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('0') ? '27' + d.slice(1) : d; };

const ERRORS = {
  slot_taken: 'Sorry - that time was just taken. Please pick another.',
  too_soon: "That time is too soon to book online. Please pick a later one, or message us.",
  too_far: "That's further ahead than we take bookings. Please pick an earlier day.",
  closed: "We're not open at that time. Please pick another.",
  bad_input: 'Please check your name and phone number.',
  too_many: "You already have several upcoming bookings with us. Please message us to change one.",
  rate_limited: "We're getting a lot of requests right now. Please try again in a few minutes.",
  unavailable: 'Online booking is switched off right now.',
};

export default function Book() {
  const slug = slugFromUrl();
  const [status, setStatus] = useState('loading'); // loading | missing | error | ready
  const [page, setPage] = useState(null);
  const [busy, setBusy] = useState([]);
  const [step, setStep] = useState(1);
  const [service, setService] = useState(null);
  const [staff, setStaff] = useState('any');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', note: '' });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const top = useRef(null);

  async function loadBusy(p) {
    const from = p.now.slice(0, 10);
    try { setBusy((await getBusy(slug, from, addDays(from, Math.min(62, p.max_days_ahead || 30)))) || []); } catch { /* the server still checks on booking */ }
  }
  useEffect(() => {
    (async () => {
      if (!slug && !demoMode()) { setStatus('missing'); return; }
      try {
        const p = await getPage(slug);
        if (!p) { setStatus('missing'); return; }
        document.title = 'Book at ' + p.name;
        setPage(p); await loadBusy(p); setStatus('ready');
      } catch { setStatus('error'); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = n => { setStep(n); setErr(''); setTimeout(() => top.current && top.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); };

  const days = useMemo(() => (page && service ? dayAvailability({ durationMin: service.duration_min, settings: page, busy, now: page.now, staff }) : []), [page, service, busy, staff]);
  const slots = useMemo(() => (page && service && date ? slotsFor({ date, durationMin: service.duration_min, settings: page, busy, now: page.now, staff }) : []), [page, service, busy, staff, date]);

  // When the service or person changes, land on the first day that has room.
  useEffect(() => {
    if (!days.length) return;
    if (!date || !days.find(d => d.date === date && d.free > 0)) {
      const first = days.find(d => d.free > 0);
      setDate(first ? first.date : ''); setTime('');
    }
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (form.name.trim().length < 2) { setErr('Please enter your name.'); return; }
    if (form.phone.replace(/\D/g, '').length < 9) { setErr('Please enter a phone number we can reach you on.'); return; }
    setSending(true); setErr('');
    try {
      const r = await book(slug, { service: service.id, date, time, staff: staff === 'any' ? '' : staff, name: form.name.trim(), phone: form.phone.trim(), note: form.note.trim() });
      if (r && r.ok) { setDone(r); go(4); return; }
      setErr(ERRORS[r && r.error] || 'Something went wrong. Please try again.');
      if (r && ['slot_taken', 'closed', 'too_soon'].includes(r.error)) { setTime(''); await loadBusy(page); setStep(2); }
    } catch { setErr("Couldn't reach the booking system. Check your connection and try again."); } finally { setSending(false); }
  }

  function calendarFile() {
    const ics = icsFor({ title: `${done.service} at ${done.business}`, date: done.date, time: done.time, end: done.end, description: `Booking reference ${done.reference}` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'booking.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function again() { setDone(null); setService(null); setDate(''); setTime(''); setStaff('any'); setForm({ name: form.name, phone: form.phone, note: '' }); loadBusy(page); go(1); }

  if (status === 'loading') return <Shell><div className="bk-center"><div className="bk-spin" /></div></Shell>;
  if (status === 'missing') return <Shell><div className="bk-card bk-center"><h1>This booking link isn't active</h1><p>It may have been switched off or typed wrongly. Please ask the business for their current link.</p></div></Shell>;
  if (status === 'error') return <Shell><div className="bk-card bk-center"><h1>Couldn't load</h1><p>Please check your connection and refresh the page.</p></div></Shell>;

  const approval = page.approval === 'approve';
  const Steps = () => (
    <ol className="bk-steps" aria-label="Progress">
      {['Service', 'Time', 'Your details'].map((l, i) => <li key={l} className={step === i + 1 ? 'on' : step > i + 1 ? 'past' : ''}><span>{step > i + 1 ? '✓' : i + 1}</span>{l}</li>)}
    </ol>
  );

  return (
    <Shell demo={demoMode()}>
      <header className="bk-head" ref={top}>
        <h1>{page.name}</h1>
        <p className="bk-lead">{page.headline || 'Book an appointment'}</p>
        {page.intro && <p className="bk-intro">{page.intro}</p>}
      </header>

      {step < 4 && <Steps />}

      {step === 1 && (
        <section>
          <h2>Choose a service</h2>
          {page.services.length === 0 && <div className="bk-card">No services are open for booking right now. Please message us instead.</div>}
          {page.services.map(s => (
            <button key={s.id} className={'bk-service' + (service && service.id === s.id ? ' on' : '')} onClick={() => { setService(s); go(2); }}>
              <span><b>{s.name}</b><small>{hrs(s.duration_min)}{+s.deposit > 0 ? ` · ${money(s.deposit)} deposit` : ''}</small></span>
              <strong>{+s.price > 0 ? money(s.price) : ''}</strong>
            </button>
          ))}
        </section>
      )}

      {step === 2 && service && (
        <section>
          <button className="bk-back" onClick={() => go(1)}>← {service.name}</button>
          {page.staff.length > 0 && (
            <>
              <h2>Who with?</h2>
              <div className="bk-chips">
                {['any', ...page.staff].map(s => <button key={s} className={staff === s ? 'on' : ''} onClick={() => { setStaff(s); setTime(''); }}>{s === 'any' ? 'Anyone free' : s}</button>)}
              </div>
            </>
          )}
          <h2>Pick a day</h2>
          <div className="bk-days" role="listbox" aria-label="Days">
            {days.filter(d => !d.closed).map(d => {
              const dt = new Date(d.date + 'T12:00:00');
              return (
                <button key={d.date} role="option" aria-selected={date === d.date} disabled={d.free === 0} className={date === d.date ? 'on' : ''} onClick={() => { setDate(d.date); setTime(''); }}>
                  <small>{dt.toLocaleDateString('en-ZA', { weekday: 'short' })}</small>
                  <b>{dt.getDate()}</b>
                  <small>{dt.toLocaleDateString('en-ZA', { month: 'short' })}</small>
                </button>
              );
            })}
          </div>
          {days.every(d => d.free === 0) && <div className="bk-card">There's no room in the next few weeks. Please message us.</div>}
          {date && (
            <>
              <h2>{longDay(date)}</h2>
              {slots.length ? (
                <div className="bk-times">
                  {slots.map(s => <button key={s.time} className={time === s.time ? 'on' : ''} onClick={() => setTime(s.time)}>{s.time}</button>)}
                </div>
              ) : <div className="bk-card">No free times on this day.</div>}
            </>
          )}
          {err && <div className="bk-err">{err}</div>}
          <button className="bk-go" disabled={!time} onClick={() => go(3)}>Continue</button>
        </section>
      )}

      {step === 3 && service && (
        <section>
          <button className="bk-back" onClick={() => go(2)}>← Change time</button>
          <div className="bk-card bk-summary">
            <div><b>{service.name}</b><span>{hrs(service.duration_min)}</span></div>
            <div><span>{longDay(date)}</span><b>{time}</b></div>
            {staff !== 'any' && <div><span>With</span><b>{staff}</b></div>}
            {+service.price > 0 && <div><span>Price</span><b>{money(service.price)}</b></div>}
          </div>
          <h2>Your details</h2>
          <label>Your name<input autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label>Phone number <small>so we can confirm or reach you</small><input type="tel" inputMode="tel" autoComplete="tel" placeholder="082 123 4567" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Anything we should know? <small>optional</small><textarea rows="2" maxLength="300" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
          {+service.deposit > 0 && (
            <div className="bk-card bk-deposit"><b>{money(service.deposit)} deposit</b>{page.deposit_note ? <p>{page.deposit_note}</p> : <p>We'll message you how to pay it.</p>}</div>
          )}
          {err && <div className="bk-err">{err}</div>}
          <button className="bk-go" disabled={sending} onClick={submit}>{sending ? 'Booking…' : approval ? 'Send booking request' : 'Confirm booking'}</button>
          <p className="bk-fine">{approval ? `${page.name} will confirm your request by phone or WhatsApp.` : 'You\'ll see your confirmation straight away.'}</p>
        </section>
      )}

      {step === 4 && done && (
        <section className="bk-done">
          <div className="bk-tick">{done.status === 'requested' ? '…' : '✓'}</div>
          <h2>{done.status === 'requested' ? 'Request sent' : "You're booked!"}</h2>
          <p>{done.status === 'requested' ? `${done.business} will confirm your booking shortly.` : `See you at ${done.business}.`}</p>
          <div className="bk-card bk-summary">
            <div><b>{done.service}</b>{done.staff && <span>with {done.staff}</span>}</div>
            <div><span>{longDay(done.date)}</span><b>{done.time}–{done.end}</b></div>
            {+done.price > 0 && <div><span>Price</span><b>{money(done.price)}</b></div>}
            <div><span>Reference</span><b>{done.reference}</b></div>
          </div>
          {+done.deposit_due > 0 && <div className="bk-card bk-deposit"><b>Deposit: {money(done.deposit_due)}</b>{done.deposit_note ? <p>{done.deposit_note}</p> : <p>{done.business} will message you how to pay it.</p>}</div>}
          <button className="bk-go" onClick={calendarFile}>Add to my calendar</button>
          {done.contact_phone && (
            <a className="bk-go alt" href={`https://wa.me/${waNumber(done.contact_phone)}?text=${encodeURIComponent(`Hi, it's ${form.name} - booking ref ${done.reference} for ${done.service} on ${longDay(done.date)} at ${done.time}.`)}`} target="_blank" rel="noreferrer">Message {done.business} on WhatsApp</a>
          )}
          <button className="bk-link" onClick={again}>Book another appointment</button>
        </section>
      )}
    </Shell>
  );
}

function Shell({ children, demo }) {
  return (
    <div className="bk">
      {demo && <div className="bk-demo"><b>Preview</b> This is how clients see your page. Bookings made here aren't real.</div>}
      <main className="bk-main">{children}</main>
      <footer className="bk-foot">Booking page by <a href="https://tothecent.co.za/">To The Cent</a></footer>
    </div>
  );
}
