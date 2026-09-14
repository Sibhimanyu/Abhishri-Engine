/**
 * Migration 002 — populate the new allocation model.
 * See docs/payments-data-model-review.md sections 2.2, 3 and 5.
 *
 * WHY
 *   "Which fee did this payment settle?" currently has two answers that disagree for
 *   13 of 49 students: the per-transaction `breakdown` written by the client, and the
 *   `componentPayments` map recomputed server-side by reconcileStudent. A
 *   reconciliation system cannot be built on a question with two answers.
 *
 *   This migration makes the transaction's own `breakdown` explicit and queryable as
 *   first-class allocation documents, and snapshots each student's current fee plan as
 *   an immutable version so component ids stop dangling when a plan is edited.
 *
 * WRITES ONLY TO NEW COLLECTIONS
 *   allocations/{id}                           (root, new)
 *   students/{id}/fee_plan_versions/{vid}      (new subcollection)
 *
 *   No existing document is read-modify-written. `breakdown`, `componentPayments`,
 *   `financialSummary` and every transaction field are left exactly as they are, so
 *   the running app is unaffected and rollback is "delete the new collections".
 *
 * DOES NOT SWITCH THE READER
 *   reconcileStudent keeps computing componentPayments the way it does today. Flipping
 *   the authoritative source is a separate, reviewable change — the 13 disagreeing
 *   students need a human decision first, and this migration prints exactly that list.
 *
 * USAGE
 *   node 002-allocations-and-plan-versions.mjs             # dry run + disagreement report
 *   node 002-allocations-and-plan-versions.mjs --apply
 *   node 002-allocations-and-plan-versions.mjs --rollback  # delete what it created
 */
import os from 'os';
import { readFileSync } from 'fs';

const PROJECT = 'abhishri-academy';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TOKEN = JSON.parse(
  readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')
).tokens.access_token;
const MARKER = 'migration-002';
const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function api(url, method = 'GET', body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${method} ${url.slice(0, 110)} :: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
const dec = (v) => {
  if (v == null || 'nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  return null;
};
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};

async function queryAll(collectionId, allDescendants = false) {
  const out = await api(`${BASE}:runQuery`, 'POST', {
    structuredQuery: { from: [{ collectionId, allDescendants }], limit: 5000 },
  });
  return out.filter((r) => r.document).map((r) => ({
    __name: r.document.name,
    __path: r.document.name.split('/documents/')[1],
    __id: r.document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(r.document.fields || {}).map(([k, v]) => [k, dec(v)])),
  }));
}

/**
 * A breakdown key is `${academicYear}-${componentUid}` with an optional `-${MonthName}`
 * suffix. Component uids use underscores, never hyphens, so splitting on the leading
 * year and the trailing month name is unambiguous. 'Unallocated' is the allocator's
 * bucket for money that matched no requirement and is preserved as such.
 */
function parseBreakdownKey(key) {
  if (key === 'Unallocated') return { componentUid: null, periodLabel: null, unallocated: true };
  let rest = key;
  let academicYear = null;
  const yearMatch = rest.match(/^(\d{4})-(.*)$/);
  if (yearMatch) { academicYear = Number(yearMatch[1]); rest = yearMatch[2]; }
  let periodLabel = null;
  for (const m of MONTHS) {
    if (rest.endsWith(`-${m}`)) { periodLabel = m; rest = rest.slice(0, -(m.length + 1)); break; }
  }
  return { componentUid: rest, periodLabel, academicYear, unallocated: false };
}

const sanitizeId = (s) => s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);

// ---------------------------------------------------------------- gather
const [students, transactions, planDocs] = await Promise.all([
  queryAll('students'),
  queryAll('transactions', true),
  queryAll('fee_ledger', true),
]);
const plans = planDocs.filter((p) => p.__path.endsWith('plan_details'));
const planByStudent = new Map(plans.map((p) => [p.__path.split('/')[1], p]));

console.log(`mode         : ${ROLLBACK ? 'ROLLBACK' : APPLY ? 'APPLY' : 'DRY RUN'}`);
console.log(`students     : ${students.length}`);
console.log(`transactions : ${transactions.length}`);
console.log(`fee plans    : ${plans.length}`);

