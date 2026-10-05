// Run with:  node src/lib/audit.test.mjs
import assert from 'node:assert/strict';
import { describe, formatValue, auditCsv } from './audit.js';

const nb = s => String(s).replace(/ | /g, ' ');
// an edit shows what changed, old -> new, in plain words
const d = describe({ action: 'update', table_name: 'business_transactions', label: 'ATM Cash', changes: { category: ['Cash withdrawals', 'Fuel'], vat_amount: [null, 45], updated_at: ['x', 'y'], status: ['needs_review', 'reviewed'] } });
assert.equal(d.title, 'Changed bank transaction ATM Cash');
assert.deepEqual(d.lines.map(l => l.label), ['Category', 'VAT', 'Status']);
assert.equal(d.lines[0].from, 'Cash withdrawals'); assert.equal(d.lines[0].to, 'Fuel');
assert.equal(d.lines[1].from, 'empty'); assert.equal(nb(d.lines[1].to), 'R45,00');

// links and plumbing columns are summarised, not dumped
const l = describe({ action: 'update', table_name: 'business_transactions', label: 'x', changes: { linked_invoice_id: [null, 'abc-123'], items: [[], [{}]] } });
assert.deepEqual(l.lines, [{ label: 'Linked invoice', text: 'added' }, { label: 'Items', text: 'changed' }]);

// adding and deleting list the main facts
const a = describe({ action: 'insert', table_name: 'expenses', label: 'Engen fuel', changes: { amount: 640, category: 'Fuel', date: '2026-10-01', receipt_storage_path: null, id: 'x', vat: 0, items: null } });
assert.equal(a.title, 'Added expense Engen fuel');
assert.ok(a.lines.some(x => x.label === 'Amount' && nb(x.text) === 'R640,00') && a.lines.some(x => x.label === 'Category' && x.text === 'Fuel'));
assert.ok(!a.lines.some(x => x.label === 'Receipt'), 'empty values and ids are left out');
assert.equal(describe({ action: 'delete', table_name: 'customers', label: 'Old Co', changes: { name: 'Old Co', email: null } }).title, 'Deleted customer Old Co');
assert.equal(describe({ action: 'update', table_name: 'weird_table', label: null, changes: {} }).title, 'Changed weird_table');

// values
assert.equal(formatValue('x', null), 'empty'); assert.equal(formatValue('x', ''), 'empty'); assert.equal(formatValue('x', true), 'yes'); assert.equal(formatValue('features', ['stock', 'cashup']), 'stock, cashup');
assert.equal(nb(formatValue('total', 1200, 'invoices')), '1 200,00', 'invoice money has no currency symbol (it may not be rand)');
assert.equal(formatValue('x', 'a'.repeat(100)).length, 70);

// csv: header, one row per entry, spreadsheet formulas neutralised
const csv = auditCsv([{ changed_at: '2026-10-05T08:00:00Z', actor_email: 'a@b.co', action: 'update', table_name: 'invoices', label: '=cmd', changes: { status: ['draft', 'sent'] } }]);
const rows = csv.replace('﻿', '').split('\r\n');
assert.equal(rows.length, 2); assert.equal(rows[0], '"When","Who","Action","What","Record","Details"');
assert.ok(rows[1].includes("\"'=cmd\"") && rows[1].includes('Status: draft -> sent'));
console.log('audit: all checks passed');
