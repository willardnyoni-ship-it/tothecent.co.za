// Landing-page content: icons, the business-type switcher and its example
// previews, and the copy for the feature, security and FAQ sections. Every
// figure shown is example data, labelled as such on the page.

import { useEffect, useRef, useState } from 'react';

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
  briefcase: ['M3 8h18v12H3z', 'M8 8V5h8v3', 'M3 13h18'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z', 'M10 21h4'],
  box: ['M3 7l9-4 9 4v10l-9 4-9-4z', 'M3 7l9 4 9-4', 'M12 11v10'],
  cash: ['M3 6h18v12H3z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6.5 9h.01M17.5 15h.01'],
  calendar: ['M4 5h16v16H4z', 'M4 10h16', 'M8 3v4M16 3v4'],
  car: ['M5 15l1.6-5.2A2 2 0 0 1 8.5 8.5h7a2 2 0 0 1 1.9 1.3L19 15', 'M3 15h18v4H3z', 'M7 19v2M17 19v2'],
  cart: ['M3 4h2l2.4 11h10.2L20 7H6.2', 'M9 20h.01M17 20h.01'],
  utensils: ['M7 3v7a2 2 0 0 0 4 0V3', 'M9 12v9', 'M17 21V3c-2 1-3 3-3 6s1 4 3 4'],
  scissors: ['M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M8.6 7.6L20 18', 'M8.6 16.4L20 6'],
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  fuel: ['M5 21V4h9v17', 'M5 10h9', 'M14 8l4 3v7a1.5 1.5 0 0 0 3 0V9l-3-3'],
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10'],
};

