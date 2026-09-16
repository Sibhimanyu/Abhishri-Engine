const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

/**
 * Bank statement reconciliation.
 *
 * Import the bank's credit lines for a month, match them against what the ledger says
 * was collected, and surface what does not line up in either direction — a statement
 * line with no payment behind it, or a payment the bank never received.
 *
 * MATCHING PHILOSOPHY
 * An automatic match is only made when it is unambiguous. Where two payments could
 * equally explain a line, the line is left unmatched WITH its candidates recorded, for
 * a human to choose. A wrong auto-match is far worse than an unmatched line: the line
 * looks reconciled, the real payment silently stays open, and nobody ever looks again.
 *
 * Confidence is recorded per line so a reviewer can tell a reference hit (the bank's own
 * identifier) from an amount-and-date guess.
 */

async function assertCanReconcile(auth) {
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
    throw new HttpsError("permission-denied", "Reconciliation needs admin, fees config or ledger rights.");
  }
  return { isAdmin, email: auth.token?.email || null };
}

/** Shared with the matcher so both sides normalise references identically. */
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const toDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Import a set of statement lines as a reconciliation run.
 *
 * Lines are stored exactly as supplied. The statement is evidence: if it is later
 * re-parsed differently, that should be a new run rather than a quiet edit of this one.
 */
exports.importStatement = onCall(async (request) => {
  const { email } = await assertCanReconcile(request.auth);
  const db = admin.firestore();

  const periodKey = String(request.data?.periodKey || "");
  const bankLabel = String(request.data?.bankLabel || "").trim();
  const rawLines = Array.isArray(request.data?.lines) ? request.data.lines : [];

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw new HttpsError("invalid-argument", "periodKey must look like '2026-09'.");
  if (!rawLines.length) throw new HttpsError("invalid-argument", "No statement lines supplied.");
  if (rawLines.length > 2000) throw new HttpsError("invalid-argument", "Statement too large (max 2000 lines).");

  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i] || {};
    const amountMinor = Math.round(Number(l.amount) * 100);
    const valueDate = toDate(l.valueDate);
    if (!Number.isFinite(amountMinor) || amountMinor === 0) {
      throw new HttpsError("invalid-argument", `Line ${i + 1}: amount is missing or zero.`);
    }
    if (!valueDate) throw new HttpsError("invalid-argument", `Line ${i + 1}: value date is missing or unparseable.`);
    lines.push({
      rowIndex: i,
      valueDate,
      description: String(l.description || "").slice(0, 500),
      reference: String(l.reference || "").slice(0, 200),
      amountMinor: Math.abs(amountMinor),
      // Only credits can settle a fee. Debits are carried so the statement stays whole
      // and the totals visibly tie out, but they are never match candidates.
      direction: amountMinor < 0 ? "debit" : "credit",
      status: "unmatched",
    });
  }

  const runRef = db.collection("reconciliations").doc();
  const credits = lines.filter((l) => l.direction === "credit");

  const batch = db.batch();
  batch.set(runRef, {
    periodKey,
    bankLabel: bankLabel || null,
    source: "bank",
    status: "draft",
    importedAt: admin.firestore.FieldValue.serverTimestamp(),
    importedBy: email,
    stats: {
      lineCount: lines.length,
      creditCount: credits.length,
      debitCount: lines.length - credits.length,
      creditMinor: credits.reduce((a, l) => a + l.amountMinor, 0),
      matchedCount: 0,
      matchedMinor: 0,
    },
  });
  lines.forEach((l) => batch.set(runRef.collection("lines").doc(String(l.rowIndex).padStart(5, "0")), l));
  await batch.commit();

  logger.info("importStatement", { runId: runRef.id, periodKey, lineCount: lines.length, by: email });
  return { runId: runRef.id, lineCount: lines.length, creditCount: credits.length };
});

/**
 * Match the run's credit lines against payments and deposits for the period.
 *
 * Deliberately single-assignment: a payment or deposit already claimed by an earlier line
 * is removed from the candidate pool, so the same money can never satisfy two statement
 * lines. Passes run strongest-evidence-first for the same reason.
 */
