// Khanyiso: a budget Q&A chat assistant, scoped to only the data the client
// itself sends in `context` (see src/components/Khanyiso.jsx:buildContext) -
// this function has no database access of its own and never queries
// anything beyond what's in the request body.
//
// Same auth pattern as read-receipt: verify_jwt (set at deploy time) only
// confirms the caller presents SOME validly-signed token for this project -
// the public anon/publishable key qualifies too. requireAuthenticatedUser()
// is the actual signed-in-only gate, checking the token's own "role" claim
// is "authenticated" rather than "anon". ANTHROPIC_API_KEY is read from an
// Edge Function secret at request time and never appears in source.
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
const MAX_CONTEXT_LEN = 20_000;
const MAX_MESSAGE_LEN = 4_000;
const MAX_MESSAGES = 40; // matches the client's own history cap (KH_KEY slice(-40))

const SYSTEM_PROMPT = `You are Khanyiso, a friendly budgeting assistant inside a South African personal budgeting app called Budget.

You can see ONLY the summary of the user's own budget data provided below inside <context> tags - you have no
access to anything else: no other conversations, no real bank accounts, no data beyond that summary. Answer
questions about their spending, budget, categories and trends using only that context.

Rules:
- Do not give financial, investment, tax or legal advice. If asked, politely decline and suggest a qualified
  professional (e.g. an accountant or financial advisor) instead.
- If the context doesn't contain enough information to answer, say so honestly rather than guessing or
  inventing numbers.
- Keep answers short and in plain language - a sentence or two unless the question genuinely needs more.
- Amounts in the context are already formatted in Rand (R); keep that format in your replies.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChatMessage = { role: string; content: string };

Deno.serve(async (req: Request) => {
  // Preflight - without this every browser call fails client-side as an
  // opaque "Failed to fetch" before the real POST ever goes out (same issue
  // read-receipt hit before it had this handler).
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!requireAuthenticatedUser(req)) {
    return json({ error: "Sign in required" }, 401);
  }

  let body: { messages?: ChatMessage[]; context?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const context = typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT_LEN) : "";

  // The client's own chat history can contain role:'system' entries it
  // inserted for a past connection error (see Khanyiso.jsx's catch block) -
  // those are UI-only annotations, not real conversation turns, and
  // Anthropic's messages array only accepts user/assistant. Drop anything
  // else and cap length/size defensively.
  const messages = rawMessages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LEN) }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "No question to answer" }, 400);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
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
        max_tokens: 512,
        system: SYSTEM_PROMPT + "\n\n<context>\n" + context + "\n</context>",
        messages,
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

  return json({ reply: String(textBlock.text).trim() }, 200);
});

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
