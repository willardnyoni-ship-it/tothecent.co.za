import { useMemo, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useNav } from '../app/NavContext.jsx';
import { cycleAt, inCycle } from '../lib/cycle.js';
import { matchSets, isStmt, isLog } from '../lib/match.js';
import { R, R2 } from '../lib/format.js';
import { useEditTx } from '../components/EditTxSheet.jsx';
import { useViewShot } from '../components/ViewShotSheet.jsx';
import PhotoThumb from '../components/PhotoThumb.jsx';

function MatchBody({ scope }) {
  const { S, update } = useBudget();
  const c = cycleAt(S.cycleDay, 0);
  const inScope = t => scope === 'all' ? true : inCycle(t, c);
  const stmt = S.tx.filter(t => isStmt(t) && inScope(t));
  const logged = S.tx.filter(t => isLog(t) && inScope(t));

  if (!stmt.length) {
    return (
      <>
        <div className="infobox">No statement imported for this period yet. Log slips as you spend, then import a bank statement at month end - everything gets matched up here.</div>
        <div className="card"><div className="row"><div>Slips logged, awaiting a statement</div><div className="mono" style={{ fontWeight: 700 }}>{logged.length}</div></div>
          <div className="mini" style={{ marginTop: 6 }}>Worth {R2(logged.reduce((a, t) => a + t.a, 0))}</div></div>
      </>
    );
  }

  const { pairs, logOnly, stmtOnly } = matchSets(stmt, logged);
  const pct = logged.length ? Math.round(pairs.length / logged.length * 100) : 0;

  function applyMatches() {
    update(s => ({
      ...s,
      tx: s.tx.map(t => {
        const p = pairs.find(p => p.log.id === t.id);
        return p ? { ...t, mt: true } : t;
      }),
    }));
  }

  return (
    <>
      <div className="card">
        <div className="row">
          <div><div className="mini">Slips matched to the statement</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>{pairs.length} <span style={{ color: 'var(--dim)', fontSize: 18 }}>of {logged.length}</span></div></div>
          <div style={{ textAlign: 'right' }}><div className="mini">Capture rate</div>
            <div className={'mono ' + (pct >= 80 ? 'ok' : pct >= 50 ? 'wn' : 'bd')} style={{ fontSize: 26, fontWeight: 700 }}>{pct}%</div></div>
        </div>
        <div className="bar"><i style={{ width: pct + '%', background: pct >= 80 ? 'var(--acc)' : pct >= 50 ? 'var(--warn)' : 'var(--bad)' }} /></div>
      </div>

      {pairs.length > 0 && (
        <div className="card">
          <button className="b" onClick={applyMatches}>Fold {pairs.length} matched slip{pairs.length === 1 ? '' : 's'} into the statement</button>
          <div className="mini" style={{ marginTop: 8 }}>Keeps the statement amount and your slip photo, and stops the same spend being counted twice.</div>
        </div>
      )}

      <h2>On the statement, never logged &mdash; {stmtOnly.length}</h2>
      <div className="card">
        {stmtOnly.length ? (
          <>
            <div className="mini" style={{ marginBottom: 8 }}>Your blind spots. Worth {R2(stmtOnly.reduce((a, t) => a + t.a, 0))}.</div>
            <table><tbody>{stmtOnly.sort((a, b) => b.a - a.a).slice(0, 40).map(t => (
              <tr key={t.id}><td>{t.note || t.c}<div className="tag">{t.c} &middot; {t.d}</div></td><td className="r">{R2(t.a)}</td></tr>
            ))}</tbody></table>
          </>
        ) : <div className="mini">Nothing missed. Every statement line has a slip.</div>}
      </div>

      <h2>Logged, but not on the statement &mdash; {logOnly.length}</h2>
      <div className="card">
        {logOnly.length ? (
          <table><tbody>{logOnly.sort((a, b) => b.d.localeCompare(a.d)).map(t => (
            <tr key={t.id}><td>{t.note || t.c}<div className="tag wn">{t.c} &middot; {t.d}</div></td><td className="r">{R2(t.a)}</td></tr>
          ))}</tbody></table>
        ) : <div className="mini">Every slip you logged appears on the statement.</div>}
      </div>

      {pairs.length > 0 && (
        <>
          <h2>Matched &mdash; {pairs.length}</h2>
          <div className="card"><table><tbody>
            {pairs.slice(0, 40).map((p, i) => (
              <tr key={i}><td>{p.log.note || p.log.c}<div className="tag ok">matched to &ldquo;{(p.stmt.note || '').slice(0, 26)}&rdquo;{p.days ? ` · ${p.days}d apart` : ' · same day'}</div></td><td className="r">{R2(p.stmt.a)}</td></tr>
            ))}
          </tbody></table></div>
        </>
      )}
    </>
  );
}

export default function Receipts() {
  const { S } = useBudget();
  const { go, setSnapAction } = useNav();
  const editTx = useEditTx();
  const viewShot = useViewShot();
  const [scope, setScope] = useState('all');

  const receipts = useMemo(() =>
    S.tx.filter(t => t.photo || t.photoGone)
      .sort((a, b) => b.d.localeCompare(a.d) || String(b.id).localeCompare(String(a.id)))
      .slice(0, 60),
    [S.tx]);

  return (
    <section className="tab on light-tab" id="t-receipts">
      <h1>Receipts</h1>
      <button className="b" style={{ marginBottom: 18 }} onClick={() => { setSnapAction('camera'); go('snap'); }}>&#128247; Scan Receipt</button>

      <h2>Your receipts</h2>
      <div className="card"><table><tbody>
        {receipts.length ? receipts.map(t => (
          <tr key={t.id} onClick={() => editTx(t.id)} style={{ cursor: 'pointer' }}>
            <td className="thumbCell">{t.photo ? <PhotoThumb pid={t.photo} onClick={() => viewShot(t.id)} /> : <span className="rthumb gone">&#8709;</span>}</td>
            <td><div style={{ fontWeight: 600 }}>{t.note || t.c}</div><div className="tag">{t.d}{t.cash ? ' · cash' : ''}</div></td>
            <td className="r">{R2(t.a)}</td>
          </tr>
        )) : <tr><td className="mini" colSpan={3}>No receipts scanned yet.</td></tr>}
      </tbody></table></div>

      <h2>Matching</h2>
      <div className="sub">Your slips against the bank statement. The statement is always treated as the truth.</div>
      <div style={{ height: 12 }} />
      <div className="seg">
        <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All time</button>
        <button className={scope === 'cycle' ? 'on' : ''} onClick={() => setScope('cycle')}>This cycle</button>
      </div>
      <MatchBody scope={scope} />
      <div style={{ height: 20 }} />
    </section>
  );
}
