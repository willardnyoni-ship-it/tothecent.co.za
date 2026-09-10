import { useEffect, useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { cycleAt, inCycle } from '../lib/cycle.js';
import { dueThisCycle } from '../lib/recurring.js';
import { netSaved } from '../lib/milestones.js';
import { R2, fmtD } from '../lib/format.js';

const KH_KEY = 'wnKhanyiso_v1';
function loadKhHistory() { try { return JSON.parse(localStorage.getItem(KH_KEY)) || []; } catch (e) { return []; } }
function saveKhHistory(h) { try { localStorage.setItem(KH_KEY, JSON.stringify(h.slice(-40))); } catch (e) { /* ignore */ } }

function buildContext(S, cycleOffset) {
  const c = cycleAt(S.cycleDay, cycleOffset);
  const active = S.tx.filter(t => !t.mt);
  const tx = active.filter(t => inCycle(t, c));
  const spentBy = {};
  tx.forEach(t => spentBy[t.c] = (spentBy[t.c] || 0) + t.a);
  const spent = tx.reduce((a, t) => a + t.a, 0);
  const budTot = S.cats.reduce((a, x) => a + x.t, 0);
  const due = dueThisCycle(active, tx, cycleOffset);

  const lines = [];
  lines.push('Cycle: ' + fmtD(c.s) + ' to ' + fmtD(c.e) + (cycleOffset === 0 ? ' (current)' : ' (past, viewing history)'));
  lines.push('Income this cycle: ' + R2(S.income || 0));
  lines.push('Total budget target: ' + R2(budTot) + ' | Spent so far: ' + R2(spent) + ' | ' + (budTot - spent >= 0 ? R2(budTot - spent) + ' remaining' : R2(spent - budTot) + ' over budget'));
  if (S.savingsGoal) lines.push('Savings goal per cycle: ' + R2(S.savingsGoal) + ' | Net saved to date: ' + R2(netSaved(S.flows)));

  lines.push('\nCategories (target vs spent this cycle):');
  S.cats.forEach(x => {
    const sp = spentBy[x.n] || 0;
    lines.push('- ' + x.n + ': target ' + R2(x.t) + ', spent ' + R2(sp) + (x.t && sp > x.t ? ' (OVER by ' + R2(sp - x.t) + ')' : ''));
  });

  if (due.length) {
    lines.push('\nBills expected but not yet paid this cycle:');
    due.forEach(r => lines.push('- ' + r.name + ': ' + R2(r.amount)));
  }

  const recent = [...active].sort((a, b) => (b.d || '').localeCompare(a.d || '')).slice(0, 15);
  if (recent.length) {
    lines.push('\nMost recent transactions:');
    recent.forEach(t => lines.push('- ' + t.d + ' | ' + R2(t.a) + ' | ' + t.c + (t.note ? ' | ' + t.note : '')));
  }

  const byMonth = {};
  active.forEach(t => { const m = (t.d || '').slice(0, 7); if (m) byMonth[m] = (byMonth[m] || 0) + t.a; });
  const months = Object.keys(byMonth).sort().slice(-6);
  if (months.length > 1) {
    lines.push('\nSpend by month (recent history):');
    months.forEach(m => lines.push('- ' + m + ': ' + R2(byMonth[m])));
  }
  return lines.join('\n');
}

export default function Khanyiso({ cycleOffset }) {
  const { S, syncCfg, ensureToken } = useBudget();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(loadKhHistory);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const msgsRef = useRef(null), inputRef = useRef(null);
  const signedIn = !!syncCfg.token;

  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, [history, busy, open]);
  useEffect(() => { if (open && signedIn) setTimeout(() => inputRef.current?.focus(), 200); }, [open, signedIn]);

  async function send() {
    if (busy || !text.trim() || !signedIn) return;
    const next = [...history, { role: 'user', content: text.trim() }];
    setHistory(next); saveKhHistory(next); setText(''); setBusy(true);
    try {
      const token = await ensureToken();
      const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/functions/v1/khanyiso-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: syncCfg.key },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })), context: buildContext(S, cycleOffset) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Khanyiso could not reply.');
      const withReply = [...next, { role: 'assistant', content: data.reply || "I'm not sure how to answer that." }];
      setHistory(withReply); saveKhHistory(withReply);
    } catch (e) {
      const withErr = [...next, { role: 'system', content: 'Could not reach Khanyiso: ' + (e.message || 'unknown error') + '. Try again in a moment.' }];
      setHistory(withErr); saveKhHistory(withErr);
    } finally { setBusy(false); }
  }

  return (
    <>
      <button className="khFab" aria-label="Chat with Khanyiso" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1.3-4.5A8.5 8.5 0 1 1 21 11.5z" />
        </svg>
      </button>
      <div className={'khPanel' + (open ? ' on' : '')}>
        <div className="khHead">
          <div className="khAvatar">K</div>
          <div><div className="khTitle">Khanyiso</div><div className="khSub">Your budget, in plain language</div></div>
          <button className="khClose" onClick={() => setOpen(false)}>&times;</button>
        </div>
        <div className="khMsgs" ref={msgsRef}>
          {!signedIn ? (
            <div className="khRow sys"><div className="khBub">Sign in under Settings to chat with Khanyiso - it needs an account so it can answer securely without your budget data leaving the app to anyone else.</div></div>
          ) : history.length === 0 ? (
            <div className="khRow ai"><div className="khBub">Hi, I'm Khanyiso. Ask me about your spending, budget or trends here in the app - that's all I can see, and I can't give financial advice.</div></div>
          ) : history.map((m, i) => (
            <div className={'khRow ' + (m.role === 'user' ? 'me' : m.role === 'system' ? 'sys' : 'ai')} key={i}><div className="khBub">{m.content}</div></div>
          ))}
          {busy && <div className="khRow ai"><div className="khBub khTyping"><span /><span /><span /></div></div>}
        </div>
        <div className="khNote">Khanyiso can only see your budget data, and can't give financial advice.</div>
        <div className="khInputBar">
          <textarea ref={inputRef} placeholder="Ask about your spending..." value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="khSend" disabled={busy} onClick={send} aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
          </button>
        </div>
      </div>
    </>
  );
}
