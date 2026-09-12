// Reads a bank statement PDF's extracted text with Claude Haiku 4.5 and
// returns which bank it's from plus a structured transaction list. This is
// the fallback for any statement that isn't FNB's fixed column layout (the
// only one parsePdf.js's fast local parser understands) - Capitec, Standard
// Bank, Absa, Nedbank, or an FNB layout change all land here instead of
// failing outright. Signed-in users only, same gate as read-receipt.
function requireAuthenticatedUser(req: Request): boolean {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "authenticated" && typeof payload.sub === "string" && payload.sub.length > 0;
  } catch {
    return false;
  }
}

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_TEXT_LEN = 60_000; // generously above what the client ever sends (it caps at 20k)

const PROMPT = `You are reading the raw text extracted from a South African bank statement PDF for a
budgeting app. Text extraction from a PDF can jumble column spacing and line breaks, so use
context and the usual conventions of SA bank statements to reconstruct each transaction.

First work out which bank produced this statement.

Then list every individual transaction line - ignore page headers/footers, marketing text,
running balance columns on their own, and summary/totals rows that aren't a real transaction.
For each transaction:
- date: the transaction's own date as YYYY-MM-DD (use the statement's stated year/month if a
  row only shows a day, or if the year is ambiguous)
- desc: the description/narrative as printed, with obvious noise removed (card masks, reference
  number strings, repeated whitespace) but otherwise left recognisable
- amount: the transaction's value as a positive number, in Rand
- is_credit: true if money came IN to the account (salary, refund, transfer in, interest), false
  if money went OUT (a purchase, debit order, fee, transfer out, cash withdrawal)

Reply with ONLY a single JSON object, no markdown fencing, no commentary before or after it.
Shape exactly:
{
  "bank": string,  // "Capitec", "FNB", "Standard Bank", "Absa", "Nedbank", or "Unknown"
  "transactions": [ { "date": string, "desc": string, "amount": number, "is_credit": boolean } ]
}

If you cannot find any real transaction lines at all, return "transactions": [] rather than
guessing.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!requireAuthenticatedUser(req)) {
    return json({ error: "Sign in required" }, 401);
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { text } = body;
  if (!text || typeof text !== "string") {
    return json({ error: "Missing text" }, 400);
  }
  if (text.length > MAX_TEXT_LEN) {
    return json({ error: "Statement text too large" }, 413);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    // Not deployed with a key yet - fail clearly server-side; the client
    // treats any non-2xx here as "could not read this statement" and never
    // surfaces this string to the user.
    return json({ error: "Server not configured" }, 500);
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PROMPT + "\n\nSTATEMENT TEXT:\n" + text },
          ],
        }],
      }),
    });
  } catch (e) {
    return json({ error: "Upstream request failed", detail: String(e) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return json({ error: "Upstream error", status: upstream.status, detail: detail.slice(0, 300) }, 502);
  }

  const data = await upstream.json();
  const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
  if (!textBlock) {
    return json({ error: "No text in model response" }, 502);
  }

  let parsed: unknown;
  try {
    // The prompt asks for bare JSON, but strip code-fence wrapping defensively
    // in case the model adds it anyway.
    const cleaned = String(textBlock.text)
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return json({ error: "Could not parse model output" }, 502);
  }

  return json(parsed, 200);
});

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
