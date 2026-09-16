const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

/**
 * Cash settlement — the other half of "where did the money actually go".
 *
 * Rs 275,100 across 51 cash and cheque payments is recorded as collected, and nothing
 * anywhere says whether it reached a bank. An electronic payment reconciles against a
 * statement line by reference; cash can only reconcile against a DEPOSIT, so without
 * this collection a third of the money is unauditable by construction.
 *
 * A deposit groups payments that were banked together and records the slip. Membership
 * lives in a subcollection keyed BY PAYMENT ID rather than as a field on the payment,
 * for two reasons: the ledger is append-only since phase 3 (stamping depositId onto a
 * posted payment would be exactly the in-place rewrite that was just prohibited), and a
 * payment-id document key makes adding the same payment twice structurally impossible.
 */

/** Only cash-like instruments need a deposit; electronic payments settle themselves. */
const DEPOSITABLE_METHODS = ["Cash", "Cheque"];

async function assertCanDeposit(auth) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const db = admin.firestore();
  const byUid = await db.collection("allowed_users").doc(auth.uid).get();
  const doc = byUid.exists
    ? byUid
    : await db.collection("allowed_users").doc(String(auth.token?.email || "").toLowerCase()).get();
  const data = doc.exists ? doc.data() : null;
  const isAdmin = data?.isAdmin === true || data?.role === "admin";
  const perms = data?.permissions?.fees_accounting || {};
  if (!isAdmin && perms.config !== true && perms.ledger !== true) {
    throw new HttpsError("permission-denied", "Recording a deposit needs admin, fees config or ledger rights.");
  }
  return { isAdmin, email: auth.token?.email || null };
}

/**
 * Record that a set of payments was banked together.
 *
 * Validates every payment before writing anything: a deposit that silently drops or
 * double-counts a payment is worse than no deposit record, because it would reconcile
 * to a number nobody can trace back.
 */
exports.createDeposit = onCall(async (request) => {
  const { email } = await assertCanDeposit(request.auth);
  const db = admin.firestore();

  const paymentPaths = Array.isArray(request.data?.paymentPaths) ? request.data.paymentPaths : [];
  const reference = String(request.data?.reference || "").trim();
  const bankLabel = String(request.data?.bankLabel || "").trim();
  const depositedAtRaw = request.data?.depositedAt;

  if (!paymentPaths.length) throw new HttpsError("invalid-argument", "Select at least one payment to deposit.");
  if (paymentPaths.length > 400) throw new HttpsError("invalid-argument", "Too many payments for one deposit (max 400).");
  if (!reference) throw new HttpsError("invalid-argument", "A deposit reference (slip or counterfoil number) is required.");

  const depositedAt = depositedAtRaw ? new Date(depositedAtRaw) : new Date();
  if (isNaN(depositedAt.getTime())) throw new HttpsError("invalid-argument", "depositedAt is not a valid date.");

  // --- validate every payment up front -------------------------------------------
  const docs = await db.getAll(...paymentPaths.map((p) => db.doc(p)));
  const lines = [];
  const problems = [];

  for (let i = 0; i < docs.length; i++) {
    const snap = docs[i];
    const path = paymentPaths[i];
    if (!snap.exists) { problems.push(`${path}: no such payment`); continue; }
    const t = snap.data();
    if (t.type !== "incoming") problems.push(`${path}: not an incoming payment (type ${t.type})`);
    else if (t.isVoided === true) problems.push(`${path}: voided payments cannot be deposited`);
    else if (!DEPOSITABLE_METHODS.includes(t.method)) problems.push(`${path}: ${t.method} settles electronically, it is not deposited`);
    else lines.push({ path, id: snap.id, data: t });
  }

  // Already banked? Checked across ALL deposits. Firestore caps an `in` filter at 30
  // values, so this chunks rather than truncating: a partial check would let the same
  // cash be banked twice and reconcile to a number nobody can trace.
  for (let i = 0; i < lines.length; i += 30) {
    const chunk = lines.slice(i, i + 30).map((l) => l.id);
    const already = await db.collectionGroup("deposit_lines").where("paymentId", "in", chunk).get();
    already.docs.forEach((d) => {
      const dep = d.ref.parent.parent?.id;
      problems.push(`${d.data().paymentPath || d.id}: already banked in deposit ${dep}`);
    });
  }

  if (problems.length) {
    throw new HttpsError("failed-precondition", `Deposit rejected:\n- ${problems.slice(0, 10).join("\n- ")}`);
  }

  const totalMinor = lines.reduce((a, l) => a + Math.round((Number(l.data.amount) || 0) * 100), 0);
  const depositRef = db.collection("deposits").doc();
  const batch = db.batch();

  batch.set(depositRef, {
    reference,
    bankLabel: bankLabel || null,
    depositedAt,
    // The period the DEPOSIT falls in, which is not necessarily the period the payments
    // were received in — cash collected in August and banked in September belongs to
    // August for collections and September for the bank statement.
    periodKey: `${depositedAt.getFullYear()}-${String(depositedAt.getMonth() + 1).padStart(2, "0")}`,
    totalMinor,
    paymentCount: lines.length,
    status: "deposited",
    createdBy: email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  lines.forEach((l) => {
    batch.set(depositRef.collection("deposit_lines").doc(l.id), {
      paymentId: l.id,
      paymentPath: l.path,
      studentId: l.data.studentId || null,
      studentName: l.data.studentName || null,
      method: l.data.method,
      amountMinor: Math.round((Number(l.data.amount) || 0) * 100),
      receivedAt: l.data.receivedAt || l.data.timestamp || null,
      receivedPeriodKey: l.data.periodKey || null,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
  logger.info("createDeposit", { depositId: depositRef.id, totalMinor, paymentCount: lines.length, by: email });
  return { depositId: depositRef.id, totalMinor, paymentCount: lines.length };
});

/**
 * Cash and cheques collected but not yet in any deposit.
 *
 * This is the number that should match the cash tin, and the one an auditor asks for.
 */
exports.undepositedCash = onCall(async (request) => {
  await assertCanDeposit(request.auth);
  const db = admin.firestore();
  const { classifyIncomeTx } = await import("../shared/feeTx.mjs");

  const [txSnap, lineSnap] = await Promise.all([
    db.collectionGroup("transactions").get(),
    db.collectionGroup("deposit_lines").get(),
  ]);

  const banked = new Set(lineSnap.docs.map((d) => d.data().paymentId));
  const rows = [];
  let totalMinor = 0;

  txSnap.docs.forEach((d) => {
    const t = d.data();
    if (classifyIncomeTx(t) !== "incoming" || t.isVoided === true) return;
    if (!DEPOSITABLE_METHODS.includes(t.method)) return;
    if (banked.has(d.id)) return;
    const minor = Math.round((Number(t.amount) || 0) * 100);
    totalMinor += minor;
    rows.push({
      paymentId: d.id,
      paymentPath: d.ref.path,
      studentName: t.studentName || null,
      method: t.method,
      amountMinor: minor,
      receivedAt: t.receivedAt || t.timestamp || null,
      periodKey: t.periodKey || null,
    });
  });

  rows.sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)));
  return { totalMinor, count: rows.length, rows: rows.slice(0, 500) };
});
