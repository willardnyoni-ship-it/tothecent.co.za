// Reads a till slip photo with Claude Haiku 4.5 and returns structured fields.
//
// verify_jwt (set at deploy time) only confirms the caller presents SOME
// token validly signed for this Supabase project - the public anon/
// publishable key, which ships in app.html and anyone can read, is itself
// exactly such a token (role "anon"). Confirmed live against this project:
// supplying that key as the Authorization bearer reached this function
// same as a real session would. verify_jwt alone is therefore NOT the
// signed-in-only gate - requireAuthenticatedUser() below is, checking the
// token's own "role" claim is "authenticated" rather than "anon", which is
// what actually stops anyone reading the public source from hitting a real,
// billed Anthropic key for free. There is no ANTHROPIC_API_KEY in this
// file - it is read from an Edge Function secret at request time and never
// appears in the deployed source.
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
const MAX_B64_LEN = 8_000_000; // ~6MB decoded - generously above what the client ever sends

const PROMPT = `You are reading a photograph of a South African till slip or receipt for a budgeting app.

Reply with ONLY a single JSON object, no markdown fencing, no commentary before or after it. Shape exactly:
{
  "merchant": string,        // the shop or trading name as printed, empty string "" if you cannot tell
  "date": string or null,    // the slip's own date as YYYY-MM-DD; null if no date is legible
  "total": number or null,   // the actual amount paid - prefer a line marked TOTAL over SUBTOTAL,
                              // VAT, or a card-slip "AMOUNT DUE" duplicate; null if you cannot find one
  "items": [ { "d": string, "a": number } ],  // line items with their price; [] if none are legible
  "category_hint": string    // one or two words guessing the kind of shop, e.g. "Groceries", "Fuel",
                              // "Pharmacy", "Takeaway" - your best guess, empty string if unsure
}

Prices are in South African Rand and already include VAT at 15% - do not add or remove VAT yourself,
just report the printed amounts. If the photo is blurry, not a receipt at all, or you genuinely cannot
read a total, set "total" to null and "items" to [] rather than guessing a number.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // The browser sends a preflight OPTIONS request for any cross-origin POST
  // carrying custom headers (Authorization, apikey) - without this, every
  // browser call fails client-side as an opaque "Failed to fetch" before
  // the actual POST is ever sent. Confirmed live: this was broken before
  // this handler existed, from both localhost and the deployed domain.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!requireAuthenticatedUser(req)) {
    return json({ error: "Sign in required" }, 401);
  }

  let body: { image?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { image, mimeType } = body;
  if (!image || typeof image !== "string") {
    return json({ error: "Missing image" }, 400);
  }
  if (image.length > MAX_B64_LEN) {
    return json({ error: "Image too large" }, 413);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    // Not deployed with a key yet - fail clearly server-side; the client
    // treats any non-2xx here as "fall back to on-device reading" and
    // never surfaces this string to the user.
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
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType || "image/jpeg", data: image },
            },
            { type: "text", text: PROMPT },
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
