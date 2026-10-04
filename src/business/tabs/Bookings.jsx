import { useMemo, useState } from 'react';
import { useBusiness } from '../../store/BusinessStore.jsx';
import { R, R2, iso } from '../../lib/format.js';
import { openWhatsApp } from '../share.js';
import { linkFor, useBookingSetup, useOnlineBookingSheet } from '../OnlineBooking.jsx';

const STATUS_LABEL = { requested: 'Needs your OK', booked: 'Booked', done: 'Done', no_show: 'No-show', cancelled: 'Cancelled' };

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d);
}
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d);
}
function endTime(start, mins) {
  const [h, m] = start.split(':').map(Number);
  const t = h * 60 + m + (+mins || 0);
  return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
const blank = date => ({ date, start_time: '09:00', duration_min: 60, client_name: '', client_phone: '', customer_id: '', service: '', staff_name: '', price: '', deposit: '', notes: '' });

export default function Bookings() {
  const { business, bookings, customers, addRow, updateRow, addTransaction, myRole } = useBusiness();
  const readOnly = myRole === 'accountant';
  const today = iso(new Date());
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank(today));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const setup = useBookingSetup();
  const openOnline = useOnlineBookingSheet();
  const online = setup.settings && setup.settings.enabled;
  const [copied, setCopied] = useState(false);
  // Online requests waiting for the owner's OK (when they chose to approve each one).
  const requests = bookings.filter(b => b.status === 'requested' && b.date >= today).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));

  const weekStart = mondayOf(day);
  const week = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const live = bookings.filter(b => b.status !== 'cancelled');
  const dayList = bookings.filter(b => b.date === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const staffNames = [...new Set(bookings.map(b => b.staff_name).filter(Boolean))];
  const services = [...new Set(bookings.map(b => b.service).filter(Boolean))];

  const monthKey = today.slice(0, 7);
  const month = useMemo(() => {
    const m = bookings.filter(b => b.date.slice(0, 7) === monthKey);
    const done = m.filter(b => b.status === 'done');
    const noShow = m.filter(b => b.status === 'no_show');
    const decided = done.length + noShow.length;
    const perStaff = {};
    done.forEach(b => { const k = b.staff_name || 'Unassigned'; perStaff[k] = perStaff[k] || { n: 0, total: 0 }; perStaff[k].n++; perStaff[k].total += +b.price; });
    return { revenue: done.reduce((a, b) => a + +b.price, 0), done: done.length, noShowRate: decided ? Math.round(noShow.length / decided * 100) : 0, perStaff };
  }, [bookings, monthKey]);

  // Two bookings for the same staff member overlap if one starts before
  // the other ends - warn, but don't block (double-booking is sometimes on
  // purpose, e.g. colour processing while cutting someone else).
  const clash = adding && live.find(b => b.date === f.date && (b.staff_name || '') === (f.staff_name || '')
    && b.start_time < endTime(f.start_time, f.duration_min) && f.start_time < endTime(b.start_time, b.duration_min));

  function pickCustomer(id) {
    const c = customers.find(x => x.id === id);
    setF(x => ({ ...x, customer_id: id, client_name: c ? c.name : x.client_name, client_phone: c?.phone || x.client_phone }));
  }

  async function save() {
    if (!f.client_name.trim()) { setMsg({ e: true, t: "Enter the client's name." }); return; }
    setBusy(true); setMsg(null);
    try {
      const deposit = +f.deposit || 0;
      await addRow('bookings', { ...f, customer_id: f.customer_id || null, price: +f.price || 0, deposit, duration_min: +f.duration_min || 60 });
      if (deposit > 0) {
        await addTransaction({ amount: deposit, kind: 'income', category: 'Deposits', description: `Deposit - ${f.client_name} ${f.date} ${f.start_time}`, date: today, status: 'reviewed', source: 'booking' });
      }
      setDay(f.date); setAdding(false); setF(blank(f.date));
    } catch (e) { setMsg({ e: true, t: e.message }); } finally { setBusy(false); }
  }

  // Done: record what's left to collect (the deposit was already recorded
  // as income when it was taken). No-show: the deposit is kept, nothing
  // more comes in.
  async function markDone(b) {
    const due = Math.max(0, +b.price - +b.deposit);
    await updateRow('bookings', b.id, { status: 'done' });
    if (due > 0) {
      await addTransaction({ amount: due, kind: 'income', category: 'Sales', description: `${b.service || 'Booking'} - ${b.client_name || 'client'}${b.staff_name ? ' (' + b.staff_name + ')' : ''}`, date: b.date, status: 'reviewed', source: 'booking' });
    }
  }

  const whenText = b => new Date(b.date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }) + ' at ' + b.start_time;
  async function approve(b) {
    await updateRow('bookings', b.id, { status: 'booked' });
    if (b.client_phone) openWhatsApp(b.client_phone, `Hi ${(b.client_name || '').split(' ')[0]}, your ${b.service ? b.service + ' ' : ''}booking at ${business.name} on ${whenText(b)} is confirmed.${+b.deposit_due > 0 ? ` Please pay the deposit of ${R2(+b.deposit_due)} to hold your slot.` : ''} See you then!`);
  }
  async function decline(b) {
    await updateRow('bookings', b.id, { status: 'cancelled' });
    if (b.client_phone) openWhatsApp(b.client_phone, `Hi ${(b.client_name || '').split(' ')[0]}, sorry - we can't fit your ${b.service ? b.service + ' ' : ''}booking on ${whenText(b)}. Please pick another time on our booking link, or reply here and we'll find one that works.`);
  }
  // The client was asked for a deposit online; record it once it arrives.
  async function depositReceived(b) {
    const due = +b.deposit_due;
    await updateRow('bookings', b.id, { deposit: due });
    await addTransaction({ amount: due, kind: 'income', category: 'Deposits', description: `Deposit - ${b.client_name} ${b.date} ${b.start_time}`, date: today, status: 'reviewed', source: 'booking' });
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(linkFor(setup.settings.slug)); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { /* ignore */ }
  }

  function remind(b) {
    const when = new Date(b.date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
    openWhatsApp(b.client_phone, `Hi ${(b.client_name || '').split(' ')[0]}, this is a reminder of your ${b.service ? b.service + ' ' : ''}booking at ${business.name} on ${when} at ${b.start_time}. Reply to let us know if you can't make it. See you then!`);
  }

  return (
    <section className="tab on light-tab">
      <h1>Bookings</h1>
      <div className="biz-cards">
        <div className="biz-card"><div className="lbl">Today</div><div className="val">{live.filter(b => b.date === today).length}</div></div>
        <div className="biz-card"><div className="lbl">Earned this month</div><div className="val">{R(month.revenue)}</div></div>
        <div className="biz-card"><div className="lbl">Done this month</div><div className="val">{month.done}</div></div>
        <div className="biz-card"><div className="lbl">No-show rate</div><div className={'val' + (month.noShowRate >= 15 ? ' bd' : '')}>{month.noShowRate}%</div></div>
      </div>

      {requests.length > 0 && (
        <div className="card bk-requests">
          <div className="row"><h2 style={{ marginTop: 0 }}>Awaiting your OK</h2><span className="rc-pill warn">{requests.length}</span></div>
          {requests.map(b => (
            <div className="bk-req" key={b.id}>
              <div>
                <div style={{ fontWeight: 700 }}>{b.client_name} &middot; {b.service || 'Booking'}</div>
                <div className="tag">{whenText(b)}{b.staff_name ? ' · ' + b.staff_name : ''}{+b.price ? ' · ' + R2(+b.price) : ''}{+b.deposit_due ? ' · deposit ' + R2(+b.deposit_due) : ''}</div>
                {b.notes && <div className="mini" style={{ marginTop: 2 }}>&ldquo;{b.notes}&rdquo;</div>}
                {b.client_phone && <div className="mini">{b.client_phone}</div>}
              </div>
              {!readOnly && (
                <div className="bk-req-btns">
                  <button className="b sm" style={{ width: 'auto' }} onClick={() => approve(b)}>Approve</button>
                  <button className="b d sm" style={{ width: 'auto' }} onClick={() => decline(b)}>Decline</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && setup.loaded && (
        <div className={'card bk-online' + (online ? ' on' : '')}>
          {online ? (
            <>
              <div className="row"><div><b>Online booking is on</b><div className="mini">Clients book themselves from your link.</div></div><button className="b g sm" style={{ width: 'auto' }} onClick={() => openOnline(setup.reload)}>Manage</button></div>
              <div className="bk-linkrow"><span>{linkFor(setup.settings.slug).replace(/^https?:\/\//, '')}</span><button className="b sm" style={{ width: 'auto' }} onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button></div>
            </>
          ) : (
            <div className="row">
              <div><b>Let clients book themselves</b><div className="mini">Get a link to share on WhatsApp, Instagram or your door. They pick a service and a free time - you stay in control.</div></div>
              <button className="b sm" style={{ width: 'auto' }} onClick={() => openOnline(setup.reload)}>{setup.settings ? 'Switch on' : 'Set up'}</button>
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="b g sm" style={{ width: 'auto' }} onClick={() => setDay(addDays(day, -7))}>&larr;</button>
        <div className="biz-week">
          {week.map(d => {
            const n = live.filter(b => b.date === d).length;
            const dt = new Date(d + 'T12:00:00');
            return (
              <button key={d} className={(d === day ? 'on ' : '') + (d === today ? 'today' : '')} onClick={() => setDay(d)}>
                <span>{dt.toLocaleDateString('en-ZA', { weekday: 'short' })}</span>
                <b>{dt.getDate()}</b>
                <i>{n || ''}</i>
              </button>
            );
          })}
        </div>
        <button className="b g sm" style={{ width: 'auto' }} onClick={() => setDay(addDays(day, 7))}>&rarr;</button>
      </div>

      {!readOnly && (adding ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>New booking</h2>
          {customers.length > 0 && (
            <>
              <label style={{ marginTop: 0 }}>Existing customer</label>
              <select value={f.customer_id} onChange={e => pickCustomer(e.target.value)}>
                <option value="">New / walk-in client</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          )}
          <label>Client name</label>
          <input value={f.client_name} onChange={e => set('client_name', e.target.value)} />
          <label>Client phone <span className="mini">(for WhatsApp reminders)</span></label>
          <input value={f.client_phone} onChange={e => set('client_phone', e.target.value)} placeholder="082 123 4567" />
          <div className="biz-grid" style={{ marginTop: 10 }}>
            <input type="date" value={f.date} onChange={e => set('date', e.target.value)} />
            <input type="time" value={f.start_time} onChange={e => set('start_time', e.target.value)} />
            <select value={f.duration_min} onChange={e => set('duration_min', e.target.value)}>
              {[15, 30, 45, 60, 90, 120, 180, 240].map(m => <option key={m} value={m}>{m < 60 ? m + ' min' : m / 60 + ' h'}</option>)}
            </select>
          </div>
          <label>Service</label>
          <input list="biz-services" value={f.service} onChange={e => set('service', e.target.value)} placeholder="e.g. Cut & blow-dry, Minor service, Maths lesson" />
          <datalist id="biz-services">{services.map(s => <option key={s} value={s} />)}</datalist>
          <label>Staff member</label>
          <input list="biz-staff" value={f.staff_name} onChange={e => set('staff_name', e.target.value)} placeholder="Who is doing it?" />
          <datalist id="biz-staff">{staffNames.map(s => <option key={s} value={s} />)}</datalist>
          <div className="biz-grid" style={{ marginTop: 10 }}>
            <div><label style={{ marginTop: 0 }}>Price (R)</label><input type="number" inputMode="decimal" value={f.price} onChange={e => set('price', e.target.value)} /></div>
            <div><label style={{ marginTop: 0 }}>Deposit paid (R)</label><input type="number" inputMode="decimal" value={f.deposit} onChange={e => set('deposit', e.target.value)} /></div>
          </div>
          {clash && <div className="msg e">{clash.staff_name || 'This slot'} already has {clash.client_name} at {clash.start_time} - save anyway if that's intended.</div>}
          {msg && <div className={'msg ' + (msg.e ? 'e' : 's')}>{msg.t}</div>}
          <div style={{ height: 10 }} />
          <button className="b" disabled={busy} onClick={save}>Save Booking</button>
          <div style={{ height: 8 }} />
          <button className="b g" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : <button className="b" style={{ marginTop: 12 }} onClick={() => { setF(blank(day)); setAdding(true); }}>+ New Booking</button>)}

      <h2>{new Date(day + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
      <div className="card">
        {dayList.length ? dayList.map(b => (
          <div key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="row">
              <div>
                <div style={{ fontWeight: 700 }}>{b.start_time}-{endTime(b.start_time, b.duration_min)} &middot; {b.client_name || 'Client'}</div>
                <div className="tag">{[b.service, b.staff_name].filter(Boolean).join(' · ') || 'No service set'}{+b.price ? ' · ' + R2(+b.price) : ''}{+b.deposit ? ' · deposit ' + R2(+b.deposit) : ''}{b.source === 'online' ? ' · booked online' : ''}{+b.deposit_due > 0 && !+b.deposit && ['requested', 'booked'].includes(b.status) ? ' · deposit ' + R2(+b.deposit_due) + ' due' : ''}</div>
              </div>
              <span className={'status-badge ' + b.status}>{STATUS_LABEL[b.status]}</span>
            </div>
            {!readOnly && b.status === 'requested' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <button className="b sm" style={{ width: 'auto' }} onClick={() => approve(b)}>Approve</button>
                <button className="b d sm" style={{ width: 'auto' }} onClick={() => decline(b)}>Decline</button>
              </div>
            )}
            {!readOnly && b.status === 'booked' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {+b.deposit_due > 0 && !+b.deposit && <button className="b g sm" style={{ width: 'auto' }} onClick={() => depositReceived(b)}>Deposit received</button>}
                <button className="b sm" style={{ width: 'auto' }} onClick={() => markDone(b)}>Done &amp; paid</button>
                {b.client_phone && <button className="b g sm" style={{ width: 'auto' }} onClick={() => remind(b)}>WhatsApp reminder</button>}
                <button className="b g sm" style={{ width: 'auto' }} onClick={() => updateRow('bookings', b.id, { status: 'no_show' })}>No-show</button>
                <button className="b d sm" style={{ width: 'auto' }} onClick={() => updateRow('bookings', b.id, { status: 'cancelled' })}>Cancel</button>
              </div>
            )}
          </div>
        )) : <div className="mini">No bookings on this day.</div>}
      </div>

      {Object.keys(month.perStaff).length > 0 && (
        <>
          <h2>Earnings per staff member this month</h2>
          <div className="card">
            {Object.entries(month.perStaff).sort((a, b) => b[1].total - a[1].total).map(([name, s]) => (
              <div className="row" key={name} style={{ padding: '4px 0' }}><span>{name} <span className="mini">&middot; {s.n} booking{s.n === 1 ? '' : 's'}</span></span><span className="mono">{R2(s.total)}</span></div>
            ))}
          </div>
        </>
      )}
      <div style={{ height: 20 }} />
    </section>
  );
}
