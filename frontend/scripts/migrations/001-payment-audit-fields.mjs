/**
 * Migration 001 — backfill Phase 1 payment audit fields.
 * See docs/payments-data-model-review.md (sections 4 and 5).
 *
 * ADDS, to every existing transaction that lacks them:
 *   receivedAt     <- the existing `timestamp` (same instant, accounting name)
 *   recordedAt     <- the document's own Firestore createTime metadata
 *   periodKey      <- 'YYYY-MM' of receivedAt in Asia/Kolkata
 *   schemaVersion  <- 2
 *   backfillSource <- 'migration-001'   (idempotency marker + provenance)
 *
 * MODIFIES NOTHING ELSE. Writes go through a Firestore updateMask naming exactly
 * these five paths, so no pre-existing field can be touched even by accident.
 *
 * Deliberately does NOT invent `externalRef`. A legacy electronic payment has no
 * recoverable bank reference, and writing '' would make "never captured" look
 * identical to "genuinely has none" (cash). Absent externalRef on a schemaVersion-2
 * document marked backfillSource:'migration-001' is the signal for "legacy,
 * unmatchable" — which the reconciliation UI needs to report honestly.
 *
 * USAGE
 *   node 001-payment-audit-fields.mjs            # dry run: snapshot + full diff, no writes
 *   node 001-payment-audit-fields.mjs --apply    # snapshot, write, then verify
 *
 * ROLLBACK
 *   The five added fields are additive and unread by any pre-existing code, so the
 *   practical rollback is to leave them. To remove them, run the same script with
 *   --rollback, which clears exactly the fields this migration set (again via
 *   updateMask) for documents carrying backfillSource === 'migration-001'.
 */
import os from 'os';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const PROJECT = 'abhishri-academy';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FIELDS = ['receivedAt', 'recordedAt', 'periodKey', 'schemaVersion', 'backfillSource'];
const MARKER = 'migration-001';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');

