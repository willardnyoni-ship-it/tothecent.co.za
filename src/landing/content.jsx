// Landing-page content: icons, the business-type switcher and its example
// previews, and the copy for the feature, security and FAQ sections. Every
// figure shown is example data, labelled as such on the page.

export function Ic({ d, cls }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export const I = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  wallet: ['M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z', 'M3 7l12-3v3', 'M16 13.5h2'],
  doc: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h6M10 17h6'],
  chat: 'M4 5h16v11H9l-5 4z',
  phone: ['M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M11 18h2'],
  laptop: ['M4 5h16v11H4z', 'M2 19h20'],
  invoice: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'],
  quote: ['M4 6h16M4 12h10M4 18h7', 'M17 15l2 2 4-4'],
  percent: ['M5 19L19 5', 'M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'],
  team: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5', 'M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2'],
  chart: 'M4 20V10M10 20V4M16 20v-7M2 20h20',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M5 20h14'],
  bank: ['M3 10l9-6 9 6', 'M5 10v8M19 10v8M9 10v8M15 10v8', 'M3 20h18'],
};

export const BIZ_TYPES = [
  {
    key: 'freelancer', icon: '💻', label: 'Freelancer', example: 'a graphic designer',
    tools: [
      ['⏱', 'Time tracking', 'Start a timer or log hours per client, then bill them onto an invoice in one tap.'],
      ['📝', 'Quotes', 'Send a quote and turn it into an invoice when the client says yes.'],
      ['🔔', 'Payment reminders', 'A friendly WhatsApp or email nudge for invoices that are late.'],
      ['🏦', 'Tax set-aside', 'See how much of this month\'s profit to put away for SARS.'],
    ],
  },
  {
    key: 'trades', icon: '🔨', label: 'Trades', example: 'a plumber',
    tools: [
      ['📝', 'Quotes with deposits', 'Quote the job, invoice the deposit, then send the final invoice less the deposit.'],
      ['🧰', 'Jobs', 'Every quote, invoice, material cost and trip for a job in one place - see what it really made.'],
      ['🚗', 'Mileage logbook', 'Log business trips for your SARS travel claim and export the logbook.'],
      ['🔔', 'Payment reminders', 'Chase late payers with one tap.'],
    ],
  },
  {
    key: 'retail', icon: '🛒', label: 'Shop', example: 'a spaza shop',
    tools: [
      ['📦', 'Stock', 'Know what\'s on the shelf, what it\'s worth, and get warned before you run out.'],
      ['💵', 'Daily cash-up', 'Close the till: cash, card and tips, and whether the drawer balances.'],
      ['🧾', 'Sales into the books', 'Cash-ups and stock sales land in your income automatically.'],
      ['🔔', 'Payment reminders', 'For customers who buy on account.'],
    ],
  },
  {
    key: 'food', icon: '🍲', label: 'Food & catering', example: 'a café',
    tools: [
      ['💵', 'Daily cash-up', 'Card, cash and tips each day, with over/short at a glance.'],
      ['📦', 'Stock & waste', 'Track ingredients, what\'s running low, and what gets thrown away.'],
      ['📝', 'Catering quotes', 'Quote events with a deposit and convert to an invoice.'],
      ['🔔', 'Payment reminders', 'For catering clients on account.'],
    ],
  },
  {
    key: 'appointments', icon: '✂️', label: 'Salon & services', example: 'a hair salon',
    tools: [
      ['📅', 'Bookings', 'Your day at a glance, with deposits, no-shows and double-booking warnings.'],
      ['💬', 'WhatsApp reminders', 'Remind clients of their appointment in one tap.'],
      ['👩‍🔧', 'Earnings per staff member', 'See what each stylist or technician brought in this month.'],
      ['📦', 'Stock', 'Products and supplies, with low-stock alerts.'],
    ],
  },
];

export const ESSENTIALS = [
  [I.invoice, 'Invoices that get paid', 'Professional PDF invoices with VAT, sent straight to WhatsApp or email. Payments are matched to your bank statement, and late payers get a one-tap reminder.'],
  [I.quote, 'Quotes with deposits', 'Send a quote, take a deposit, then turn it into the final invoice with the deposit already taken off.'],
  [I.percent, 'VAT, sorted', 'If you\'re VAT-registered, your VAT201 figures for each two-month period are worked out from your invoices, sales and slips.'],
  [I.user, 'Payslips with PAYE & UIF', 'Monthly payslips for your staff, with PAYE and UIF calculated, and the amount to pay SARS each month.'],
  [I.team, 'Your team, your rules', 'Invite staff and your accountant. Each gets the access their role needs - accountants see the books but can\'t change them.'],
  [I.chart, 'Reports for your accountant', 'Profit and loss, income and expenses, and your tax records exported in one click.'],
];

export const SECURITY = [
  [I.bank, 'No bank login. Ever.', 'You download your statement and upload it yourself. We never ask for, and can\'t use, your banking password.'],
  [I.lock, 'Protected in transit', 'Everything travels encrypted over HTTPS, and access rules mean only you - and the people you invite - can see your data.'],
  [I.download, 'Yours to take with you', 'Download a full backup or a CSV of your transactions whenever you like.'],
  [I.shield, 'Never sold', 'We don\'t sell your data or share it with advertisers.'],
];

