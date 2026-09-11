# Budget

A private, offline-first budget tracker. Receipt scanning and bank-statement parsing
both run in the browser first, always. Signing in is optional and adds account sync
on top: Claude reads receipts more accurately than on-device OCR, and slip photos and
confirmed statement imports back up to your account. Signed out, nothing changes -
everything stays exactly as local as before either existed.

Built as a Vite + React app (see **Developing** below) that builds to two static
pages, same as before:

| Page | What it is |
|---|---|
| `index.html` | The public front door — pitch, log in / create account. This is what `https://tothecent.co.za/` shows. |
| `app/` | The actual app, at `https://tothecent.co.za/app/`. Signing in or creating an account on `index.html` redirects here. Can also be opened directly. `/app.html` (the old URL) still works — it's a redirect stub that forwards to `/app/`, query string and tab hash included. |

An account is optional. If you sign in, your data syncs to the hosted server in
the open — simple, nothing to remember, but the operator's Supabase project can
technically read it. There is currently no end-to-end encrypted option.

## Developing

```bash
npm install       # first time only
npm run dev       # local dev server with hot reload
npm run build     # builds the deployable site into docs/
```

Source lives under `src/` (React components, one file per tab/sheet, plus `src/lib/`
for the pure business logic — parsers, categorisation, matching, sync). `index.html`
and `app/index.html` at the repo root are Vite's entry points, not the served pages
themselves; `npm run build` turns them (plus everything in `src/`) into the real
static site under `docs/`, which is what GitHub Pages actually serves.

## Put it on GitHub Pages

1. Go to **github.com/new**. Name it `budget`, set it to **Public**, click *Create repository*.
   (GitHub Pages only works from public repos on the free plan.)
2. Push this repo, including the `docs/` folder produced by `npm run build`.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder **`/docs`** → **Save**.
4. Wait about a minute. Your URL is `https://YOURNAME.github.io/budget/` (or your custom
   domain, via the `CNAME` file under `public/`).

## Install on iPhone

1. Open the URL in **Safari** (must be Safari — Chrome on iOS cannot install web apps).
   Works from either `index.html` or `app/`; it always launches into the app.
2. Tap the **Share** button (square with an arrow).
3. Scroll down, tap **Add to Home Screen**, then **Add**.
4. Launch it from the home screen. It opens full-screen with no browser bars.

## Install on Android

Open the URL in Chrome. You should get an *Install app* prompt; if not,
use ⋮ → **Add to Home screen**.

## First run

Either sign in / create an account from the front page, or skip that entirely — the
app works fully without one. If you're moving from an existing setup:

1. Go to **Budget** → **Settings → Data** → **Restore from backup** → pick your JSON backup.
   That loads your income, pay day, category targets, shortcut buttons and merchant rules.
2. Go to **Reports** (or Home's **Upload Statement**) and drop in your bank statement PDF/CSV to build up history.
3. Do your first **Scan Receipt** while on wifi — it downloads the OCR engine once (~4 MB),
   then caches it for offline use.

## Day to day

| Tab | What it's for |
|---|---|
| **Home** | Safe-to-spend, budget status, quick insight, quick actions, recent activity |
| **Spending** | Where your money went this month/last month, full transaction list |
| **Budget** | Income, pay day, category targets, recommended budget |
| **Receipts** | Scan a slip, browse photographed receipts, reconcile against a statement |
| **Reports** | Monthly review, biggest changes, recurring payments, CSV export |

Settings (account, device lock, tax deductions, data backup) live under the account
menu (top right), not the main nav.

## Backups matter

Your data lives only in this browser on this phone (or your account, if signed in).
**Settings → Data → Export backup (JSON)** every week or two, and keep it somewhere safe.
Clearing site data, or losing the phone, loses the lot if you're signed out.

Photos are stored separately in IndexedDB and are *not* in the JSON backup.
Use **Export transactions (CSV)** if you want the numbers in a spreadsheet.

## Notes and limits

- **OCR is a helper, not an oracle.** On a creased or dim slip it will get the total
  wrong. Nothing saves without your confirmation — check the number before tapping save.
- **Reconciliation** matches on exact amount within ±4 days. Same-amount purchases close
  together may pair with the wrong slip; the Receipts tab shows you every pairing.
- **Statement parsing** is built for FNB's PDF layout, plus a header-sniffing CSV parser
  for Capitec, Standard Bank, Absa and Nedbank. Other banks will need the parser adjusted.
- The hosted files contain **no personal information** — your figures arrive only when
  you sign in or restore your backup file on the device.