const token = () =>
  JSON.parse(readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens.access_token;
const TOKEN = token();

async function api(url, method = 'GET', body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${method} ${url.slice(0, 110)} :: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const decode = (v) => {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  return '<unknown>';
};

/** 'YYYY-MM' in Asia/Kolkata. A UTC-derived key files a 00:30 IST payment in the wrong month. */
function periodKeyIST(iso) {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
    .format(new Date(iso));
  return parts.slice(0, 7);
}

async function fetchAllTransactions() {
  const out = await api(`${BASE}:runQuery`, 'POST', {
    structuredQuery: { from: [{ collectionId: 'transactions', allDescendants: true }], limit: 5000 },
  });
  return out
    .filter((r) => r.document)
    .map((r) => ({
      name: r.document.name,
      path: r.document.name.split('/documents/')[1],
      createTime: r.document.createTime,
      fields: Object.fromEntries(Object.entries(r.document.fields || {}).map(([k, v]) => [k, decode(v)])),
      rawFieldNames: Object.keys(r.document.fields || {}),
    }));
}

function snapshot(docs) {
  mkdirSync('.migration-snapshots', { recursive: true });
  const file = `.migration-snapshots/${MARKER}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(docs, null, 1));
  return file;
}

/** Totals that must not move. These are the migration's canary. */
function invariants(docs) {
  const f = (d) => d.fields;
  const incoming = docs.filter((d) => f(d).type === 'incoming' && !f(d).isVoided);
  return {
    docCount: docs.length,
    netMoney: docs
      .filter((d) => f(d).type === 'incoming' || f(d).type === 'void')
      .reduce((a, d) => a + (Number(f(d).amount) || 0), 0),
    liveIncoming: incoming.reduce((a, d) => a + (Number(f(d).amount) || 0), 0),
    fieldNameCount: docs.reduce((a, d) => a + d.rawFieldNames.length, 0),
  };
}

const before = await fetchAllTransactions();
const snapFile = snapshot(before);
const inv0 = invariants(before);

console.log(`mode          : ${ROLLBACK ? 'ROLLBACK' : APPLY ? 'APPLY' : 'DRY RUN'}`);
console.log(`snapshot      : ${snapFile}`);
console.log(`transactions  : ${inv0.docCount}`);
console.log(`net money     : ${inv0.netMoney}   (incoming + voids)`);
console.log(`live incoming : ${inv0.liveIncoming}`);
console.log('');

const writes = [];
let skipped = 0;

for (const d of before) {
  if (ROLLBACK) {
    if (d.fields.backfillSource !== MARKER) { skipped++; continue; }
    // Clearing = update with the mask but no values for those paths.
    writes.push({ update: { name: d.name, fields: {} }, updateMask: { fieldPaths: FIELDS } });
    continue;
  }
  if (d.fields.receivedAt || d.fields.backfillSource === MARKER) { skipped++; continue; }

  const ts = d.fields.timestamp;
  if (!ts) { skipped++; continue; }
  const period = periodKeyIST(ts);

  writes.push({
    update: {
      name: d.name,
      fields: {
        receivedAt: { timestampValue: ts },
        recordedAt: { timestampValue: d.createTime },
        periodKey: { stringValue: period },
        schemaVersion: { integerValue: '2' },
        backfillSource: { stringValue: MARKER },
      },
    },
    // The whole safety story in one line: only these paths can be written.
    updateMask: { fieldPaths: FIELDS },
  });
}

console.log(`to change     : ${writes.length}`);
console.log(`already done  : ${skipped}`);
if (writes.length && !ROLLBACK) {
  const sample = before.find((d) => d.name === writes[0].update.name);
  console.log('\nexample diff:');
  console.log(`  ${sample.path}`);
  console.log(`    + receivedAt    = ${sample.fields.timestamp}`);
  console.log(`    + recordedAt    = ${sample.createTime}`);
  console.log(`    + periodKey     = ${periodKeyIST(sample.fields.timestamp)}`);
  console.log(`    + schemaVersion = 2`);
  console.log(`    (untouched: ${sample.rawFieldNames.join(', ')})`);
  const periods = {};
  writes.forEach((w) => {
    const p = w.update.fields.periodKey.stringValue;
    periods[p] = (periods[p] || 0) + 1;
  });
  console.log('\nperiodKey distribution:', JSON.stringify(periods));
}

if (!APPLY && !ROLLBACK) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  process.exit(0);
}
if (!writes.length) {
  console.log('\nNothing to do.');
  process.exit(0);
}

for (let i = 0; i < writes.length; i += 400) {
  const chunk = writes.slice(i, i + 400);
  await api(`${BASE}:commit`, 'POST', { writes: chunk });
  console.log(`committed ${Math.min(i + chunk.length, writes.length)}/${writes.length}`);
}

// ---- verification ------------------------------------------------------------
const after = await fetchAllTransactions();
const inv1 = invariants(after);
const problems = [];

if (inv1.docCount !== inv0.docCount) problems.push(`document count moved ${inv0.docCount} -> ${inv1.docCount}`);
if (inv1.netMoney !== inv0.netMoney) problems.push(`net money moved ${inv0.netMoney} -> ${inv1.netMoney}`);
if (inv1.liveIncoming !== inv0.liveIncoming) problems.push(`live incoming moved ${inv0.liveIncoming} -> ${inv1.liveIncoming}`);

// No document may have LOST a field it previously had.
const beforeByName = new Map(before.map((d) => [d.name, d]));
for (const d of after) {
  const b = beforeByName.get(d.name);
  if (!b) { problems.push(`new document appeared: ${d.path}`); continue; }
  const lost = b.rawFieldNames.filter((f) => !d.rawFieldNames.includes(f) && !(ROLLBACK && FIELDS.includes(f)));
  if (lost.length) problems.push(`${d.path} lost field(s): ${lost.join(', ')}`);
}

console.log('\n--- verification ---');
console.log(`documents     : ${inv0.docCount} -> ${inv1.docCount}`);
console.log(`net money     : ${inv0.netMoney} -> ${inv1.netMoney}`);
console.log(`live incoming : ${inv0.liveIncoming} -> ${inv1.liveIncoming}`);
if (problems.length) {
  console.log('\nFAILED:');
  problems.forEach((p) => console.log('  ! ' + p));
  console.log(`\nRestore from ${snapFile} or the Firestore backup before retrying.`);
  process.exit(1);
}
console.log('\nAll invariants hold. Migration complete.');
