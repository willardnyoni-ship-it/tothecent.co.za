import { useEffect, useState } from 'react';
import { photoUrl } from '../lib/photos.js';
import { useBudget } from '../store/BudgetStore.jsx';

// A slip's thumbnail. Loads the local IndexedDB copy, or (signed in) falls
// back to the Supabase Storage backup - same as the original's hydrateThumbs().
export default function PhotoThumb({ pid, onClick, title }) {
  const { syncCfg, ensureToken } = useBudget();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    photoUrl(pid, syncCfg, ensureToken).then(u => { if (live) setUrl(u); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  if (!url) return <span className="rthumb" title={title || 'View slip'} />;
  return (
    <button className="rthumb" style={{ backgroundImage: `url(${url})` }} title={title || 'View slip'}
      aria-label="View slip photo" onClick={e => { e.stopPropagation(); onClick?.(); }} />
  );
}
