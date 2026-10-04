// Run with:  node src/lib/bookingSlots.test.mjs
import assert from 'node:assert/strict';
import { toMin, fromMin, addDays, weekday, openHours, slotsFor, dayAvailability, icsFor, bookingUrl, slugify, validSlug } from './bookingSlots.js';

assert.equal(toMin('09:30'), 570); assert.equal(fromMin(570), '09:30'); assert.equal(addDays('2026-10-31', 1), '2026-11-01'); assert.equal(addDays('2026-03-01', -1), '2026-02-28');
assert.equal(weekday('2026-10-19'), 1, 'Monday'); assert.equal(weekday('2026-10-18'), 0, 'Sunday');

const settings = {
  slot_minutes: 30, min_notice_hours: 2, max_days_ahead: 30, capacity: 1, staff: [],
  hours: { 1: { open: '09:00', close: '17:00' }, 2: { open: '09:00', close: '17:00' }, 6: { open: '09:00', close: '13:00' } }, // Mon, Tue, Sat
  days_off: ['2026-10-27'],
};
// "now" is Sunday 18 Oct 2026 10:00
const now = '2026-10-18T10:00';
assert.equal(openHours(settings, '2026-10-18'), null, 'Sunday closed');
assert.deepEqual(openHours(settings, '2026-10-19'), { open: 540, close: 1020 });
assert.equal(openHours(settings, '2026-10-27'), null, 'day off beats opening hours');

// A one-hour service on Monday: every half hour from 09:00 to 16:00
let s = slotsFor({ date: '2026-10-19', durationMin: 60, settings, busy: [], now });
assert.equal(s[0].time, '09:00'); assert.equal(s.at(-1).time, '16:00'); assert.equal(s.length, 15);
// A booking at 10:00-11:00 takes out 09:30, 10:00, 10:30 (anything overlapping it)
s = slotsFor({ date: '2026-10-19', durationMin: 60, settings, busy: [{ date: '2026-10-19', start: '10:00', mins: 60, staff: '' }], now });
assert.deepEqual(s.map(x => x.time).slice(0, 4), ['09:00', '11:00', '11:30', '12:00'].slice(0, 1).concat(['11:00', '11:30', '12:00']));
assert.ok(!s.some(x => ['09:30', '10:00', '10:30'].includes(x.time)));
// two chairs: one booking leaves a slot free
s = slotsFor({ date: '2026-10-19', durationMin: 60, settings: { ...settings, capacity: 2 }, busy: [{ date: '2026-10-19', start: '10:00', mins: 60, staff: '' }], now });
assert.ok(s.some(x => x.time === '10:00'));
// closed days and out-of-range days have nothing
assert.deepEqual(slotsFor({ date: '2026-10-18', durationMin: 60, settings, busy: [], now }), []);
assert.deepEqual(slotsFor({ date: '2026-12-25', durationMin: 60, settings, busy: [], now }), [], 'beyond how far ahead');
assert.deepEqual(slotsFor({ date: '2026-10-17', durationMin: 60, settings, busy: [], now }), [], 'in the past');
// the day ends: a 2-hour service can't start at 16:00
assert.equal(slotsFor({ date: '2026-10-19', durationMin: 120, settings, busy: [], now }).at(-1).time, '15:00');

// minimum notice: now = Monday 10:00, 2 hours notice -> first slot 12:00
s = slotsFor({ date: '2026-10-19', durationMin: 60, settings, busy: [], now: '2026-10-19T10:00' });
assert.equal(s[0].time, '12:00');
assert.deepEqual(slotsFor({ date: '2026-10-19', durationMin: 60, settings, busy: [], now: '2026-10-19T16:00' }), [], 'too late today');

// staff: Ana is busy 10:00-11:00, Bo is free -> "any" still offers 10:00 (with Bo), Ana alone doesn't
const withStaff = { ...settings, staff: ['Ana', 'Bo'] };
const busyAna = [{ date: '2026-10-19', start: '10:00', mins: 60, staff: 'Ana' }];
s = slotsFor({ date: '2026-10-19', durationMin: 60, settings: withStaff, busy: busyAna, now, staff: 'any' });
assert.deepEqual(s.find(x => x.time === '10:00').staff, ['Bo']); assert.deepEqual(s.find(x => x.time === '09:00').staff, ['Ana', 'Bo']);
assert.ok(!slotsFor({ date: '2026-10-19', durationMin: 60, settings: withStaff, busy: busyAna, now, staff: 'Ana' }).some(x => x.time === '10:00'));
assert.ok(slotsFor({ date: '2026-10-19', durationMin: 60, settings: withStaff, busy: busyAna, now, staff: 'bo' }).some(x => x.time === '10:00'), 'staff names match any case');
// a manual booking with no staff named blocks everyone
const blocks = [{ date: '2026-10-19', start: '10:00', mins: 60, staff: '' }];
assert.ok(!slotsFor({ date: '2026-10-19', durationMin: 60, settings: withStaff, busy: blocks, now, staff: 'any' }).some(x => x.time === '10:00'));

// day picker
const days = dayAvailability({ durationMin: 60, settings, busy: [], now });
assert.equal(days.length, 31); assert.equal(days[0].closed, true); assert.equal(days[1].free, 15); assert.equal(days.find(d => d.date === '2026-10-27').closed, true);

// calendar file + link helpers
const ics = icsFor({ title: 'Cut at Nomsa, Hair', date: '2026-10-19', time: '10:00', end: '11:00', location: 'Soweto', description: 'Ref ABC123' });
assert.match(ics, /DTSTART;TZID=Africa\/Johannesburg:20261019T100000/); assert.match(ics, /DTEND;TZID=Africa\/Johannesburg:20261019T110000/); assert.match(ics, /SUMMARY:Cut at Nomsa\\, Hair/);
assert.equal(bookingUrl('nomsa'), 'https://tothecent.co.za/book/?b=nomsa');
assert.equal(slugify("Nomsa's Hair Studio"), 'nomsas-hair-studio'); assert.equal(slugify('  Café   Crème!! '), 'cafe-creme'); assert.equal(slugify('A'), 'a');
assert.ok(validSlug('nomsas-hair-studio')); assert.ok(!validSlug('a')); assert.ok(!validSlug('-bad-')); assert.ok(!validSlug('Has Caps')); assert.ok(!validSlug(''));

console.log('bookingSlots: all checks passed');