exports.autoMatchStatement = onCall(async (request) => {
  const { email } = await assertCanReconcile(request.auth);
  const db = admin.firestore();
  const { classifyIncomeTx } = await import("../shared/feeTx.mjs");

  const runId = String(request.data?.runId || "");
  if (!runId) throw new HttpsError("invalid-argument", "runId is required.");

  const runRef = db.collection("reconciliations").doc(runId);
  const runSnap = await runRef.get();
  if (!runSnap.exists) throw new HttpsError("not-found", "No such reconciliation run.");
  const run = runSnap.data();

  const [lineSnap, txSnap, depSnap] = await Promise.all([
    runRef.collection("lines").get(),
    db.collectionGroup("transactions").where("periodKey", "==", run.periodKey).get(),
    db.collection("deposits").where("periodKey", "==", run.periodKey).get(),
  ]);

  // Candidate payments: electronic only. Cash reaches the bank as a DEPOSIT, so matching
  // a statement credit directly to a cash payment would double-count it against the slip.
  const payments = txSnap.docs
    .map((d) => ({ id: d.id, path: d.ref.path, ...d.data() }))
    .filter((t) => classifyIncomeTx(t) === "incoming" && t.isVoided !== true && !["Cash", "Cheque"].includes(t.method))
    .map((t) => ({
      id: t.id,
      path: t.path,
      amountMinor: Math.round((Number(t.amount) || 0) * 100),
      ref: norm(t.externalRef),
      date: toDate(t.receivedAt || t.timestamp),
      studentName: t.studentName || null,
    }));

  const deposits = depSnap.docs.map((d) => ({
    id: d.id,
    amountMinor: Number(d.data().totalMinor) || 0,
    ref: norm(d.data().reference),
    date: toDate(d.data().depositedAt),
  }));

  const creditLines = lineSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => l.direction === "credit" && l.status !== "ignored")
    .map((l) => ({ ...l, valueDate: toDate(l.valueDate) }));

  // The matching rules live in shared/matchStatement.mjs as a pure function so they can
  // be unit-tested directly; money-matching is exactly the kind of logic that looks
  // obviously right and is quietly wrong at the edges.
  const { matchStatementLines } = await import("../shared/matchStatement.mjs");
  const { results, usedPaymentIds } = matchStatementLines({
    lines: creditLines,
    payments,
    deposits,
  });

  // --- write back -----------------------------------------------------------------
  let matchedCount = 0, matchedMinor = 0;
  const batch = db.batch();
  for (const l of creditLines) {
    const r = results.get(l.id) || { status: "unmatched", matchNote: "No payment found for this line.", matchType: null, confidence: null };
    if (r.status === "matched") { matchedCount++; matchedMinor += l.amountMinor; }
    batch.set(runRef.collection("lines").doc(l.id), {
      status: r.status,
      matchType: r.matchType ?? null,
      confidence: r.confidence ?? null,
      matchNote: r.matchNote ?? null,
      matchedPaymentPath: r.matchedPaymentPath ?? null,
      matchedPaymentId: r.matchedPaymentId ?? null,
      matchedDepositId: r.matchedDepositId ?? null,
      candidates: r.candidates ?? [],
      matchedBy: r.status === "matched" ? "auto" : null,
      matchedAt: r.status === "matched" ? admin.firestore.FieldValue.serverTimestamp() : null,
    }, { merge: true });
  }

  // Payments the bank never shows: the other direction of the reconciliation, and the
  // one people forget to look at.
  const unmatchedPayments = payments.filter((p) => !usedPaymentIds.has(p.id));

  batch.set(runRef, {
    status: "matched",
    matchedAt: admin.firestore.FieldValue.serverTimestamp(),
    matchedBy: email,
    stats: {
      ...run.stats,
      matchedCount,
      matchedMinor,
      unmatchedLineCount: creditLines.length - matchedCount,
      unmatchedPaymentCount: unmatchedPayments.length,
      unmatchedPaymentMinor: unmatchedPayments.reduce((a, p) => a + p.amountMinor, 0),
    },
    unmatchedPayments: unmatchedPayments.slice(0, 200).map((p) => ({
      paymentPath: p.path, amountMinor: p.amountMinor, studentName: p.studentName,
      receivedAt: p.date ? p.date.toISOString() : null, hasReference: p.ref.length > 0,
    })),
  }, { merge: true });

  await batch.commit();
  logger.info("autoMatchStatement", { runId, matchedCount, total: creditLines.length, by: email });
  return {
    runId, matchedCount, lineCount: creditLines.length,
    unmatchedLineCount: creditLines.length - matchedCount,
    unmatchedPaymentCount: unmatchedPayments.length,
  };
});

/** Manual override — accept a candidate, clear a match, or ignore a line. */
exports.setStatementLineMatch = onCall(async (request) => {
  const { email } = await assertCanReconcile(request.auth);
  const db = admin.firestore();

  const runId = String(request.data?.runId || "");
  const lineId = String(request.data?.lineId || "");
  const action = String(request.data?.action || "");
  const paymentPath = request.data?.paymentPath ? String(request.data.paymentPath) : null;
  if (!runId || !lineId) throw new HttpsError("invalid-argument", "runId and lineId are required.");

  const lineRef = db.collection("reconciliations").doc(runId).collection("lines").doc(lineId);
  if (!(await lineRef.get()).exists) throw new HttpsError("not-found", "No such statement line.");

  if (action === "match") {
    if (!paymentPath) throw new HttpsError("invalid-argument", "paymentPath is required to match a line.");
    const pay = await db.doc(paymentPath).get();
    if (!pay.exists) throw new HttpsError("not-found", "No such payment.");
    // Guard the same single-assignment rule the auto-matcher enforces.
    const clash = await db.collection("reconciliations").doc(runId).collection("lines")
      .where("matchedPaymentPath", "==", paymentPath).get();
    if (clash.docs.some((d) => d.id !== lineId)) {
      throw new HttpsError("failed-precondition", "That payment is already matched to another line in this run.");
    }
    await lineRef.set({
      status: "matched", matchedPaymentPath: paymentPath, matchedPaymentId: pay.id,
      matchType: "manual", confidence: "manual", matchNote: `Matched by ${email}.`,
      matchedBy: email, matchedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } else if (action === "unmatch") {
    await lineRef.set({
      status: "unmatched", matchedPaymentPath: null, matchedPaymentId: null, matchedDepositId: null,
      matchType: null, confidence: null, matchNote: `Cleared by ${email}.`, matchedBy: null, matchedAt: null,
    }, { merge: true });
  } else if (action === "ignore") {
    await lineRef.set({
      status: "ignored", matchNote: String(request.data?.note || `Ignored by ${email}.`).slice(0, 300),
      matchedBy: email, matchedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } else {
    throw new HttpsError("invalid-argument", "action must be match, unmatch or ignore.");
  }

  return { runId, lineId, action };
});
