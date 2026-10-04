// How selling things uses stock - the same maths as src/lib/recipeMath.js
// (kept as a copy because an Edge Function can't import from the app; a test
// in yocoLogic.test.mjs checks the two stay in step).
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function recipeCost(lines: Row[], items: Row[]) {
  const ingredients = lines.map((l) => {
    const item = items.find((i) => i.id === l.item_id);
    return { line: l, cost: r4((+l.qty || 0) * (item ? +item.cost_price || 0 : 0)) };
  });
  return { ingredients, batch: r4(ingredients.reduce((a, g) => a + g.cost, 0)) };
}

// Sale lines { stock_item_id | recipe_id, qty, price } -> { itemId: { qty, revenue } }.
// A recipe uses its ingredients (qty / yield per portion), and the portion's
// price is shared between them by cost.
export function usageFor(lines: Row[], recipes: Row[], recipeLines: Row[], items: Row[]) {
  const out: Record<string, { qty: number; revenue: number }> = {};
  const add = (id: string, qty: number, revenue: number) => {
    const e = out[id] || (out[id] = { qty: 0, revenue: 0 });
    e.qty = r4(e.qty + qty);
    e.revenue = r2(e.revenue + revenue);
  };
  for (const l of lines) {
    const qty = +l.qty || 0;
    if (!(qty > 0)) continue;
    const revenue = qty * (+l.price || 0);
    if (l.recipe_id) {
      const rec = recipes.find((r) => r.id === l.recipe_id);
      if (!rec) continue;
      const rl = recipeLines.filter((x) => x.recipe_id === rec.id);
      if (!rl.length) continue;
      const c = recipeCost(rl, items);
      const per = +rec.yield_portions > 0 ? +rec.yield_portions : 1;
      c.ingredients.forEach((g) => {
        const share = c.batch > 0 ? g.cost / c.batch : 1 / rl.length;
        add(g.line.item_id, (+g.line.qty / per) * qty, revenue * share);
      });
    } else if (l.stock_item_id) {
      add(l.stock_item_id, qty, revenue);
    }
  }
  return out;
}
