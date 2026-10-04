// Costing and stock usage. Pure functions - see recipeMath.test.mjs.
//
// A recipe is a dish (or a service) made from stock items: each line is "this
// much of that item" for the whole batch, and the batch makes `yield_portions`
// portions. Cost per portion is worked out live from the items' current cost
// prices, so it moves when a supplier's price does.

export const r2 = n => Math.round(n * 100) / 100;
export const r4 = n => Math.round(n * 10000) / 10000;

// Prices are rounded to the nearest 50c - sensible on a menu or a shelf.
export const roundPrice = n => Math.round((+n || 0) * 2) / 2;
export const markupPrice = (cost, markupPct) => roundPrice((+cost || 0) * (1 + (+markupPct || 0) / 100));
export const priceForMargin = (cost, marginPct) => (marginPct > 0 && marginPct < 100 ? roundPrice((+cost || 0) / (1 - marginPct / 100)) : 0);
export const suggestPrice = (costPerPortion, targetFoodCostPct) => (targetFoodCostPct > 0 && targetFoodCostPct < 100 ? roundPrice((+costPerPortion || 0) / (targetFoodCostPct / 100)) : 0);

// Food cost % is the share of the price that goes on ingredients: lower is
// better. Roughly 30% is the usual target for a restaurant.
export const foodCostTone = pct => (pct == null ? 'muted' : pct <= 32 ? 'good' : pct <= 40 ? 'warn' : 'bad');

export function recipeCost(recipe, lines, items) {
  const yieldN = +recipe.yield_portions > 0 ? +recipe.yield_portions : 1;
  const ingredients = lines.map(l => {
    const item = items.find(i => i.id === l.item_id);
    return { line: l, item, cost: r4((+l.qty || 0) * (item ? +item.cost_price || 0 : 0)) };
  });
  const batch = r4(ingredients.reduce((a, g) => a + g.cost, 0));
  const extra = +recipe.extra_cost || 0;
  const costPerPortion = r2(batch / yieldN + extra);
  const price = +recipe.selling_price || 0;
  const margin = r2(price - costPerPortion);
  return {
    ingredients, batch, yieldN, costPerPortion, price, margin,
    marginPct: price > 0 ? Math.round((margin / price) * 1000) / 10 : null,
    foodCostPct: price > 0 ? Math.round((costPerPortion / price) * 1000) / 10 : null,
    missing: ingredients.filter(g => !g.item).length,
    unpriced: ingredients.filter(g => g.item && !(+g.item.cost_price > 0)).length,
  };
}

// Sale lines -> how much of each stock item they use, and the revenue to
// credit to it. A line is { stock_item_id | recipe_id, qty, price }. Selling
// a recipe uses its ingredients (qty / yield per portion); the portion's
// price is shared between the ingredients by how much each costs, so the
// sales and cost figures stay consistent.
export function usageFor(lines, recipes, recipeLines, items) {
  const out = {};
  const add = (id, qty, revenue) => { const e = out[id] || (out[id] = { qty: 0, revenue: 0 }); e.qty = r4(e.qty + qty); e.revenue = r2(e.revenue + revenue); };
  for (const l of lines) {
    const qty = +l.qty || 0;
    if (!(qty > 0)) continue;
    const revenue = qty * (+l.price || 0);
    if (l.recipe_id) {
      const rec = recipes.find(r => r.id === l.recipe_id);
      if (!rec) continue;
      const rl = recipeLines.filter(x => x.recipe_id === rec.id);
      if (!rl.length) continue;
      const c = recipeCost(rec, rl, items);
      const per = +rec.yield_portions > 0 ? +rec.yield_portions : 1;
      c.ingredients.forEach(g => {
        const share = c.batch > 0 ? g.cost / c.batch : 1 / rl.length;
        add(g.line.item_id, (+g.line.qty / per) * qty, revenue * share);
      });
    } else if (l.stock_item_id) {
      add(l.stock_item_id, qty, revenue);
    }
  }
  return out;
}
