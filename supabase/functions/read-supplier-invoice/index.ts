// Reads a supplier invoice (a photo or a PDF) with Claude Haiku 4.5 and
// returns its line items, so a shop or café can capture a delivery into
// Stock without typing each line. Same safeguards as read-receipt: signed-in
// users only, and the Anthropic key lives in an Edge Function secret
// (ANTHROPIC_API_KEY), never in this file or the browser.
//
// Deployed with verify_jwt on. That alone only proves the token was signed
// for this project - the public anon key passes it too - so
// requireAuthenticatedUser() checks the token is a real signed-in user.
function requireAuthenticatedUser(req: Request): boolean {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "authenticated" && typeof payload.sub === "string" && payload.sub.length > 0;
  } catch {
    return false;
  }
}

const MODEL = "claude-haiku-4-5-20251001";
const MAX_B64_LEN = 9_000_000; // ~6.7MB decoded
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const PROMPT = `You are reading a South African supplier invoice (or delivery note / wholesale till slip) so a shop, cafe or salon can add the goods to its stock list.

Reply with ONLY one JSON object - no markdown fences, no commentary. Shape exactly:
{
  "supplier": string,               // the supplier / seller's trading name, "" if unclear
  "invoice_number": string,         // the invoice or document number, "" if none
  "date": string or null,           // invoice date as YYYY-MM-DD, null if not legible
  "prices_include_vat": boolean,    // true if the printed unit prices already include 15% VAT, false if they are shown excluding VAT
  "total": number or null,          // the invoice grand total as printed (incl VAT), null if not legible
  "lines": [
    {
      "description": string,        // the product as printed, cleaned of obvious codes, e.g. "Coca-Cola 2L"
      "qty": number,                // quantity of units bought
      "unit": string,               // "each", "kg", "box", "tray", "case", "pack" ... what a unit is; "each" if unclear
      "unit_price": number or null, // price per ONE unit as printed, null if only a line total is shown
      "line_total": number or null  // the printed total for that line, null if not shown
    }
  ]
}

Rules:
- Include only goods (things that go on a shelf or into a recipe). Leave out delivery fees, discounts, VAT lines, subtotals, deposits and payment details.
- If an item is sold in a pack (e.g. "6 x 2L"), report the number of PACKS as qty and put the pack in the description, so qty x unit_price equals the line total.
- Amounts are South African Rand. Never add or remove VAT yourself - report what is printed and set prices_include_vat.
- If this is not an invoice or you cannot read any lines, return "lines": [] rather than guessing.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status: number) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!requireAuthenticatedUser(req)) return json({ error: "Sign in required" }, 401);

  let body: { file?: string; mimeType?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const { file } = body;
  const mime = String(body.mimeType || "image/jpeg").toLowerCase();
  if (!file || typeof file !== "string") return json({ error: "Missing file" }, 400);
  if (!ALLOWED.has(mime)) return json({ error: "Unsupported file type" }, 415);
  if (file.length > MAX_B64_LEN) return json({ error: "File too large" }, 413);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Server not configured" }, 500);

  const block = mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: mime, data: file } }
    : { type: "image", source: { type: "base64", media_type: mime, data: file } };

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }] }),
      signal: AbortSignal.timeout(50000),
    });
  } catch (e) {
    return json({ error: "Upstream request failed", detail: String(e).slice(0, 200) }, 502);
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return json({ error: "Upstream error", status: upstream.status, detail: detail.slice(0, 300) }, 502);
  }

  const data = await upstream.json();
  const text = (data.content || []).find((b: { type: string }) => b.type === "text");
  if (!text) return json({ error: "No text in model response" }, 502);
  try {
    const cleaned = String(text.text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    return json(JSON.parse(cleaned), 200);
  } catch {
    return json({ error: "Could not parse model output" }, 502);
  }
});
