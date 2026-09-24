const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

/**
 * Accounting period close.
 *
 * Reconciling a month only means something if the month then stops moving. Until now
 * nothing marked a period as done and backdating was unrestricted, so a period that had
 * been signed off could be altered afterwards with no trace — which is precisely the
 * property that makes a reconciliation worth doing.
 *
 * Closing snapshots the period's totals and flips status to 'closed'. firestore.rules
 * then refuses any payment write carrying that periodKey, so a later correction has to
 * be posted into the open period as an adjustment rather than silently rewriting history.
 *
 * Totals are computed here rather than trusted from the client, and frozen on the period
 * document: the whole point is to record what the books said at the moment of sign-off,
 * so that a subsequent recomputation can be compared against it.
 */

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mirrors the permission the rest of the fee module uses for privileged accounting actions. */
async function assertCanClose(auth) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const db = admin.firestore();
  const byUid = await db.collection("allowed_users").doc(auth.uid).get();
  const doc = byUid.exists
    ? byUid
    : await db.collection("allowed_users").doc(String(auth.token?.email || "").toLowerCase()).get();
  const data = doc.exists ? doc.data() : null;
  const isAdmin = data?.isAdmin === true || data?.role === "admin";
  const canConfig = data?.permissions?.fees_accounting?.config === true;
  if (!isAdmin && !canConfig) {
    throw new HttpsError("permission-denied", "Closing a period needs admin or fees configuration rights.");
  }
  return { isAdmin, email: auth.token?.email || null };
}

/**
 * Recompute a period's totals from the ledger.
 *
 * Counts are split the way the reports already define them: gross is every incoming row,
 * reversals are the negative void rows, and net is what actually stayed. `matchable`
 * records how many payments carry an external reference, because that number is the
 * ceiling on what a bank reconciliation can ever match automatically.
 */
async function computeTotals(db, periodKey) {
  // The one shared money-classification rule (functions/src/shared/feeTx.mjs). Using a
  // naive `type === 'void'` test here would have been wrong in exactly the way the
  // reports were once wrong: voiding a CONCESSION copies the original's category onto a
  // type:'void' row, so a plain type check counts a non-cash reversal against cash. On
  // the live ledger that understated net collections by Rs 6,000.
  const { classifyIncomeTx } = await import("../shared/feeTx.mjs");
  const snap = await db.collectionGroup("transactions").where("periodKey", "==", periodKey).get();

  let grossMinor = 0, reversalsMinor = 0, concessionsMinor = 0;
  let paymentCount = 0, reversalCount = 0, withReference = 0, withoutReference = 0;
  const byMethod = {};

  snap.docs.forEach((d) => {
    const t = d.data();
    const minor = Math.round((Number(t.amount) || 0) * 100);
    const kind = classifyIncomeTx(t);

    // Concessions and their reversals never moved cash; they net inside their own bucket.
    if (kind === "discount") { concessionsMinor += minor; return; }
    if (kind === "void") { reversalsMinor += minor; reversalCount++; return; }

    grossMinor += minor;
    if (!t.isVoided) {
      paymentCount++;
      const m = t.method || "Cash";
      byMethod[m] = (byMethod[m] || 0) + minor;
      if (t.externalRef) withReference++; else withoutReference++;
    }
  });

  return {
    grossMinor,
    reversalsMinor,
    netMinor: grossMinor + reversalsMinor, // reversals are stored negative
    concessionsMinor,
    paymentCount,
    reversalCount,
    byMethod,
    matchable: { withReference, withoutReference },
    documentCount: snap.size,
  };
}

exports.closePeriod = onCall(async (request) => {
  const { email } = await assertCanClose(request.auth);
  const periodKey = String(request.data?.periodKey || "");
  if (!PERIOD_RE.test(periodKey)) {
    throw new HttpsError("invalid-argument", "periodKey must look like '2026-09'.");
  }

  const db = admin.firestore();
  const ref = db.collection("periods").doc(periodKey);
  const existing = await ref.get();
  if (existing.exists && existing.data().status === "closed") {
    throw new HttpsError("failed-precondition", `Period ${periodKey} is already closed.`);
  }

  const totals = await computeTotals(db, periodKey);
  await ref.set(
    {
      periodKey,
      status: "closed",
      totals,
      closedAt: FieldValue.serverTimestamp(),
      closedBy: email,
      // Kept so a later recomputation can be diffed against what was signed off.
      frozenTotals: totals,
    },
    { merge: true }
  );

  logger.info("closePeriod", { periodKey, closedBy: email, netMinor: totals.netMinor });
  return { periodKey, status: "closed", totals };
});

/**
 * Reopening is admin-only and deliberately leaves a trail. It exists because refusing to
 * ever reopen would push people into worse workarounds, not because reopening is routine.
 */
exports.reopenPeriod = onCall(async (request) => {
  const { isAdmin, email } = await assertCanClose(request.auth);
  if (!isAdmin) throw new HttpsError("permission-denied", "Only an administrator can reopen a closed period.");

  const periodKey = String(request.data?.periodKey || "");
  const reason = String(request.data?.reason || "").trim();
  if (!PERIOD_RE.test(periodKey)) throw new HttpsError("invalid-argument", "periodKey must look like '2026-09'.");
  if (!reason) throw new HttpsError("invalid-argument", "A reason is required to reopen a closed period.");

  const db = admin.firestore();
  const ref = db.collection("periods").doc(periodKey);
  const existing = await ref.get();
  if (!existing.exists || existing.data().status !== "closed") {
    throw new HttpsError("failed-precondition", `Period ${periodKey} is not closed.`);
  }

  await ref.set(
    {
      status: "open",
      reopenedAt: FieldValue.serverTimestamp(),
      reopenedBy: email,
      reopenReason: reason,
      // The totals at sign-off survive the reopen, so the drift introduced afterwards
      // stays visible rather than being quietly overwritten.
      reopenHistory: FieldValue.arrayUnion({
        at: new Date().toISOString(),
        by: email,
        reason,
        totalsAtClose: existing.data().frozenTotals || null,
      }),
    },
    { merge: true }
  );

  logger.warn("reopenPeriod", { periodKey, reopenedBy: email, reason });
  return { periodKey, status: "open" };
});

/** Recompute without closing — lets a period be reviewed before sign-off. */
exports.previewPeriod = onCall(async (request) => {
  await assertCanClose(request.auth);
  const periodKey = String(request.data?.periodKey || "");
  if (!PERIOD_RE.test(periodKey)) throw new HttpsError("invalid-argument", "periodKey must look like '2026-09'.");

  const db = admin.firestore();
  const totals = await computeTotals(db, periodKey);
  const existing = await db.collection("periods").doc(periodKey).get();
  const frozen = existing.exists ? existing.data().frozenTotals : null;

  return {
    periodKey,
    status: existing.exists ? existing.data().status : "open",
    totals,
    // Non-zero drift on a closed period means something changed after sign-off.
    driftMinor: frozen ? totals.netMinor - frozen.netMinor : null,
  };
});
