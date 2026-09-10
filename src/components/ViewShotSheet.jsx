import { useEffect, useState } from 'react';
import { useBudget } from '../store/BudgetStore.jsx';
import { useSheet } from './Sheet.jsx';
import { photoUrl } from '../lib/photos.js';
import { R2 } from '../lib/format.js';

function ViewShotContent({ txId }) {
  const { S, syncCfg, ensureToken } = useBudget();
  const { close } = useSheet();
  const t = S.tx.find(x => String(x.id) === String(txId));
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!t?.photo) return;
    let live = true;
    photoUrl(t.photo, syncCfg, ensureToken).then(u => { if (live) setUrl(u); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.photo]);

  if (!t) return null;
  return (
    <>
      <div className="row"><h1>Slip</h1><button className="b g sm" onClick={close}>Close</button></div>
      <div className="sub">{t.note || t.c} · {R2(t.a)}</div>
      <div style={{ height: 12 }} />
      {url ? <img className="shot" src={url} alt="Till slip" /> : <div className="mini">Loading photo…</div>}
    </>
  );
}

export function useViewShot() {
  const { open } = useSheet();
  return (txId) => open(() => <ViewShotContent txId={txId} />);
}
