// Which times can a client book? The booking page works this out to show free
// slots; the database re-checks everything when someone actually books
// (public_book in the online_booking migration), so these rules mirror it.
// All times are South African: dates 'YYYY-MM-DD', times 'HH:MM'.

const pad = n => String(n).padStart(2, '0');
export const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
export const fromMin = n => pad(Math.floor(n / 60)) + ':' + pad(n % 60);
export const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekday = date => new Date(date + 'T12:00:00Z').getUTCDay(); // 0 = Sunday, like the database

// The opening hours for a day, or null if closed (not a working day, or a day off).
export function openHours(settings, date) {
  if ((settings.days_off || []).includes(date)) return null;
  const h = (settings.hours || {})[String(weekday(date))];
  return h && h.open && h.close && toMin(h.close) > toMin(h.open) ? { open: toMin(h.open), close: toMin(h.close) } : null;
}

const overlaps = (aStart, aEnd, b) => aStart < toMin(b.start) + (+b.mins || 0) && toMin(b.start) < aEnd;

// Free start times on one day for a service. `now` is the current SAST time as
// 'YYYY-MM-DDTHH:MM'. `staff` is a name, or '' / 'any'. Each slot lists who is free.
export function slotsFor({ date, durationMin, settings, busy, now, staff = '' }) {
  const hours = openHours(settings, date);
  if (!hours || !(durationMin > 0)) return [];
  const [nowDate, nowTime] = now.split('T');
  const earliest = toMin(nowTime) + (settings.min_notice_hours || 0) * 60; // minutes after midnight of `nowDate`
  const lastDay = addDays(nowDate, settings.max_days_ahead || 30);
  if (date > lastDay || date < nowDate) return [];
  const dayBusy = (busy || []).filter(b => b.date === date);
  const list = settings.staff || [];
  const pickAny = !staff || String(staff).toLowerCase() === 'any';
  const people = list.length ? (pickAny ? list : list.filter(s => s.toLowerCase() === String(staff).toLowerCase())) : [];
  const out = [];
  for (let m = hours.open; m + durationMin <= hours.close; m += settings.slot_minutes || 30) {
    // minutes from the start of today to this slot
    const dayShift = date === nowDate ? 0 : Math.round((new Date(date + 'T00:00:00Z') - new Date(nowDate + 'T00:00:00Z')) / 60000);
    if (dayShift + m < earliest) continue;
    const end = m + durationMin;
    if (list.length) {
      const free = people.filter(p => !dayBusy.some(b => (b.staff === '' || b.staff.toLowerCase() === p.toLowerCase()) && overlaps(m, end, b)));
      if (free.length) out.push({ time: fromMin(m), staff: free });
    } else if (dayBusy.filter(b => overlaps(m, end, b)).length < (settings.capacity || 1)) {
      out.push({ time: fromMin(m), staff: [] });
    }
  }
  return out;
}

// For the day picker: how many free slots each upcoming day has.
export function dayAvailability({ durationMin, settings, busy, now, staff }) {
  const [nowDate] = now.split('T');
  const days = [];
  for (let i = 0; i <= (settings.max_days_ahead || 30); i++) {
    const date = addDays(nowDate, i);
    days.push({ date, free: slotsFor({ date, durationMin, settings, busy, now, staff }).length, closed: !openHours(settings, date) });
  }
  return days;
}

// A calendar file ("Add to calendar") for a booking, in South African time.
export function icsFor({ title, date, time, end, location, description }) {
  const stamp = d => d.replace(/-/g, '');
  const t = x => x.replace(':', '') + '00';
  const esc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//To The Cent//Booking//EN', 'BEGIN:VEVENT',
    `UID:${stamp(date)}${t(time)}-${Math.random().toString(36).slice(2, 8)}@tothecent.co.za`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Africa/Johannesburg:${stamp(date)}T${t(time)}`, `DTEND;TZID=Africa/Johannesburg:${stamp(date)}T${t(end)}`,
    `SUMMARY:${esc(title)}`, location ? `LOCATION:${esc(location)}` : '', description ? `DESCRIPTION:${esc(description)}` : '', 'END:VEVENT', 'END:VCALENDAR']
    .filter(Boolean).join('\r\n');
}

// The link a business shares, from its short name.
export const bookingUrl = (slug, origin = 'https://tothecent.co.za') => `${origin}/book/?b=${encodeURIComponent(slug)}`;
export const slugify = name => String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 38).replace(/-+$/g, '');
export const validSlug = s => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s || '');