export const FAQ = [
  ['Do I need to give you my bank login?', 'No. You download your statement (PDF or CSV) from your bank\'s own app or website and upload it. We never ask for your banking username or password, and have no way to connect to your bank.'],
  ['Which banks are supported?', 'Statements from Capitec, FNB, Standard Bank, Absa and Nedbank are read automatically. Till slips are read straight from a photo.'],
  ['Can I use it on my phone and my computer?', 'Yes. Sign in on both and everything stays in sync - add a slip on your phone and it\'s on your computer seconds later.'],
  ['Is it for personal budgets or for business?', 'Both. Use it for your own budget, run your business in it, or do both from the same account and switch between them.'],
  ['What does my business get?', 'Every business gets invoices, expenses, bank statement import, reports and team access. Then the tools for what you do switch on: quotes and jobs for trades, stock and cash-ups for shops and food, bookings for salons, time tracking for freelancers, plus payslips and VAT if you need them.'],
  ['Is this financial or tax advice?', 'No. PAYE, VAT and tax set-aside figures are estimates to help you plan. Check anything with real tax consequences with your accountant or SARS eFiling.'],
];

// One example card per business type, shown beside its tool list.
export function BizPreview({ kind }) {
  if (kind === 'freelancer') return (
    <div className="card">
      <div className="pv-h"><b>Timer running</b><span>Brightside Café</span></div>
      <div className="timer">01:42:10</div>
      <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 10 }}>Logo concepts, round 2</div>
      <div className="pv-row"><span>Ready to invoice<small>6.5 hours this week</small></span><b>R4 225,00</b></div>
      <div className="pv-row"><span>Tax set-aside (25%)<small>from this month's profit</small></span><b>R3 180,00</b></div>
      <div className="pv-btns"><span className="g">Create invoice</span><span>Stop timer</span></div>
    </div>
  );
  if (kind === 'trades') return (
    <div className="card">
      <div className="pv-h"><b>Quote QUO-0017</b><span>Accepted</span></div>
      <div className="pv-row"><span>Bathroom renovation<small>labour and materials</small></span><b>R20 000,00</b></div>
      <div className="pv-row"><span>VAT (15%)</span><b>R3 000,00</b></div>
      <div className="pv-total"><span>Total</span><span>R23 000,00</span></div>
      <div className="pv-row" style={{ marginTop: 6 }}><span>Deposit invoice (50%)<small>INV-0041 · paid</small></span><b style={{ color: 'var(--green)' }}>R11 500,00</b></div>
      <div className="pv-btns"><span className="g">Create final invoice (less deposit)</span><span>Job: Mokoena bathroom</span></div>
    </div>
  );
  if (kind === 'retail') return (
    <div className="card">
      <div className="pv-h"><b>Stock</b><span>Value R18 640</span></div>
      <div className="pv-row"><span>Coca-Cola 2L<small>Reorder at 12</small></span><b style={{ color: 'var(--bad)' }}>4 left</b></div>
      <div className="pv-row"><span>White bread<small>Reorder at 10</small></span><b style={{ color: 'var(--bad)' }}>6 left</b></div>
      <div className="pv-row"><span>Airtime vouchers<small>Reorder at 20</small></span><b>48 left</b></div>
      <div className="pv-row"><span>Today's cash-up<small>Cash R3 200 · Card R4 100</small></span><b style={{ color: 'var(--green)' }}>Balanced</b></div>
    </div>
  );
  if (kind === 'food') return (
    <div className="card">
      <div className="pv-h"><b>Close the day</b><span>Friday</span></div>
      <div className="pv-row"><span>Cash sales</span><b>R3 200,00</b></div>
      <div className="pv-row"><span>Card sales</span><b>R4 100,00</b></div>
      <div className="pv-row"><span>SnapScan &amp; Zapper</span><b>R650,00</b></div>
      <div className="pv-row"><span>Tips in the till</span><b>R120,00</b></div>
      <div className="pv-total"><span>Total sales</span><span>R7 950,00</span></div>
      <div className="pv-row" style={{ marginTop: 6 }}><span>Counted vs expected</span><b style={{ color: 'var(--bad)' }}>Short R40,00</b></div>
    </div>
  );
  return (
    <div className="card">
      <div className="pv-h"><b>Today</b><span>3 bookings</span></div>
      <div className="pv-row"><span>09:00 · Ayanda Z.<small>Braids · Nomsa · deposit R200</small></span><b>R650</b></div>
      <div className="pv-row"><span>10:30 · Kim N.<small>Cut &amp; blow-dry · Nomsa</small></span><b>R350</b></div>
      <div className="pv-row"><span>13:00 · Lerato K.<small>Colour · Thabo</small></span><b>R890</b></div>
      <div className="pv-btns"><span className="g">Done &amp; paid</span><span>WhatsApp reminder</span><span>No-show</span></div>
    </div>
  );
}
