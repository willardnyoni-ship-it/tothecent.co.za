// What the public booking page talks to. Live: the three public_booking_*
// functions in Supabase (they re-check every rule). Demo (?demo=appointments,
// used by the owner portal's preview): the same answers from the example
// business held in memory, so the page can be tried with nothing behind it.
import { buildDemoDb } from './demoData.js';
import { slotsFor, addDays } from './bookingSlots.js';

const SUPA_URL = 'https://pkbpmnpevxjrqjnepsjd.supabase.co';
const SUPA_KEY = 'sb_publishable_foyO2Py6QAR3oG8IK4OyzQ_WOFBcuiN';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const demoMode = () => !!params.get('demo');
export const slugFromUrl = () => (params.get('b') || '').toLowerCase().trim();

async function rpc(fn, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Could not reach the booking system (' + r.status + ')');
  return r.json();
}

// ---------------- demo ----------------
let demo = null;
function demoState() {
  if (demo) return demo;
  const db = buildDemoDb('appointments');
  const hours = {}; [1, 2, 3, 4, 5].forEach(d => { hours[d] = { open: '09:00', close: '17:00' }; }); hours[6] = { open: '08:00', close: '14:00' };
  const staff = ['Thandeka', 'Lindiwe', 'Palesa'];
  demo = {
    busy: db.bookings.filter(b => b.status !== 'cancelled').map(b => ({ date: b.date, start: b.start_time, mins: b.duration_min, staff: b.staff_name || '' })),
    page: {
      name: db.businesses[0].name, headline: 'Book your appointment', intro: 'Pick a service and a time that suits you. We confirm on WhatsApp.', approval: 'instant',
      slot_minutes: 30, min_notice_hours: 2, max_days_ahead: 30, hours, days_off: [], staff, capacity: 1,
      deposit_note: 'A deposit holds your slot: EFT to FNB 62 0000 0000 (use your name as the reference).', contact_phone: '0825550100',
      services: [
        { id: 's1', name: 'Box braids', duration_min: 150, price: 650, deposit: 200 }, { id: 's2', name: 'Cut & colour', duration_min: 120, price: 780, deposit: 250 },
        { id: 's3', name: 'Blow-dry', duration_min: 60, price: 220, deposit: 50 }, { id: 's4', name: 'Gel nails', duration_min: 60, price: 320, deposit: 100 },
        { id: 's5', name: 'Barber cut', duration_min: 30, price: 120, deposit: 0 },
      ],
    },
  };
  return demo;
}
const demoNow = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

// ---------------- the three calls ----------------
export async function getPage(slug) {
  if (demoMode()) { const d = demoState(); return { ...d.page, now: demoNow() }; }
  return rpc('public_booking_page', { p_slug: slug });
}

export async function getBusy(slug, from, to) {
  if (demoMode()) return demoState().busy;
  return rpc('public_booking_busy', { p_slug: slug, p_from: from, p_to: to });
}

// -> { ok: true, ... } or { ok: false, error: 'slot_taken' | 'closed' | ... }
export async function book(slug, { service, date, time, staff, name, phone, note }) {
  if (demoMode()) {
    await new Promise(r => setTimeout(r, 700));
    const d = demoState(), svc = d.page.services.find(s => s.id === service);
    const free = slotsFor({ date, durationMin: svc.duration_min, settings: d.page, busy: d.busy, now: demoNow(), staff });
    const slot = free.find(s => s.time === time);
    if (!slot) return { ok: false, error: 'slot_taken' };
    const who = slot.staff[0] || '';
    d.busy.push({ date, start: time, mins: svc.duration_min, staff: who });
    const end = (() => { const [h, m] = time.split(':').map(Number); const t = h * 60 + m + svc.duration_min; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();
    return { ok: true, reference: 'DEMO01', status: d.page.approval === 'instant' ? 'booked' : 'requested', business: d.page.name, service: svc.name, date, time, end, staff: who, price: svc.price, deposit_due: svc.deposit, deposit_note: d.page.deposit_note, contact_phone: d.page.contact_phone };
  }
  return rpc('public_book', { p_slug: slug, p_service: service, p_date: date, p_time: time, p_staff: staff || '', p_name: name, p_phone: phone, p_note: note || null });
}

export { addDays };