// ---------------------------------------------------------------- rollback
if (ROLLBACK) {
  const existing = await queryAll('allocations');
  const versions = (await queryAll('fee_plan_versions', true)).filter((v) => v.createdBy === MARKER);
  const deletes = [...existing.filter((a) => a.source === MARKER), ...versions].map((d) => ({ delete: d.__name }));
  console.log(`\nto delete    : ${deletes.length} (allocations + plan versions created by ${MARKER})`);
  if (!APPLY) { console.log('\nDRY RUN — add --apply to actually delete.'); process.exit(0); }
  for (let i = 0; i < deletes.length; i += 400) {
    await api(`${BASE}:commit`, 'POST', { writes: deletes.slice(i, i + 400) });
  }
  console.log('rollback complete.');
  process.exit(0);
}

// ---------------------------------------------------------------- build plan versions
const planVersionWrites = [];
const versionIdByStudent = new Map();
for (const [studentId, plan] of planByStudent) {
  // Deterministic id keyed on plan content, so re-running produces the same version
  // rather than piling up duplicates.
  const versionId = `v1-${sanitizeId(String(plan.planId || 'local'))}`;
  versionIdByStudent.set(studentId, versionId);
  planVersionWrites.push({
    update: {
      name: `projects/${PROJECT}/databases/(default)/documents/students/${studentId}/fee_plan_versions/${versionId}`,
      fields: Object.fromEntries(Object.entries({
        components: plan.components || [],
        annualNetFee: plan.annualNetFee ?? null,
        annualBaseFee: plan.annualBaseFee ?? null,
        startMonth: plan.startMonth ?? null,
        billingCycle: plan.billingCycle ?? null,
        academicStartYear: plan.academicStartYear ?? null,
        sourcePlanId: plan.planId ?? null,
        effectiveFrom: null,           // unknown for the first snapshot; future edits set this
        supersededBy: null,
        createdBy: MARKER,
        capturedAt: new Date(),
      }).map(([k, v]) => [k, enc(v)])),
    },
  });
}

// ---------------------------------------------------------------- build allocations
const allocationWrites = [];
const perPayment = [];
let orphanLines = 0, orphanAmount = 0, unallocatedLines = 0;

for (const tx of transactions) {
  if (tx.type === 'void') continue;                  // reversals carry a mirrored breakdown; skipped
  const studentId = tx.__path.split('/')[1];
  const plan = planByStudent.get(studentId);
  const liveUids = new Set((plan?.components || []).map((c) => c.uid));
  const versionId = versionIdByStudent.get(studentId) || null;
  const entries = Object.entries(tx.breakdown || {});
  let sum = 0;

  for (const [key, rawAmount] of entries) {
    const amount = Number(rawAmount) || 0;
    sum += amount;
    const parsed = parseBreakdownKey(key);
    const resolved = parsed.componentUid ? liveUids.has(parsed.componentUid) : false;
    if (parsed.unallocated) unallocatedLines++;
    else if (!resolved) { orphanLines++; orphanAmount += amount; }

    allocationWrites.push({
      update: {
        name: `projects/${PROJECT}/databases/(default)/documents/allocations/${sanitizeId(`${tx.__id}__${key}`)}`,
        fields: Object.fromEntries(Object.entries({
          paymentId: tx.__id,
          paymentPath: tx.__path,
          studentId,
          studentName: tx.studentName ?? null,
          kind: tx.type === 'discount' ? 'concession' : 'payment',
          componentUid: parsed.componentUid,
          componentName: (tx.breakdownNames || {})[key] ?? null,
          periodLabel: parsed.periodLabel,
          academicYear: parsed.academicYear,
          breakdownKey: key,
          amount,
          amountMinor: Math.round(amount * 100),
          // planVersionId is null when the component no longer exists in the current
          // plan: the historical version it belonged to was overwritten and cannot be
          // reconstructed. Flagged rather than guessed.
          planVersionId: resolved ? versionId : null,
          componentResolved: resolved || parsed.unallocated,
          unallocated: parsed.unallocated,
          periodKey: tx.periodKey ?? null,
          receivedAt: tx.receivedAt ?? tx.timestamp ?? null,
          voided: tx.isVoided === true,
          source: MARKER,
          createdAt: new Date(),
        }).map(([k, v]) => [k, enc(v)])),
      },
    });
  }
  if (entries.length) perPayment.push({ id: tx.__id, path: tx.__path, amount: Number(tx.amount) || 0, allocated: sum, type: tx.type });
}

