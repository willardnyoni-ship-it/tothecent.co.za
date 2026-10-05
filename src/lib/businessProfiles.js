// What kind of business this is, and which extra tools that switches on.
// The core tabs (Home, Money, Invoices, Expenses, Reports, Team) are the
// same for everyone; a profile only decides which extras appear on top.
// The owner can still flip any tool on or off later in Settings -> Features,
// so a profile is a sensible starting point, not a cage.

export const FEATURES = {
  quotes: { label: 'Quotes', desc: 'Send a quote, take a deposit, then turn it into an invoice in one tap.' },
  reminders: { label: 'Payment reminders', desc: 'Nudge customers about overdue invoices by WhatsApp or email.' },
  time: { label: 'Time tracking', desc: 'Log hours per customer or job and bill them straight onto an invoice.' },
  taxSavings: { label: 'Tax set-aside', desc: 'See how much of your profit to put away for SARS each month.' },
  jobs: { label: 'Jobs', desc: 'Group quotes, invoices, costs and hours per job to see what each job really made.' },
  mileage: { label: 'Mileage log', desc: 'Record business trips for your SARS travel claim.' },
  vehicles: { label: 'Vehicles', desc: 'Track each car from purchase to sale: what you paid, everything you spent on it, and what it made.' },
  stock: { label: 'Stock', desc: 'Know what you have, what it cost, and when to reorder.' },
  cashup: { label: 'Daily cash-up', desc: 'Close the till each day: cash, card and tips, and whether the drawer balances.' },
  bookings: { label: 'Bookings', desc: 'Appointments, deposits, no-shows and earnings per staff member.' },
  payroll: { label: 'Staff wages', desc: 'Monthly payslips with PAYE and UIF worked out for you.' },
  vat: { label: 'VAT return', desc: 'Your VAT201 numbers for each two-month period, ready for eFiling.' },
};

export const PROFILES = [
  {
    key: 'freelancer', icon: '💻', label: 'Freelancer or consultant',
    examples: 'Designer, IT contractor, bookkeeper, writer',
    features: ['quotes', 'reminders', 'time', 'taxSavings'],
  },
  {
    key: 'trades', icon: '🔨', label: 'Trades & construction',
    examples: 'Builder, plumber, electrician, painter',
    features: ['quotes', 'reminders', 'jobs', 'mileage'],
  },
  {
    key: 'retail', icon: '🛒', label: 'Shop or retail',
    examples: 'Spaza, market stall, boutique, online store',
    features: ['stock', 'cashup', 'reminders'],
  },
  {
    key: 'food', icon: '🍲', label: 'Food & hospitality',
    examples: 'Café, caterer, food truck, takeaway',
    features: ['stock', 'cashup', 'quotes', 'reminders'],
  },
  {
    key: 'motor', icon: '🚗', label: 'Motor trade',
    examples: 'Car dealer, bakkie and bike sales, vehicle importer',
    features: ['vehicles', 'quotes', 'reminders'],
  },
  {
    key: 'appointments', icon: '✂️', label: 'Service by appointment',
    examples: 'Salon, barber, mechanic, tutor, therapist',
    features: ['bookings', 'reminders', 'stock'],
  },
  {
    key: 'general', icon: '🏢', label: 'Something else',
    examples: 'Start with the basics and add tools as you need them',
    features: ['quotes', 'reminders'],
  },
];

export const profileByKey = key => PROFILES.find(p => p.key === key) || null;

// Builds the feature list for a new business (or a profile change in
// Settings): the profile's own tools, plus payroll / VAT from the two
// yes-no questions, since those cut across every kind of business.
export function featuresFor(profileKey, { hasStaff = false, vatRegistered = false } = {}) {
  const base = (profileByKey(profileKey) || profileByKey('general')).features;
  const out = [...base];
  if (hasStaff) out.push('payroll');
  if (vatRegistered) out.push('vat');
  return [...new Set(out)];
}

// Businesses created before profiles existed have business_profile null
// and an empty features array - treat them as 'general' so they keep
// everything they had, plus quotes and reminders.
export function activeFeatures(business) {
  if (!business) return [];
  const f = Array.isArray(business.features) ? business.features : [];
  if (!business.business_profile && !f.length) return profileByKey('general').features;
  return f;
}
