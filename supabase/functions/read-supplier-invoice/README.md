# read-supplier-invoice

Reads a supplier invoice (photo or PDF) with Claude Haiku 4.5 and returns its
line items (`supplier`, `invoice_number`, `date`, `prices_include_vat`, `total`,
`lines[]`), so Stock can be captured from an invoice. Signed-in users only.
Called from `src/lib/stockScan.js`; if it fails, the app falls back to typing
the lines in.

Deploy: Supabase MCP `deploy_edge_function` (project `pkbpmnpevxjrqjnepsjd`,
name `read-supplier-invoice`, `verify_jwt: true`), or
`supabase functions deploy read-supplier-invoice --project-ref pkbpmnpevxjrqjnepsjd`.

Needs the `ANTHROPIC_API_KEY` Edge Function secret (shared with read-receipt).
Without it every call returns `{"error":"Server not configured"}` (500).
