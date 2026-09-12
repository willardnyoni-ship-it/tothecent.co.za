# khanyiso-chat

Supabase Edge Function. Powers the Khanyiso chat assistant
(`src/components/Khanyiso.jsx`) — a short-answer Q&A bot over the user's own
budget summary, built with Claude Haiku 4.5. Signed-in users only; there's no
fallback if this is unavailable (unlike `read-receipt`'s Tesseract fallback),
so the chat panel shows a "Could not reach Khanyiso" message if it fails.

This function was missing from the deployed project entirely until now —
`Khanyiso.jsx` called `/functions/v1/khanyiso-chat`, which returned 404, so
every message ever sent through the chat panel failed silently into that
"Could not reach Khanyiso" error. There is no database access in this
function; it only sees the `messages` and `context` the client sends in the
request body — `context` is a plain-text summary built client-side from the
signed-in user's own budget state (income, category targets/spend, upcoming
bills, recent transactions, monthly history).

## Deploying a change

This file is the source of truth checked into git, but Supabase doesn't
deploy from a git push — edit this file, then redeploy it through the
Supabase MCP tool (`deploy_edge_function`, project `pkbpmnpevxjrqjnepsjd`,
name `khanyiso-chat`, `verify_jwt: true`), or via the Supabase CLI:

```bash
supabase functions deploy khanyiso-chat --project-ref pkbpmnpevxjrqjnepsjd
```

## The one secret it needs

`ANTHROPIC_API_KEY` — the same Edge Function secret `read-receipt` already
uses (Edge Function secrets are project-level, not per-function, so no new
secret was needed to bring this function up). Until that secret exists,
every call returns `{"error":"Server not configured"}` (HTTP 500), which the
client surfaces as "Could not reach Khanyiso: Server not configured."

## Why verify_jwt alone isn't the security boundary

Same reasoning as `read-receipt`: the public Supabase anon/publishable key
(shipped in the app's own source) is itself a validly signed token for this
project, with `role: "anon"` — Supabase's `verify_jwt` gate alone would
accept it same as a real user session. `requireAuthenticatedUser()` in
`index.ts` is the actual gate, requiring `role === "authenticated"` in the
bearer token's own payload, which the anon key never carries.

## Defensive input handling

- Client-side chat history can contain `role: "system"` entries the UI
  itself inserted after a past connection error (see `Khanyiso.jsx`'s catch
  block) — these aren't real conversation turns, and Anthropic's `messages`
  array only accepts `user`/`assistant`. This function filters them out
  before forwarding to Anthropic, rather than passing them through and
  getting a confusing upstream 400 on the *next* message after any failure.
- `context` and each message are length-capped, and history is capped to
  the last 40 messages (matching the client's own local-storage cap), purely
  as abuse/cost guardrails — there's no legitimate case that needs more.