// ---------------------------------------------------------------- report
console.log(`\nplan versions to write : ${planVersionWrites.length}`);
console.log(`allocations to write   : ${allocationWrites.length}`);
console.log(`  unallocated lines    : ${unallocatedLines}`);
console.log(`  orphaned component   : ${orphanLines}  (Rs ${orphanAmount}) -> planVersionId null, componentResolved false`);

const mismatched = perPayment.filter((p) => p.type === 'incoming' && Math.abs(p.amount - p.allocated) > 0.5);
console.log(`\npayments whose breakdown does not sum to the payment amount: ${mismatched.length}`);
mismatched.slice(0, 8).forEach((p) => console.log(`   ${p.path}  amount=${p.amount} allocated=${p.allocated}`));

// The decision this migration deliberately does not make.
console.log('\n--- students where breakdown disagrees with plan.componentPayments ---');
let disagree = 0;
for (const [studentId, plan] of planByStudent) {
  const fromTx = {};
  transactions
    .filter((t) => t.__path.startsWith(`students/${studentId}/`) && t.type === 'incoming' && !t.isVoided)
    .forEach((t) => Object.entries(t.breakdown || {}).forEach(([k, v]) => { fromTx[k] = (fromTx[k] || 0) + Number(v || 0); }));
  const cp = plan.componentPayments || {};
  const keys = new Set([...Object.keys(fromTx), ...Object.keys(cp)]);
  const diffs = [...keys].filter((k) => Math.abs((fromTx[k] || 0) - (cp[k] || 0)) > 0.5);
  if (!diffs.length) continue;
  disagree++;
  if (disagree <= 5) {
    const name = transactions.find((t) => t.__path.startsWith(`students/${studentId}/`))?.studentName || studentId;
    console.log(`  ${name}`);
    diffs.slice(0, 4).forEach((k) => console.log(`     ${k}: transactions=${fromTx[k] || 0}  plan=${cp[k] || 0}`));
  }
}
console.log(`  total disagreeing students: ${disagree} of ${planByStudent.size}`);
console.log('  (allocations above reflect the TRANSACTION view; the reader is NOT switched by this migration)');

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0); }

// ---------------------------------------------------------------- write
const writes = [...planVersionWrites, ...allocationWrites];
for (let i = 0; i < writes.length; i += 400) {
  const chunk = writes.slice(i, i + 400);
  await api(`${BASE}:commit`, 'POST', { writes: chunk });
  console.log(`committed ${Math.min(i + chunk.length, writes.length)}/${writes.length}`);
}

// ---------------------------------------------------------------- verify
const [allocAfter, txAfter] = await Promise.all([queryAll('allocations'), queryAll('transactions', true)]);
const problems = [];
if (txAfter.length !== transactions.length) problems.push(`transaction count moved ${transactions.length} -> ${txAfter.length}`);

const txById = new Map(txAfter.map((t) => [t.__id, t]));
const byPayment = {};
allocAfter.forEach((a) => { byPayment[a.paymentId] = (byPayment[a.paymentId] || 0) + (Number(a.amount) || 0); });
for (const [paymentId, allocated] of Object.entries(byPayment)) {
  const tx = txById.get(paymentId);
  if (!tx) { problems.push(`allocation references unknown payment ${paymentId}`); continue; }
  if (tx.type === 'incoming' && Math.abs((Number(tx.amount) || 0) - allocated) > 0.5) {
    problems.push(`payment ${paymentId}: amount ${tx.amount} vs allocations ${allocated}`);
  }
}
// Existing data must be untouched.
const changedTx = txAfter.filter((t) => {
  const before = transactions.find((x) => x.__id === t.__id);
  return before && JSON.stringify(before.breakdown || {}) !== JSON.stringify(t.breakdown || {});
});
if (changedTx.length) problems.push(`${changedTx.length} transaction breakdown(s) changed — must be zero`);

console.log('\n--- verification ---');
console.log(`allocations written : ${allocAfter.length}`);
console.log(`transactions        : ${transactions.length} -> ${txAfter.length} (unchanged)`);
console.log(`breakdowns modified : ${changedTx.length} (must be 0)`);
if (problems.length) {
  console.log('\nFAILED:');
  problems.slice(0, 20).forEach((p) => console.log('  ! ' + p));
  console.log('\nRun with --rollback --apply to remove what this migration created.');
  process.exit(1);
}
console.log('\nAll invariants hold. New model populated; existing data untouched.');
