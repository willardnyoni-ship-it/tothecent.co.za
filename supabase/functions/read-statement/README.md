# read-statement

Supabase Edge Function. Reads the extracted text of a bank statement PDF
with Claude Haiku 4.5 and returns which bank it's from plus a structured
transaction list (`date`, `desc`, `amount`, `is_credit`). Called from
`src/lib/parsePdf.js`'s `parseViaAi()` only when the fast local FNB-layout
parser finds zero rows - i.e. any other bank, or an FNB layout change -
and only for signed-in users, same gate as `read-receipt`.

## Deploying a change

This file is the source of truth checked into git, but Supabase doesn't
deploy from a git push — edit this file, then redeploy it through the
Supabase MCP tool (`deploy_edge_function`, project `pkbpmnpevxjrqjnepsjd`,
name `read-statement`, `verify_jwt: true`), or via the Supabase CLI:

```bash
supabase functions deploy read-statement --project-ref pkbpmnpevxjrqjnepsjd
```

## The one secret it needs

`ANTHROPIC_API_KEY` — already set as an Edge Function secret for
`read-receipt`; Supabase secrets are project-wide, so this function reuses
the same one. Never in this file and never in the client.

Until that secret exists, every call returns `{"error":"Server not configured"}`
(HTTP 500) and the client shows "could not read this statement automatically"
rather than exposing that string.

## Why verify_jwt alone isn't the security boundary

See `read-receipt/README.md` — the same reasoning applies here.
`requireAuthenticatedUser()` in `index.ts` is the actual gate.
