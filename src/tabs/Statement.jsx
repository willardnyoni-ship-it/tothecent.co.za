import { useRef, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useNav } from '../app/NavContext.jsx';
import { parsePdf } from '../lib/parsePdf.js';
import { parseCsv } from '../lib/parseCsv.js';
import { matchSets, isStmt, isLog } from '../lib/match.js';
import { uid, R, R2 } from '../lib/format.js';
import { uploadStatement } from '../lib/photos.js';

export default function Statement() {
  const { S, update, syncCfg, ensureToken, markStatementImport } = useBudget();
  const { go } = useNav();
  const fileRef = useRef(null), csvRef = useRef(null), dropRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null); // { pending, pendingFlows, byCat, tot, pairs, dupes, file, bank, kind }
  const [dragOver, setDragOver] = useState(false);

  function buildPreview(rawTx, skipped, file, bank, kind) {
    const seen = new Set(S.tx.filter(isStmt).map(t => t.d + '|' + t.a.toFixed(2) + '|' + (t.note || '')));
    const fresh = rawTx.filter(t => !seen.has(t.d + '|' + t.a.toFixed(2) + '|' + t.desc));
    const dupes = rawTx.length - fresh.length;
    const pending = fresh.map(t => ({ id: uid(), a: t.a, c: t.c, note: t.desc, d: t.d, src: kind }));

    const fseen = new Set((S.flows || []).map(x => x.d + '|' + x.a.toFixed(2) + '|' + x.note));
    const pendingFlows = (skipped || []).filter(x => x.kind && x.kind !== 'income')
      .map(x => ({ id: uid(), d: x.d, a: x.a, note: x.desc, dir: x.kind === 'savings-out' ? 'out' : 'in' }))
      .filter(x => !fseen.has(x.d + '|' + x.a.toFixed(2) + '|' + x.note));

    const logged = S.tx.filter(isLog);
    const { pairs } = matchSets(pending, logged);
    const byCat = {};
    pending.forEach(t => byCat[t.c] = (byCat[t.c] || 0) + t.a);
    const tot = pending.reduce((a, t) => a + t.a, 0);

    setPreview({ pending, pendingFlows, byCat, tot, pairs, dupes, file, bank, kind, total: rawTx.length });
  }

  async function handlePdf(f) {
    setMsg({ kind: 'i', text: `Reading ${f.name} …` });
    setPreview(null);
    try {
      const r = await parsePdf(f, S.memory, S.rules, syncCfg, ensureToken);
      if (!r.tx.length) {
        return setMsg({ kind: 'e', text: r.needsSignIn
          ? "Could not read this statement. Sign in under Settings to read any of the big five banks' PDFs automatically, or use \"Import a CSV instead\" below."
          : 'No spending transactions found in that statement. Try "Import a CSV instead" below, or check the PDF opens normally.' });
      }
      buildPreview(r.tx, r.skipped, f, r.bank || 'FNB', 'pdf');
      setMsg({ kind: 's', text: `Parsed ${r.tx.length} debits` });
    } catch (err) {
      setMsg({ kind: 'e', text: 'Could not read that PDF: ' + err.message });
    }
  }

  async function handleCsv(f) {
    setMsg({ kind: 'i', text: `Reading ${f.name} …` });
    setPreview(null);
    try {
      const text = await f.text();
      const r = parseCsv(text, S.memory, S.rules);
      if (r.error) return setMsg({ kind: 'e', text: r.error });
      if (!r.tx.length) return setMsg({ kind: 'e', text: 'No spending rows found in that CSV.' });
      buildPreview(r.tx, r.skipped, f, r.bank || 'CSV', 'csv');
      setMsg({ kind: 's', text: r.header });
    } catch (err) {
      setMsg({ kind: 'e', text: 'Could not read that CSV: ' + err.message });
    }
  }

  function commit() {
    if (!preview || !preview.pending.length) return;
    update(s => {
      const cats = [...s.cats];
      preview.pending.forEach(t => { if (!cats.some(c => c.n === t.c)) cats.push({ n: t.c, t: 0 }); });
      return { ...s, cats, tx: [...s.tx, ...preview.pending], flows: [...(s.flows || []), ...preview.pendingFlows] };
    });
    if (preview.file) {
      const dates = preview.pending.map(t => t.d).sort();
      uploadStatement(preview.file, { bank: preview.bank, kind: preview.kind, txCount: preview.pending.length, periodStart: dates[0], periodEnd: dates[dates.length - 1] }, syncCfg, ensureToken, uid);
    }
    const n = preview.pending.length;
    setPreview(null);
    markStatementImport();
    setMsg({ kind: 's', text: `${n} statement lines added. Check the Receipts tab.` });
    go('receipts');
  }

  return (
    <section className="tab on light-tab" id="t-stmt">
      <h1>Upload a bank statement</h1>
      <h2>Import a statement</h2>
      <div className="sub">Download the statement PDF from your bank's app, then drop it here. Read on your phone when the
        layout is recognised straight away; signed in, an unrecognised PDF is read more accurately on our server instead so any
        of the big five still works.</div>

      <div style={{ height: 14 }} />
      <div ref={dropRef} className={'drop' + (dragOver ? ' hot' : '')} onClick={() => fileRef.current?.click()}
        onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handlePdf(f); }}>
        <div style={{ fontSize: 34 }}>&#128196;</div>
        <div style={{ marginTop: 8, fontWeight: 600 }}>Tap to choose a statement</div>
        <div className="mini" style={{ marginTop: 4 }}>A PDF or CSV from any of the big five</div>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) handlePdf(f); e.target.value = ''; }} />
      <div style={{ height: 8 }} />
      <button className="b g" onClick={() => csvRef.current?.click()}>Import a CSV instead</button>
      <input ref={csvRef} type="file" accept=".csv,.txt,text/csv,text/plain" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) handleCsv(f); e.target.value = ''; }} />
      <div className="mini" style={{ marginTop: 9 }}>Capitec &middot; FNB &middot; Standard Bank &middot; Absa &middot; Nedbank.
        Signed out, discarded the moment it's parsed and never uploaded. Signed in, once you confirm the import the file itself
        is also kept in your account, visible only to you.</div>

      {msg && <div className={'msg ' + msg.kind}>{msg.text}</div>}

      {preview && (
        <>
          <div className="card">
            <div className="row"><div style={{ fontWeight: 700 }}>{preview.pending.length} new statement lines</div><div className="mono" style={{ fontWeight: 700 }}>{R2(preview.tot)}</div></div>
            <div className="mini" style={{ marginTop: 4 }}>Credits, transfers between your own accounts and payments to Investment were excluded - they are not spending.</div>
            {preview.dupes > 0 && <div className="infobox" style={{ marginTop: 11 }}>{preview.dupes} line{preview.dupes === 1 ? '' : 's'} already in your account were skipped - not added twice.</div>}
            {preview.pairs.length > 0 && <div className="infobox" style={{ marginTop: 11 }}>{preview.pairs.length} of these already match slips you logged. They will be folded together, not double-counted.</div>}
            {preview.pendingFlows.length > 0 && <div className="infobox" style={{ marginTop: 11 }}>{preview.pendingFlows.length} savings movement(s) also found - tracked separately under Reports, not counted as spending.</div>}
            <table style={{ marginTop: 10 }}><tbody>
              {Object.entries(preview.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{k}</td><td className="r">{R(v)}</td></tr>)}
            </tbody></table>
            <div style={{ height: 12 }} />
            {preview.pending.length ? <button className="b" onClick={commit}>Add these {preview.pending.length} and reconcile</button> : <div className="mini">Nothing new to add.</div>}
          </div>
          <h2>Preview</h2>
          <div className="card"><table><tbody>
            {preview.pending.slice(0, 60).map(t => (
              <tr key={t.id}><td>{t.note || '(bank fee)'}<div className="tag">{t.c} &middot; {t.d}</div></td><td className="r">{R2(t.a)}</td></tr>
            ))}
            {preview.pending.length > 60 && <tr><td className="mini">…and {preview.pending.length - 60} more</td><td /></tr>}
          </tbody></table></div>
        </>
      )}
      <div style={{ height: 20 }} />
    </section>
  );
}
