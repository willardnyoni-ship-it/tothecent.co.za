import { useMemo } from 'react';
import { useBusiness } from '../store/BusinessStore.jsx';
import { R2 } from '../lib/format.js';

// The options a sale line can pick from: stock items and (if there are any)
// recipes / dishes. Value is "s:<id>" or "r:<id>".
export function useSaleOptions() {
  const { stockItems, recipes } = useBusiness();
  return useMemo(() => {
    const items = stockItems.filter(i => !i.archived).sort((a, b) => a.name.localeCompare(b.name));
    const dishes = recipes.filter(r => !r.archived).sort((a, b) => a.name.localeCompare(b.name));
    const find = ref => (ref.startsWith('r:') ? dishes.find(r => r.id === ref.slice(2)) : items.find(i => i.id === ref.slice(2)));
    const priceOf = ref => { const x = find(ref); return x ? +(ref.startsWith('r:') ? x.selling_price : x.sell_price) || 0 : 0; };
    return { items, dishes, find, priceOf };
  }, [stockItems, recipes]);
}

export function SaleOptionList({ opts }) {
  return (
    <>
      <option value="">Choose…</option>
      {opts.dishes.length > 0 && <optgroup label="Dishes & services">{opts.dishes.map(r => <option key={r.id} value={'r:' + r.id}>{r.name} - {R2(+r.selling_price)}</option>)}</optgroup>}
      <optgroup label="Stock items">{opts.items.map(i => <option key={i.id} value={'s:' + i.id}>{i.name} - {R2(+i.sell_price)} (have {+i.qty_on_hand})</option>)}</optgroup>
    </>
  );
}
