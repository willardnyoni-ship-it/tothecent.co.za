// Thin PostgREST client for the business tables. All business data is
// server-backed (Supabase), unlike the personal side's localStorage -
// team members, customers and invoices need to be visible to every
// member of the business, not just one browser.
async function pg(syncCfg, token, path, opts = {}) {
  const url = syncCfg.url.replace(/\/+$/, '') + '/rest/v1' + path;
  const r = await fetch(url, {
    ...opts,
    headers: {
      apikey: syncCfg.key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.message || body.error_description || `Request failed (${r.status})`);
  }
  if (r.status === 204) return null;
  return r.json();
}

// Receipts/logos live in the 'business-files' bucket under
// {business_id}/{filename} - RLS on storage.objects checks membership of
// that business_id folder (see the business_files_bucket migration).
export async function uploadBusinessFile(syncCfg, token, businessId, filename, blob) {
  const url = syncCfg.url.replace(/\/+$/, '') + '/storage/v1/object/business-files/' + businessId + '/' + filename;
  const r = await fetch(url, {
    method: 'POST',
    headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token, 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: blob,
  });
  if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
  return businessId + '/' + filename;
}
export async function businessFileUrl(syncCfg, token, path) {
  const url = syncCfg.url.replace(/\/+$/, '') + '/storage/v1/object/business-files/' + path;
  const r = await fetch(url, { headers: { apikey: syncCfg.key, Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  return URL.createObjectURL(await r.blob());
}

export const businessApi = {
  select: (syncCfg, token, table, query = '') => pg(syncCfg, token, `/${table}?${query}`),
  insert: (syncCfg, token, table, rows) => pg(syncCfg, token, `/${table}`, { method: 'POST', body: JSON.stringify(rows) }),
  update: (syncCfg, token, table, query, patch) => pg(syncCfg, token, `/${table}?${query}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (syncCfg, token, table, query) => pg(syncCfg, token, `/${table}?${query}`, { method: 'DELETE', prefer: 'return=minimal' }),
};
