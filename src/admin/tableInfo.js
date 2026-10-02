// Plain-English guide to the database, for the owner portal's Database
// page. Grouped the way the app itself is: personal budgets, the business
// core, the per-business-type tools, and the platform's own bookkeeping.
export const TABLE_GROUPS = [
  { key: 'personal', label: 'Personal budgets' },
  { key: 'business', label: 'Business core' },
  { key: 'tools', label: 'Business tools' },
  { key: 'platform', label: 'Platform & owner portal' },
];

export const TABLE_INFO = {
  budget_sync: ['personal', "Each household's personal budget, synced between devices (one saved copy per household)."],
  household_members: ['personal', 'Which accounts belong to which household - how a couple shares one budget.'],
  statements: ['personal', 'Bank statements people uploaded, with the bank, period and how many transactions were read.'],

  businesses: ['business', 'Every business: name, type, the tools switched on, invoice settings.'],
  business_members: ['business', 'Who belongs to each business and their role (owner, admin, employee, accountant).'],
  customers: ['business', "Each business's customers."],
  invoices: ['business', 'Invoices: customer, dates, totals, VAT and payment status.'],
  invoice_items: ['business', 'The line items on each invoice.'],
  recurring_invoices: ['business', 'Invoices that repeat weekly, monthly or quarterly.'],
  business_transactions: ['business', 'Money in and out - from bank statements, manual entry, cash-ups, bookings and payroll.'],
  expenses: ['business', 'Expenses and scanned receipts, waiting for approval or approved.'],
  bank_accounts: ['business', "A business's bank accounts."],
  business_categories: ['business', 'Custom expense/income categories a business added.'],

  quotes: ['tools', 'Quotes, their deposit and the invoices they turned into.'],
  jobs: ['tools', 'Jobs/projects for trades - groups quotes, invoices, costs and trips.'],
  time_entries: ['tools', 'Hours logged by freelancers, and which invoice billed them.'],
  mileage_trips: ['tools', 'Business trips for the SARS travel logbook.'],
  stock_items: ['tools', 'Stock on the shelf: quantity, cost, selling price, reorder level.'],
  stock_movements: ['tools', 'Every stock change - received, sold, wasted, counted.'],
  cash_ups: ['tools', 'Daily till cash-ups: cash, card, tips, over/short.'],
  bookings: ['tools', 'Appointments: client, service, staff member, deposit, status.'],
  employees: ['tools', 'Staff on the payroll (visible only to owners, admins and accountants).'],
  pay_runs: ['tools', 'Monthly payslips: gross, PAYE, UIF, net pay.'],

  app_admins: ['platform', 'Accounts allowed into this owner portal.'],
  app_activity: ['platform', 'One row per person per day per device when they open the app - powers the usage charts.'],
  app_invites: ['platform', 'Invites and accounts created from this portal.'],
  waitlist_signups: ['platform', 'People who joined the waitlist from the website.'],
};

// Translates the security-rule functions used across the policies into who
// they actually let in.
const WHO = [
  [/is_business_payroll_viewer/, 'owners, admins and the accountant of that business'],
  [/is_business_write_member/, 'members of that business, except accountants'],
  [/is_business_admin/, 'owners and admins of that business'],
  [/is_business_member/, 'members of that business'],
  [/is_app_admin/, 'app owners'],
  [/owner_id = auth\.uid\(\)/, 'the business owner'],
  [/user_id = auth\.uid\(\)/, 'the person themselves'],
  [/auth\.uid\(\)/, 'the signed-in person it belongs to'],
];
const ACTION = { SELECT: 'Read', INSERT: 'Add', UPDATE: 'Change', DELETE: 'Delete', ALL: 'Everything' };

export function describePolicy(p) {
  const rule = (p.using || '') + ' ' + (p.check || '');
  const hit = WHO.find(([re]) => re.test(rule));
  return { action: ACTION[p.command] || p.command, who: hit ? hit[1] : (rule.trim() === 'true' ? 'everyone' : 'custom rule') };
}

export function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'kB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return (b / 1024 ** i).toFixed(i ? 1 : 0).replace(/\.0$/, '') + ' ' + u[i];
}
