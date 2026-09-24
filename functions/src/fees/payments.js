const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
// Modular import rather than the namespaced admin.firestore statics: identical in
// production, but the Functions emulator's firebase-admin wrapper leaves those undefined,
// which made every write here throw when run locally.
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { resolveAccess } = require("../shared/access");

/**
 * Record a fee payment. The one write path for payments, used by the web ledger and the
 * iOS app, so the checks and the split across fee lines exist exactly once:
 *   - the caller needs admin or fees_accounting.trans_add (as firestore.rules)
 *   - bank-bound methods need a reference, so the payment can be matched to a statement
 *   - payments can't land in a closed accounting period (periods/{YYYY-MM})
 *   - the payment's breakdown (what the receipt shows) is computed here from the
 *     student's plan, with the same rules the dues engine uses
 *   - the idempotency key is the document id, inside a transaction: a retried or
 *     double-tapped submit returns the payment already recorded instead of a second one
 *
 * The document is the same shape the web wrote directly before this existed, so every
 * reader (dues engine, reports, receipts, reconciliation) is unchanged.
 */

const TZ_OFFSET = "+05:30"; // the school's calendar (Asia/Kolkata); IST has no DST
const MAX_AMOUNT = 10000000;

/** 'YYYY-MM-DD' / 'YYYY-MM' of an instant in IST, whatever the server's timezone. */
function istParts(date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).reduce((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return { day: `${p.year}-${p.month}-${p.day}`, period: `${p.year}-${p.month}` };
}

exports.logPayment = onCall(async (request) => {
  const access = await resolveAccess(request.auth);
  if (!access || !access.can("fees_accounting", "trans_add")) {
    throw new HttpsError("permission-denied", "Recording a payment needs admin or fees 'add transaction' rights.");
  }
  const { PAYMENT_METHODS, validateReference, requiresReference } = await import("../shared/paymentRules.mjs");
  const { billingSchedule } = await import("../shared/enrollment.mjs");
  const { allocatePayment } = await import("../shared/feeAllocation.mjs");

  const data = request.data || {};
  const studentId = String(data.studentId || "");
  const amount = Number(data.amount);
  const method = String(data.method || "Cash");
  const description = String(data.description || "").trim().slice(0, 200) || "Fee Payment";
  const externalRef = String(data.externalRef || "").trim().slice(0, 100);
  const idempotencyKey = String(data.idempotencyKey || "");
  const selectedKeys = Array.isArray(data.selectedKeys) ? data.selectedKeys.map(String).slice(0, 100) : [];
  const recordedVia = ["web", "ios"].includes(data.recordedVia) ? data.recordedVia : "web";

  if (!/^[A-Za-z0-9_-]{1,120}$/.test(studentId)) throw new HttpsError("invalid-argument", "studentId is missing or malformed.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new HttpsError("invalid-argument", "Enter a payment amount greater than zero.");
  }
  if (!PAYMENT_METHODS.includes(method)) throw new HttpsError("invalid-argument", `Unknown payment method "${method}".`);
  const refError = validateReference(method, externalRef);
  if (refError) throw new HttpsError("invalid-argument", refError);
  // Same shape newIdempotencyKey() produces (a UUID, or its idem- fallback).
  if (!/^[A-Za-z0-9-]{8,64}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "idempotencyKey is missing or malformed.");

  // Value date: a 'YYYY-MM-DD' backdate is midnight IST that day, matching how the web
  // stored backdated payments; no date means now.
  const now = new Date();
  let receivedAt = now;
  let backdated = false;
  if (data.receivedOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.receivedOn))) throw new HttpsError("invalid-argument", "receivedOn must look like 2026-09-24.");
    receivedAt = new Date(`${data.receivedOn}T00:00:00${TZ_OFFSET}`);
    if (isNaN(receivedAt.getTime())) throw new HttpsError("invalid-argument", "receivedOn is not a real date.");
    if (String(data.receivedOn) > istParts(now).day) throw new HttpsError("invalid-argument", "A payment can't be dated in the future.");
    backdated = true;
  }
  const periodKey = istParts(receivedAt).period;

  const db = admin.firestore();
  const studentRef = db.collection("students").doc(studentId);
  const txRef = studentRef.collection("transactions").doc(idempotencyKey);

  const result = await db.runTransaction(async (t) => {
    const [existing, studentSnap, planSnap, periodSnap] = await Promise.all([
      t.get(txRef),
      t.get(studentRef),
      t.get(studentRef.collection("fee_ledger").doc("plan_details")),
      t.get(db.collection("periods").doc(periodKey)),
    ]);
    if (existing.exists) {
      const prior = existing.data();
      // A retry of this very payment: report the one already recorded.
      if (prior.idempotencyKey === idempotencyKey && prior.studentId === studentId) {
        return { id: txRef.id, duplicate: true, breakdown: prior.breakdown || {}, breakdownNames: prior.breakdownNames || {}, studentName: prior.studentName };
      }
      throw new HttpsError("already-exists", "That payment id is already used by another record.");
    }
    if (!studentSnap.exists) throw new HttpsError("not-found", "No such student.");
    if (periodSnap.exists && (periodSnap.data().status || "open") === "closed") {
      throw new HttpsError("failed-precondition", `${periodKey} is closed for accounting. Date the payment in an open month, or reopen ${periodKey} first.`);
    }

    const student = studentSnap.data();
    const plan = planSnap.exists ? planSnap.data() : { components: [] };
    const { breakdown, breakdownNames } = allocatePayment({
      plan, schedule: billingSchedule(plan, student, now), amount, selectedKeys,
    });
    const studentName = student.name || `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Unknown";
    const receivedTs = Timestamp.fromDate(receivedAt);

    t.create(txRef, {
      studentId,
      studentName,
      amount,
      method,
      description,
      category: "General Fees",
      type: "incoming",
      breakdown,
      breakdownNames,
      // `timestamp` stays the field every existing reader sorts and dates by.
      timestamp: backdated ? receivedTs : FieldValue.serverTimestamp(),
      addedBy: access.email || "Unknown",
      recordedAt: FieldValue.serverTimestamp(),
      externalRef: requiresReference(method) ? externalRef : "",
      receivedAt: receivedTs,
      periodKey,
      idempotencyKey,
      schemaVersion: 2,
      recordedVia,
    });
    t.create(db.collection("audit_logs").doc(), {
      action: "PAYMENT_LOGGED",
      module: "fees_accounting",
      targetId: txRef.id,
      targetName: studentName,
      performedBy: String(access.email || "").toLowerCase() || null,
      timestamp: FieldValue.serverTimestamp(),
      details: { amount, method, description, externalRef: externalRef || null, recordedVia },
    });
    return { id: txRef.id, duplicate: false, breakdown, breakdownNames, studentName };
  });

  logger.info("logPayment", { studentId, id: result.id, amount, method, duplicate: result.duplicate, by: access.email });
  return result;
});
