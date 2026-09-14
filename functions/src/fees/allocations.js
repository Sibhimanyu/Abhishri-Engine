const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * A breakdown key is `${academicYear}-${componentUid}` with an optional `-${MonthName}`
 * suffix. Component uids use underscores and never hyphens, so peeling off the leading
 * year and a trailing month name is unambiguous. 'Unallocated' is the allocator's bucket
 * for money that matched no requirement and is preserved as such rather than dropped.
 *
 * Kept byte-identical in intent to migrations/002 so the documents this trigger writes
 * are indistinguishable from the ones the backfill produced.
 */
function parseBreakdownKey(key) {
  if (key === "Unallocated") return { componentUid: null, periodLabel: null, academicYear: null, unallocated: true };
  let rest = key;
  let academicYear = null;
  const yearMatch = rest.match(/^(\d{4})-(.*)$/);
  if (yearMatch) {
    academicYear = Number(yearMatch[1]);
    rest = yearMatch[2];
  }
  let periodLabel = null;
  for (const m of MONTHS) {
    if (rest.endsWith(`-${m}`)) {
      periodLabel = m;
      rest = rest.slice(0, -(m.length + 1));
      break;
    }
  }
  return { componentUid: rest, periodLabel, academicYear, unallocated: false };
}

const sanitizeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200);

/**
 * Keep the `allocations` collection in step with each payment's own `breakdown`.
 *
 * Migration 002 populated allocations from the existing ledger, but nothing kept them
 * current: without this trigger the new model would have frozen at the moment of the
 * backfill while payments carried on being recorded, which is worse than not having it
 * at all — a reconciliation built on a silently stale table is a reconciliation you
 * cannot trust.
 *
 * The write is a full replace for the payment being touched (delete the old lines, write
 * the current ones) rather than a diff, for the same reason resyncWalletBalance is a
 * recompute: it is idempotent, so an at-least-once redelivery converges on the same
 * result instead of double-counting.
 *
 * Reversal rows (type 'void') are deliberately skipped. A correction already flags the
 * original isVoided, which this trigger mirrors onto its allocation lines, so the money
 * is cancelled exactly once. Writing allocations for the reversal too would cancel it
 * twice.
 */
exports.syncAllocations = onDocumentWritten(
  "students/{studentId}/transactions/{transactionId}",
  async (event) => {
    const db = admin.firestore();
    const { studentId, transactionId } = event.params;
    const after = event.data.after && event.data.after.exists ? event.data.after.data() : null;

    const allocations = db.collection("allocations");
    const existing = await allocations.where("paymentId", "==", transactionId).get();

    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));

    // Deleted payment, or a reversal row: the lines are removed and nothing replaces them.
    if (after && after.type !== "void") {
      const planSnap = await db.doc(`students/${studentId}/fee_ledger/plan_details`).get();
      const plan = planSnap.exists ? planSnap.data() : null;
      const liveUids = new Set((plan?.components || []).map((c) => c.uid));
      const planVersionId = plan ? `v1-${sanitizeId(String(plan.planId || "local"))}` : null;

      for (const [key, rawAmount] of Object.entries(after.breakdown || {})) {
        const amount = Number(rawAmount) || 0;
        const parsed = parseBreakdownKey(key);
        const resolved = parsed.componentUid ? liveUids.has(parsed.componentUid) : false;

        batch.set(allocations.doc(sanitizeId(`${transactionId}__${key}`)), {
          paymentId: transactionId,
          paymentPath: `students/${studentId}/transactions/${transactionId}`,
          studentId,
          studentName: after.studentName ?? null,
          kind: after.type === "discount" ? "concession" : "payment",
          componentUid: parsed.componentUid,
          componentName: (after.breakdownNames || {})[key] ?? null,
          periodLabel: parsed.periodLabel,
          academicYear: parsed.academicYear,
          breakdownKey: key,
          amount,
          amountMinor: Math.round(amount * 100),
          // Null when the component is gone from the current plan: the historical version
          // it belonged to was overwritten and cannot be reconstructed. Flag, never guess.
          planVersionId: resolved ? planVersionId : null,
          componentResolved: resolved || parsed.unallocated,
          unallocated: parsed.unallocated,
          periodKey: after.periodKey ?? null,
          receivedAt: after.receivedAt ?? after.timestamp ?? null,
          voided: after.isVoided === true,
          source: "syncAllocations",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    logger.info("syncAllocations", {
      transactionId,
      removed: existing.size,
      written: after && after.type !== "void" ? Object.keys(after.breakdown || {}).length : 0,
    });
  }
);
