import { useState } from 'react';
import { PRICES, useSubscription } from '../lib/subscription.js';
import { R } from '../lib/format.js';

const day = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const daysTo = d => Math.ceil((new Date(d + 'T12:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00')) / 86400000);
const NAMES = { personal: 'Personal', business: 'Business' };

// The customer's plan: choose, pay, see the card and next payment, change card, cancel.
export default function SubscriptionPanel() {
  const { b, loading, reload, call, signedIn } = useSubscription();
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sure, setSure] = useState(false);

  if (loading) return <div className="card"><div className="mini">Loading your plan…</div></div>;
  if (!signedIn || !b) return <div className="card"><div style={{ fontWeight: 700 }}>Your plan</div><div className="mini" style={{ marginTop: 6 }}>Sign in to see your plan and subscribe.</div></div>;

  const chosen = plan || b.suggested_plan || 'personal';
  const left = b.trial_ends_on ? daysTo(b.trial_ends_on) : 0;
  const trialing = left > 0;

  async function go(action, extra) {
    setBusy(true); setMsg(null);
    const r = await call(action, extra);
    setBusy(false);
    if (r.ok && r.url) { window.location.href = r.url; return; }
    if (r.ok) { await reload(); setSure(false); setMsg({ t: action === 'cancel' ? 'Your subscription is cancelled. You will not be charged again.' : "You're subscribed. Thank you!" }); return; }
    setMsg({ e: true, t: r.error || 'Something went wrong.' });
  }

  return (
    <>
      {b.pay_issue && <div className="msg e" style={{ marginBottom: 10 }}>{b.pay_issue}</div>}

      {b.status === 'active' ? (
        <div className="card">
          <div style={{ fontWeight: 700 }}>{NAMES[b.plan] || 'Your'} plan <span className="mini ok" style={{ marginLeft: 6 }}>Subscribed</span></div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{R(PRICES[b.plan] || 0)}<small style={{ fontSize: 14, fontWeight: 400 }}> / month</small></div>
          {b.card_last4 && <div className="mini" style={{ marginTop: 8 }}>Card: {String(b.card_brand || 'card').replace(/^./, c => c.toUpperCase())} ending {b.card_last4}</div>}
          {b.next_payment_on && <div className="mini">{trialing ? 'First payment' : 'Next payment'}: {day(b.next_payment_on)}</div>}
          <div style={{ height: 12 }} />
          <button className="b g" disabled={busy} onClick={() => go('manage')}>Change card</button>
          <div style={{ height: 8 }} />
          {!sure
            ? <button className="b g sm" style={{ width: '100%' }} onClick={() => setSure(true)}>Cancel subscription</button>
            : (
              <div className="infobox">
                <b>Cancel your subscription?</b> You will not be charged again. Your data stays yours.
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button className="b" disabled={busy} onClick={() => go('cancel')}>Yes, cancel</button>
                  <button className="b g" onClick={() => setSure(false)}>Keep it</button>
                </div>
              </div>
            )}
        </div>
      ) : (
        <div className="card">
          <div style={{ fontWeight: 700 }}>{b.status === 'cancelled' ? 'Subscribe again' : 'Subscribe'}</div>
          <div className="mini" style={{ marginTop: 4 }}>
            {trialing ? `Your free month ends on ${day(b.trial_ends_on)} (${left} day${left === 1 ? '' : 's'} left). Add your card now and the first payment only happens that day.` : 'Your free month has ended. Subscribe to keep going.'}
          </div>
          <div className="seg" style={{ marginTop: 12 }}>
            {['personal', 'business'].map(p => <button key={p} className={chosen === p ? 'on' : ''} onClick={() => setPlan(p)}>{NAMES[p]} {R(PRICES[p])}</button>)}
          </div>
          <div className="mini" style={{ marginTop: 8 }}>{chosen === 'business' ? 'Invoices, VAT, payroll, stock and bookings, plus the personal budget.' : 'Your own budget: safe to spend, slips and statements.'}</div>
          <div style={{ height: 12 }} />
          <button className="b" disabled={busy} onClick={() => go('subscribe', { plan: chosen })}>
            {busy ? 'Opening…' : trialing ? 'Add card and subscribe' : `Subscribe - ${R(PRICES[chosen])} today`}
          </button>
          <div className="mini" style={{ marginTop: 8 }}>{trialing ? 'We take R1 to check your card and refund it straight away. ' : ''}Paid by card, monthly. Cancel any time. Payments are handled by Paystack - we never see your card number.</div>
        </div>
      )}
      {msg && <div className={'msg ' + (msg.e ? 'e' : 's')} style={{ marginTop: 10 }}>{msg.t}</div>}
    </>
  );
}