export const BIZ_TYPES = [
  {
    key: 'freelancer', icon: I.laptop, label: 'Freelancer',
    for: 'Designers, developers, writers, consultants and photographers',
    pain: 'You sell your time. Unbilled hours, late invoices and a surprise tax bill all come straight out of your pocket.',
    tools: [
      [I.clock, 'Time tracking', 'Run a timer or log hours per client and project, then turn them into invoice lines in one tap.', '6.5 h unbilled · R4 225'],
      [I.quote, 'Quotes that become invoices', 'Send a quote on WhatsApp or email. When the client says yes, it becomes an invoice - nothing re-typed.', 'QUO-0031 accepted → INV-0107'],
      [I.bell, 'Payment reminders', 'See who owes you and for how long, and send a polite reminder by WhatsApp or email in one tap.', '2 overdue · R6 800'],
      [I.percent, 'Tax set-aside', 'Provisional tax estimated from your actual profit, so you know what to put away every month.', 'Set aside R3 180 this month'],
    ],
  },
  {
    key: 'trades', icon: I.wrench, label: 'Trades',
    for: 'Plumbers, electricians, builders, painters and mechanics',
    pain: 'Materials are paid for before the client pays, and by month end nobody knows which jobs actually made money.',
    tools: [
      [I.quote, 'Quotes with deposits', 'Quote the job, invoice a deposit before you buy materials, then send the final invoice with the deposit already taken off.', 'Deposit 50% · R11 500'],
      [I.briefcase, 'Job costing', 'Every quote, invoice, material slip and trip for a job in one place, with the profit worked out.', 'Job profit R7 598 · 33%'],
      [I.car, 'Mileage logbook', 'Log business trips as you drive and export a SARS-ready logbook for your travel claim.', '42 km on this job'],
      [I.bell, 'Payment reminders', 'Chase late payers with a WhatsApp nudge instead of an awkward phone call.', 'INV-0038 · 9 days late'],
    ],
  },
  {
    key: 'retail', icon: I.cart, label: 'Shop',
    for: 'Spaza shops, boutiques, hardware stores and market stalls',
    pain: 'Cash comes in all day and stock goes out all day - and it is hard to tell whether the drawer and the shelves add up.',
    tools: [
      [I.cash, 'Daily cash-up', 'Close the till in two minutes: cash, card and tips, and whether the drawer balances.', 'Drawer balanced · R0 short'],
      [I.box, 'Stock control', 'Know what is on the shelf, what it is worth, and what to reorder before you run out.', 'Coca-Cola 2L · 4 left'],
      [I.chart, 'Sales into the books', 'Cash-ups and stock sales go straight into your income, with VAT worked out if you are registered.', 'R52 300 sales this month'],
      [I.user, 'Customer accounts', 'For regulars who buy on credit: see who owes what, and send a reminder.', '3 accounts · R1 450 owed'],
    ],
  },
  {
    key: 'food', icon: I.utensils, label: 'Food & catering',
    for: 'Cafés, takeaways, caterers, food trucks and home bakers',
    pain: 'Margins are thin. A short till, wasted stock or an unpaid catering invoice can wipe out a week\'s profit.',
    tools: [
      [I.cash, 'Daily cash-up', 'Card, cash and tips each day, with any shortfall flagged the same day - not at month end.', 'Short R40 · flagged today'],
      [I.box, 'Stock & waste', 'Track ingredients, what is running low and what gets thrown away, so you can price properly.', 'Waste this week · R380'],
      [I.quote, 'Catering quotes', 'Quote events per head with a deposit, then convert the quote to the final invoice.', '60 guests · R9 600'],
      [I.percent, 'VAT from your sales', 'Output VAT from your takings, input VAT from your supplier slips - your VAT201 numbers, ready.', 'VAT201 ready · due 25 Nov'],
    ],
  },
  {
    key: 'appointments', icon: I.scissors, label: 'Salon & services',
    for: 'Salons, barbers, nail and beauty techs, therapists and tutors',
    pain: 'A no-show is a slot you can never sell again, and with several staff it is hard to see who earned what.',
    tools: [
      [I.calendar, 'Bookings with deposits', 'Your day at a glance. Take a deposit when booking and get warned about double bookings.', 'Saturday · 9 of 10 slots'],
      [I.chat, 'WhatsApp reminders', 'Remind clients of their appointment the day before, in one tap.', 'Tomorrow · 8 reminders ready'],
      [I.team, 'Earnings per staff member', 'See what each stylist or technician brought in, for commission and payslips.', 'Top earner · R6 200'],
      [I.box, 'Product stock', 'Products and supplies, with low-stock alerts and retail sales recorded.', 'Braiding hair · 6 left'],
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

// Prices are per month in rand, after the first month free.
export const PLANS = [
  {
    key: 'personal', name: 'Personal', price: 89, segment: 'personal',
    tagline: 'For your own money: know what is safe to spend, every day.',
    features: [
      'Safe-to-spend number that sets aside rent and debit orders',
      'Snap a till slip - the shop, items and total are read for you',
      'Import statements from Capitec, FNB, Standard Bank, Absa and Nedbank',
      'Spending by category, month on month',
      'Ask Khanyiso about your spending',
      'Same account on your phone and your computer, always in sync',
      'Download a backup or a CSV whenever you like',
    ],
  },
  {
    key: 'business', name: 'Business', price: 389, segment: 'business', dark: true,
    tagline: 'For the business you run: get paid, stay on top of tax and see what each job makes.',
    includes: 'Everything in Personal, plus:',
    features: [
      'Invoices with VAT, sent on WhatsApp or email, with one-tap payment reminders',
      'Quotes with deposits that turn into invoices',
      'Bank statements matched to invoices and receipts',
      'Receipt scanning and expenses',
      'VAT201 figures worked out for each period',
      'Payslips with PAYE and UIF',
      'Your team and your accountant, each with the access their role needs',
      'Tools for your kind of business: jobs, stock, cash-ups, bookings, time tracking, mileage',
      'Profit and loss and tax records exported in one click',
    ],
  },
];

export const FAQ = [
  ['How does the free month work?', 'Every account starts with one month free on either plan, from the day you join. You can use everything during that month. After it, the plan is paid by monthly debit order.'],
  ['How do I pay, and can I cancel?', 'By monthly debit order. You can cancel any time and your data stays yours - download a full backup or a CSV whenever you like.'],
  ['What does it cost?', 'Personal is R89 a month and Business is R389 a month, after the free month. Business includes the personal budget as well.'],
  ['Do I need to give you my bank login?', 'No. You download your statement (PDF or CSV) from your bank\'s own app or website and upload it. We never ask for your banking username or password, and have no way to connect to your bank.'],
  ['Which banks are supported?', 'Statements from Capitec, FNB, Standard Bank, Absa and Nedbank are read automatically. Till slips are read straight from a photo.'],
  ['Can I use it on my phone and my computer?', 'Yes. Sign in on both and everything stays in sync - add a slip on your phone and it\'s on your computer seconds later.'],
  ['Is it for personal budgets or for business?', 'Both. Use it for your own budget, run your business in it, or do both from the same account and switch between them.'],
  ['What does my business get?', 'Every business gets invoices, expenses, bank statement import, reports and team access. Then the tools for what you do switch on: quotes and jobs for trades, stock and cash-ups for shops and food, bookings for salons, time tracking for freelancers, plus payslips and VAT if you need them.'],
  ['Is this financial or tax advice?', 'No. PAYE, VAT and tax set-aside figures are estimates to help you plan. Check anything with real tax consequences with your accountant or SARS eFiling.'],
];

// A worked example per business type: who they are, what happens step by
// step in To The Cent, the numbers it produces, and the result.
const STORIES = {
  freelancer: {
    who: ['LM', 'Lerato M.', 'Graphic designer · Johannesburg'],
    title: 'Brightside Café logo project',
    steps: [
      ['Hours tracked as she works', '6.5 h at R650 an hour', 'R4 225'],
      ['Invoice sent on WhatsApp', 'INV-0107 · due in 7 days', 'R4 225'],
      ['Reminder sent on day 8', 'Paid two days later, matched to her FNB statement', 'Paid'],
    ],
    tt: 'Her month',
    totals: [['Invoiced', 'R18 900'], ['Business expenses', '−R2 310'], ['Profit', 'R16 590']],
    result: ['R3 180', 'to set aside for SARS this month - no surprise tax bill'],
  },
  trades: {
    who: ['SM', 'Sipho M.', 'Plumber · Durban'],
    title: 'Bathroom renovation for the Mokoena family',
    steps: [
      ['Quote accepted', 'QUO-0017 · sent on WhatsApp', 'R23 000'],
      ['Deposit invoiced and paid', '50% before buying the tiles', 'R11 500'],
      ['Materials scanned to the job', 'Tiles and fittings · 3 slips', '−R12 200'],
      ['Final invoice, less the deposit', 'Matched to his bank statement', 'R11 500'],
    ],
    tt: 'Job costing',
    totals: [['Job income', 'R23 000'], ['Materials', '−R12 200'], ['Helper, 2 days', '−R3 000'], ['Travel · 42 km', '−R202']],
    result: ['R7 598', 'profit on this job, worked out for him'],
  },
  retail: {
    who: ['ZD', 'Zanele D.', 'Spaza shop · Soweto'],
    title: 'A Friday at the shop',
    steps: [
      ['Till closed in two minutes', 'Cash R3 200 · Card R4 100 · balanced', 'R7 300'],
      ['Low stock flagged', 'Coca-Cola 2L, bread and airtime', '3 items'],
      ['Supplier slip scanned', 'Wholesaler run, matched to her statement', '−R4 860'],
    ],
    tt: 'Her week',
    totals: [['Sales', 'R31 750'], ['Stock bought', '−R19 400'], ['Gross profit', 'R12 350']],
    result: ['R18 640', 'of stock on the shelf - always known'],
  },
  food: {
    who: ['AK', 'Ayesha K.', 'Café owner · Cape Town'],
    title: 'Friday cash-up',
    steps: [
      ['Sales recorded', 'Card R5 450 · Cash R2 500', 'R7 950'],
      ['Tips kept separate', 'Recorded for staff, not counted as income', 'R120'],
      ['Drawer counted', 'R40 short - flagged the same day', '−R40'],
    ],
    tt: 'Friday\'s takings',
    totals: [['Sales incl. VAT', 'R7 950'], ['VAT included (15%)', 'R1 037'], ['Sales excl. VAT', 'R6 913']],
    result: ['Every day', 'balanced, recorded and ready for her accountant'],
  },
  appointments: {
    who: ['NZ', 'Nomsa Z.', 'Salon owner · Pretoria'],
    title: 'Saturday braids booking',
    steps: [
      ['Booked with a deposit', 'Saturday 09:00 · paid by EFT', 'R200'],
      ['WhatsApp reminder', 'Sent the day before, in one tap', 'Sent'],
      ['Done and paid', 'Balance recorded automatically', 'R450'],
    ],
    tt: 'Earned this month, by stylist',
    totals: [['Thandeka', 'R6 200'], ['Lindiwe', 'R4 900'], ['Palesa', 'R3 500']],
    result: ['R14 600', 'earned by her team this month'],
  },
};

export function BizStory({ kind }) {
  const st = STORIES[kind] || STORIES.trades;
  const neg = v => v.startsWith('−');
  return (
    <div className="story">
      <div className="person">
        <span className="avatar" aria-hidden="true">{st.who[0]}</span>
        <div><b>{st.who[1]}</b><span>{st.who[2]}</span></div>
        <em className="tag">Example</em>
      </div>
      <div className="st-title">{st.title}</div>
      <ol>
        {st.steps.map(([t, d, a], i) => (
          <li key={t} style={{ animationDelay: (i * 0.1) + 's' }}>
            <span className="n" aria-hidden="true">{i + 1}</span>
            <div className="t"><div><b>{t}</b><span>{d}</span></div><strong className={neg(a) ? 'neg' : ''}>{a}</strong></div>
          </li>
        ))}
      </ol>
      <div className="ledger">
        <div className="lh">{st.tt}</div>
        {st.totals.map(([l, v]) => <div className="lr" key={l}><span>{l}</span><b className={neg(v) ? 'neg' : ''}>{v}</b></div>)}
      </div>
      <div className="result"><span className="big">{st.result[0]}</span><span>{st.result[1]}</span></div>
    </div>
  );
}

// ---------- hero: a full, detailed picture of the app ----------
// Drawn at a fixed design size and scaled to whatever width it's given. When
// the space is narrow (a phone, or the hero's right-hand column) the scene is
// cropped to just the two devices and the problem notes move underneath as
// readable cards.
const SCENE_W = 1160, SCENE_H = 640;
const CROP_X = 120, CROP_W = 970, COMPACT_BELOW = 1000;
const CALLOUTS = [
  ['c1', 'Clients pay me late', 'Reminder sent on WhatsApp', 'INV-0042 paid 2 days later'],
  ['c2', 'Receipts lost in a shoebox', 'Every slip scanned & matched', '34 of 36 bank lines accounted for'],
  ['c3', 'Where did my salary go?', 'Safe to spend today: R327', 'Bills already set aside'],
  ['c4', 'SARS deadlines stress me', 'VAT201 numbers ready', 'R691 to pay by 25 Nov'],
];

// ---- live data for the animated scene ----
// The scene plays a loop of everyday events (a payment lands, a slip is
// scanned, an invoice goes out, a receipt is added). Each step is the full
// set of numbers on screen; the numbers glide from one step to the next.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BASE_BARS = [62, 28, 40, 45, 78, 30, 50, 58, 92, 22, 34, 18, 58, 36]; // in/out per day
const K0 = {
  cash: 48230, income: 36900, expenses: 14215, net: 22685, out: 9750,
  spent: 11240, left: 7260, safe: 327, groc: 2410, grocW: 80, fuel: 1950, fuelW: 97, eat: 1070, eatW: 64,
  ...Object.fromEntries(BASE_BARS.map((v, i) => ['b' + i, v])),
};
const K1 = { ...K0, cash: 50530, income: 39200, out: 7450, net: 24985, b6: 72 };
const K2 = { ...K1, spent: 11552, left: 6948, safe: 289, groc: 2722, grocW: 90 };
const K3 = { ...K2, out: 13200, b12: 78 };
const K4 = { ...K3, expenses: 15365, net: 23835, cash: 49380, b5: 54 };

const INV0 = [
  ['INV-0042', 'Thandi M. · Bathroom', 'R4 600', 'paid', 'Paid'],
  ['INV-0041', 'Brightside Café', 'R3 150', 'sent', 'Sent'],
  ['INV-0038', 'K. Naidoo · Geyser', 'R2 300', 'late', 'Overdue'],
  ['QUO-0017', 'Mokoena · Renovation', 'R23 000', 'quote', 'Quote'],
];
const INV1 = [INV0[0], INV0[1], ['INV-0038', 'K. Naidoo · Geyser', 'R2 300', 'paid', 'Paid'], INV0[3]];
const INV3 = [['INV-0043', 'Brightside Café · Signage', 'R5 750', 'sent', 'Sent'], INV0[0], INV0[1], INV1[2]];

const ATTN0 = ['INV-0038 overdue · R2 300', '3 bank lines need a receipt', 'VAT due 25 Nov · R691'];
const ATTN1 = ['All overdue invoices paid', ATTN0[1], ATTN0[2]];
const ATTN3 = ['INV-0043 sent · due in 7 days', ATTN0[1], ATTN0[2]];
const ATTN4 = [ATTN3[0], '2 bank lines need a receipt', ATTN0[2]];

const STEPS = [
  { k: K0, inv: INV0, open: 3, attn: ATTN0, toast: null },
  { k: K1, inv: INV1, open: 2, attn: ATTN1, toast: { kind: 'biz', title: 'Payment received', text: 'K. Naidoo paid INV-0038 · R2 300' } },
  { k: K2, inv: INV1, open: 2, attn: ATTN1, toast: { kind: 'phone', title: 'Slip added', text: 'Woolworths · R312,40 · Groceries' } },
  { k: K3, inv: INV3, open: 3, attn: ATTN3, toast: { kind: 'biz', title: 'Invoice sent on WhatsApp', text: 'INV-0043 · Brightside Café · R5 750' } },
  { k: K4, inv: INV3, open: 3, attn: ATTN4, toast: { kind: 'biz', title: 'Receipt scanned', text: 'Builders Warehouse · R1 150 · Materials' } },
];
const STEP_MS = 3400;

const money = n => 'R' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Glides every number in `target` from where it is now to its new value.
function useTweened(target, enabled) {
  const [val, setVal] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (!enabled) { cur.current = target; setVal(target); return undefined; }
    const from = cur.current, t0 = performance.now(), DUR = 1100;
    let raf;
    const tick = now => {
      const p = Math.min(1, (now - t0) / DUR), e = 1 - Math.pow(1 - p, 3);
      const next = {};
      for (const k in target) next[k] = from[k] + (target[k] - from[k]) * e;
      cur.current = next; setVal(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled]);
  return val;
}

export function HeroScene() {
  const ref = useRef(null);
  const [fit, setFit] = useState({ scale: 1, left: 0, compact: false });
  const [step, setStep] = useState(0);
  const [live, setLive] = useState(false);
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      const w = el.clientWidth;
      if (w < COMPACT_BELOW) {
        const scale = Math.min(1, w / CROP_W);
        setFit({ scale, left: (w - CROP_W * scale) / 2 - CROP_X * scale, compact: true });
      } else {
        const scale = Math.min(1, w / SCENE_W);
        setFit({ scale, left: Math.max(0, (w - SCENE_W * scale) / 2), compact: false });
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
    }
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Only play while the picture is on screen and the tab is visible.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced.current) return undefined;
    let inView = true;
    const apply = () => setLive(inView && !document.hidden);
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { inView = e.isIntersecting; apply(); }, { threshold: 0.2 }) : null;
    if (io) io.observe(el);
    document.addEventListener('visibilitychange', apply);
    apply();
    return () => { if (io) io.disconnect(); document.removeEventListener('visibilitychange', apply); };
  }, []);
  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => setStep(s => (s + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(id);
  }, [live]);

  const S = STEPS[step], prevK = STEPS[(step + STEPS.length - 1) % STEPS.length].k;
  const v = useTweened(S.k, !reduced.current);
  const bump = key => step > 0 && prevK[key] !== S.k[key];
  const toast = S.toast;

  return (
    <>
    <div className={'scene' + (fit.compact ? ' compact' : '')} ref={ref} style={{ height: (fit.compact ? SCENE_H - 30 : SCENE_H) * fit.scale }} role="img"
      aria-label="Illustration of To The Cent with example data: a business dashboard on a laptop and a personal budget on a phone, with the numbers updating as payments arrive, slips are scanned and invoices are sent">
      <div className="scene-in" style={{ width: SCENE_W, height: SCENE_H, left: fit.left, transform: `scale(${fit.scale})` }}>

        <div className="laptop">
          <div className="lscreen">
            <div className="ap-top">
              <span className="ap-logo">TC</span><b>Mokoena Plumbing</b>
              <div className="ap-tabs">{['Home', 'Money', 'Invoices', 'Jobs', 'Expenses', 'Reports', 'Team'].map((t, i) => <span key={t} className={i === 0 ? 'on' : ''}>{t}</span>)}</div>
              <span className="ap-avatar">S</span>
            </div>
            {toast && toast.kind === 'biz' && (
              <div className="ap-toast" key={step}><span className="ti"><Ic d={I.check} /></span><div><b>{toast.title}</b><span>{toast.text}</span></div></div>
            )}
            <div className="ap-body">
              <div className="ap-h"><b>Good morning, Sipho</b><span><i className="livedot" />Live · October 2026</span></div>
              <div className="ap-cards">
                {[['Cash available', 'cash', 'g'], ['Income', 'income', ''], ['Expenses', 'expenses', ''], ['Net profit', 'net', 'g'], ['Outstanding', 'out', 'o']].map(([l, key, c]) => (
                  <div className={'ap-card' + (bump(key) ? ' bump' : '')} key={l + (bump(key) ? step : '')}><span>{l}</span><b className={c}>{money(v[key])}</b></div>
                ))}
              </div>
              <div className="ap-row">
                <div className="ap-panel">
                  <div className="ap-ph"><b>Cash flow · this week</b><span><i className="in" />In <i className="out" />Out</span></div>
                  <div className="ap-bars">
                    {DAYS.map((d, i) => (
                      <div key={d}>
                        <div className="pair">
                          <i className="in" style={{ height: v['b' + i * 2] + '%', animationDelay: (0.4 + i * 0.07) + 's' }} />
                          <i className="out" style={{ height: v['b' + (i * 2 + 1)] + '%', animationDelay: (0.45 + i * 0.07) + 's' }} />
                        </div>
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ap-panel">
                  <div className="ap-ph"><b>Invoices &amp; quotes</b><span>{S.open} open</span></div>
                  {S.inv.map(([n, w, a, c, l]) => (
                    <div className="ap-inv fl" key={n + c}><span><b>{n}</b><small>{w}</small></span><span className="r"><b>{a}</b><em className={c}>{l}</em></span></div>
                  ))}
                </div>
              </div>
              <div className="ap-attn">
                <b>Needs your attention</b>
                {S.attn.map((t, i) => <div key={i + t}><i>!</i>{t}</div>)}
              </div>
            </div>
          </div>
          <div className="lbase"><span /></div>
        </div>

        <div className="mphone">
          <div className="mscreen">
            {toast && toast.kind === 'phone' && (
              <div className="m-notif" key={step}><span className="nic">TC</span><div><b>{toast.title}</b><span>{toast.text}</span></div></div>
            )}
            <div className="m-status"><span>9:41</span><span className="dots"><i /><i /><i /></span></div>
            <div className="m-top"><b>Home</b><span className="ap-avatar">T</span></div>
            <div className="m-h"><b>Hi Thandi</b><span>25 Sep - 24 Oct</span></div>
            <div className="m-grid">
              <div className="m-stat sage"><span>Income</span><b>R18 500</b></div>
              <div className={'m-stat mustard' + (bump('spent') ? ' bump' : '')} key={'sp' + (bump('spent') ? step : '')}><span>Spent</span><b>{money(v.spent)}</b></div>
              <div className={'m-stat lav' + (bump('left') ? ' bump' : '')} key={'lf' + (bump('left') ? step : '')}><span>Left</span><b>{money(v.left)}</b></div>
            </div>
            <div className={'m-safe' + (bump('safe') ? ' bump' : '')} key={'sf' + (bump('safe') ? step : '')}><span>Safe to spend today</span><b>{money(v.safe)}</b><small>Rent &amp; debit orders already set aside</small></div>
            <div className="m-cats">
              {[[I.cart, 'Groceries', 'groc', 'grocW', 'sage'], [I.fuel, 'Fuel', 'fuel', 'fuelW', 'mustard'], [I.utensils, 'Eating out', 'eat', 'eatW', 'lav']].map(([ic, n, key, wk, c]) => (
                <div className="m-cat" key={n}>
                  <span className="ic"><Ic d={ic} /></span>
                  <div><div className="nm"><b>{n}</b><span>{money(v[key])}</span></div><div className="m-bar"><i className={c} style={{ width: v[wk] + '%' }} /></div></div>
                </div>
              ))}
            </div>
            <div className="m-snap"><Ic d={I.camera} /> Snap a slip</div>
          </div>
        </div>

        {!fit.compact && CALLOUTS.map(([c, p, b, d]) => <div className={'callout ' + c} key={c}><s>"{p}"</s><b>{b}</b><span>{d}</span></div>)}
      </div>
    </div>
    {fit.compact && (
      <div className="callouts-list">
        {CALLOUTS.map(([c, p, b, d]) => <div className="callout" key={c}><s>"{p}"</s><b>{b}</b><span>{d}</span></div>)}
      </div>
    )}
    </>
  );
}

// The everyday problems, paired with what To The Cent does about each.
export const PROBLEMS = {
  people: [
    ['It\'s the 20th and the money is gone', 'A daily safe-to-spend number that already puts rent and debit orders aside.'],
    ['Slips in your wallet, no record anywhere', 'Snap a photo - the shop, items and total are read and categorised.'],
    ['Debit orders you forgot you had', 'Recurring payments found in your statement, with what\'s still coming this month.'],
    ['No idea where it all went', 'Spending by category, month on month - or just ask Khanyiso.'],
  ],
  business: [
    ['Customers pay late - or never', 'Invoices sent on WhatsApp, payments matched to your bank, one-tap reminders.'],
    ['Receipts lost before tax time', 'Scan receipts as you go; each one is matched to a line on your statement.'],
    ['Personal and business money mixed up', 'A separate business space with its own books, team and reports.'],
    ['Not sure if a job actually made money', 'Quotes, invoices, materials and travel per job, with the profit worked out.'],
    ['SARS: VAT, PAYE and provisional tax', 'VAT201 figures, payslips with PAYE & UIF, and how much to set aside.'],
  ],
};
