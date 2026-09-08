# read-receipt

Supabase Edge Function. Reads a till slip photo with Claude Haiku 4.5 and
returns structured fields (`merchant`, `date`, `total`, `items`, `category_hint`).
Called from `app.html`'s `readSlipViaHaiku()`, signed-in users only —
Tesseract stays the on-device fallback for everyone else and for any
failure of this path.

## Deploying a change

This file is the source of truth checked into git, but Supabase doesn't
deploy from a git push — edit this file, then redeploy it through the
Supabase MCP tool (`deploy_edge_function`, project `pkbpmnpevxjrqjnepsjd`,
name `read-receipt`, `verify_jwt: true`), or via the Supabase CLI:

```bash
supabase functions deploy read-receipt --project-ref pkbpmnpevxjrqjnepsjd
```

## The one secret it needs

`ANTHROPIC_API_KEY` — set as an Edge Function secret, never in this file
and never in the client. Get a key from console.anthropic.com, then either:

- Supabase dashboard → this project → Edge Functions → Secrets → add
  `ANTHROPIC_API_KEY`
- or via the CLI: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref pkbpmnpevxjrqjnepsjd`

Until that secret exists, every call returns `{"error":"Server not configured"}`
(HTTP 500) and the client silently falls back to Tesseract — this is
expected, not a bug, and is what every signed-in user gets today.

## Why verify_jwt alone isn't the security boundary

Confirmed live against this project: the public Supabase anon/publishable
key (the one that ships in `app.html`'s own source) is itself a validly
signed token for this project, with `role: "anon"`. Supabase's `verify_jwt`
gate accepts it same as a real user session — it only checks the token is
authentically signed for this project, not that it represents a specific
signed-in person. `requireAuthenticatedUser()` in `index.ts` is the actual
gate: it decodes the bearer token's own payload and requires
`role === "authenticated"`, which the anon key never carries. Without that
check, anyone reading the public app source could call this function for
free against a real, billed Anthropic key.
