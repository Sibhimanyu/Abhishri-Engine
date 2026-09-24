const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
// Modular import rather than the namespaced admin.firestore statics: identical in
// production, but the Functions emulator's firebase-admin wrapper leaves those undefined,
// which made every write here throw when run locally.
const { FieldValue } = require("firebase-admin/firestore");

async function reconcileStudent(studentId, db) {
    // Shared with the frontend reports (see functions/src/shared/feeTx.mjs). Loaded
    // with a dynamic import because this file is CommonJS and the shared rule is ESM;
    // Node caches the module after the first call, so this is free per-invocation.
    const { classifyIncomeTx } = await import("../shared/feeTx.mjs");
    // Same shared-module arrangement: the billing cutoff for a discontinued student
    // must be identical here and in the ledger screen, or the two disagree on dues.
    const { billingSchedule, isDiscontinued } = await import("../shared/enrollment.mjs");
    // Line items and their keys come from the same module logPayment splits payments
    // with, so a payment's breakdown and componentPayments always use one key scheme.
    const { buildRequirements, componentKey } = await import("../shared/feeAllocation.mjs");
    const studentRef = db.collection("students").doc(studentId);
    const planRef = studentRef.collection("fee_ledger").doc("plan_details");
    const txRef = studentRef.collection("transactions");

    const [planDoc, txSnap, studentDoc] = await Promise.all([
        planRef.get(),
        txRef.orderBy('timestamp', 'asc').get(),
        studentRef.get()
    ]);

    const f = planDoc.exists ? planDoc.data() : { components: [], billingCycle: 12, startMonth: 5 };
    const components = f.components || [];

    let totalPaid = 0;
    let totalDiscounted = 0;

    txSnap.docs.forEach(doc => {
        const tx = doc.data();
        // A voided original and its reversal cancel each other, so both sides are
        // skipped. Classification itself comes from the shared rule so this engine
        // can never disagree with the Reports tab about what counts as cash/discount.
        if (tx.isVoided) return;
        const kind = classifyIncomeTx(tx);
        if (kind === 'void') return;

        if (kind === 'discount') {
            totalDiscounted += (tx.amount || 0);
        } else {
            totalPaid += (tx.amount || 0);
        }
    });

    const now = new Date();
    const student = studentDoc.exists ? studentDoc.data() : {};
    const studentLeft = isDiscontinued(student);
    // Which months are billed. A discontinued student stops accruing at their exit
    // month, and months spent away between an earlier exit and a re-enrollment are
    // skipped. `chargeable` is the whole obligation: the full cycle for an active
    // student, and the final settlement (through the exit month) for one who has left.
    const schedule = billingSchedule(f, student, now);
    const installmentsExpected = schedule.due.length;

    const effectiveRequirements = buildRequirements(f);

    const expectedToDate = effectiveRequirements
        .filter(r => (r.frequency || '').toLowerCase() !== 'monthly' || (r.relativeIdx !== undefined && schedule.isDue(r.relativeIdx)))
        .reduce((acc, r) => acc + r.effectiveAmount, 0);

    const chargeableRequirements = effectiveRequirements
        .filter(r => (r.frequency || '').toLowerCase() !== 'monthly' || (r.relativeIdx !== undefined && schedule.isChargeable(r.relativeIdx)));

    const annualNetFee = chargeableRequirements.reduce((acc, r) => acc + r.effectiveAmount, 0);

    const componentPayments = {};
    let remainingFunds = totalPaid + totalDiscounted;

    // Allocate only against chargeable rows: money a departed student paid beyond
    // their exit month must surface as aheadBy (a refund) rather than being parked
    // against months they will never attend (or months they were away).
    chargeableRequirements.forEach(req => {
        if (remainingFunds <= 0) return;
        const primaryKey = componentKey(req, f);
        const allocation = Math.min(remainingFunds, req.effectiveAmount);
        if (allocation > 0) {
            componentPayments[primaryKey] = allocation;
            remainingFunds -= allocation;
        }
    });

    const adjustedExpectedToDate = Math.max(0, expectedToDate - totalDiscounted);
    const dueNow = Math.max(0, adjustedExpectedToDate - totalPaid);
    const aheadBy = Math.max(0, totalPaid - adjustedExpectedToDate);
    const annualAdjustedExpected = Math.max(0, annualNetFee - totalDiscounted);
    const annualRemaining = Math.max(0, annualAdjustedExpected - totalPaid);

    let status = 'clear';
    if (dueNow > 0) status = 'arrears';
    if (aheadBy > 0) status = 'ahead';
    if (!planDoc.exists || components.length === 0) status = 'unconfigured';

    const financialSummary = {
        status,
        enrollmentStatus: studentLeft ? 'discontinued' : 'active',
        installmentsBilled: installmentsExpected,
        dueNow,
        aheadBy,
        totalPaid,
        totalDiscounted,
        annualRemaining,
        annualNetFee,
        expectedToDate: adjustedExpectedToDate,
        lastCalculated: FieldValue.serverTimestamp()
    };

    const batch = db.batch();

    if (planDoc.exists) {
        const existing = planDoc.data();
        const planChanged = existing.paid !== totalPaid ||
            existing.discounted !== totalDiscounted ||
            existing.total !== annualNetFee ||
            JSON.stringify(existing.componentPayments || {}) !== JSON.stringify(componentPayments);

        // Only write when values actually change: plan_details is watched by
        // syncFeePlanUpdates, so an unconditional write (e.g. via serverTimestamp)
        // would re-trigger this function on every run, looping forever.
        if (planChanged) {
            batch.update(planRef, {
                paid: totalPaid,
                discounted: totalDiscounted,
                componentPayments: componentPayments,
                total: annualNetFee,
                updatedAt: FieldValue.serverTimestamp()
            });
        }
    }

    const existingSummary = studentDoc.exists ? (studentDoc.data().financialSummary || {}) : {};
    // Require studentDoc.exists: when the student was just deleted (e.g. onStudentDeleted
    // deleting plan_details, which re-triggers this via syncFeePlanUpdates), the parent doc
    // is already gone. Without this guard, `existingSummary` defaults to {} and every field
    // compares as "changed", so batch.update below always fires on a nonexistent document
    // and throws NOT_FOUND, failing every student deletion.
    const summaryChanged = studentDoc.exists && (
        existingSummary.status !== status ||
        existingSummary.dueNow !== dueNow ||
        existingSummary.aheadBy !== aheadBy ||
        existingSummary.totalPaid !== totalPaid ||
        existingSummary.totalDiscounted !== totalDiscounted ||
        existingSummary.annualRemaining !== annualRemaining ||
        existingSummary.annualNetFee !== annualNetFee ||
        existingSummary.installmentsBilled !== installmentsExpected ||
        existingSummary.enrollmentStatus !== (studentLeft ? 'discontinued' : 'active') ||
        existingSummary.expectedToDate !== adjustedExpectedToDate);

    // Required, not defensive: syncStudentEnrollmentChanges watches students/{id},
    // so an unconditional write here would re-trigger it. That trigger also ignores
    // writes that only touch financialSummary; both guards together stop the loop.
    if (summaryChanged) {
        batch.update(studentRef, {
            financialSummary: financialSummary
        });
    }

    await batch.commit();
}

/**
 * Trigger to keep student_fees summary in sync with transactions ledger.
 * Handles Create, Update, and Delete.
 */
exports.syncStudentFeeTotals = onDocumentWritten("students/{studentId}/transactions/{transactionId}", async (event) => {
    const db = admin.firestore();
    const dataBefore = event.data.before ? event.data.before.data() : null;
    const dataAfter = event.data.after ? event.data.after.data() : null;

    const studentId = event.params.studentId || (dataAfter ? dataAfter.studentId : (dataBefore ? dataBefore.studentId : null));
    if (!studentId) return;

    await reconcileStudent(studentId, db);
});

/**
 * Trigger to keep student_fees summary in sync with the fee plan.
 * Handles changes to the student's fee plan configuration.
 */
exports.syncFeePlanUpdates = onDocumentWritten("students/{studentId}/fee_ledger/plan_details", async (event) => {
    const db = admin.firestore();
    const studentId = event.params.studentId;
    if (!studentId) return;

    await reconcileStudent(studentId, db);
});

/**
 * Recompute dues when the student record itself changes.
 *
 * Discontinuing a student freezes their billing at the exit month, but that lives on
 * students/{id} — which neither of the triggers above watches — so without this the
 * ledger kept showing pre-exit dues until the nightly job caught up.
 *
 * The loop guard matters: reconcileStudent writes financialSummary back onto this very
 * document, so a write that only touched financialSummary must not re-enter.
 */
exports.syncStudentEnrollmentChanges = onDocumentWritten("students/{studentId}", async (event) => {
    const db = admin.firestore();
    const studentId = event.params.studentId;
    if (!studentId) return;

    const before = event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after && event.data.after.exists ? event.data.after.data() : null;
    if (!after) return; // deletion is handled by onStudentDeleted

    if (before) {
        const strip = (d) => {
            const { financialSummary, ...rest } = d;
            return JSON.stringify(rest);
        };
        if (strip(before) === strip(after)) return;

        const sameEnrollment = (before.enrollmentStatus || 'active') === (after.enrollmentStatus || 'active') &&
            JSON.stringify(before.discontinuation || null) === JSON.stringify(after.discontinuation || null) &&
            // Past absences decide which months are skipped after a re-enrollment.
            JSON.stringify(before.discontinuationHistory || null) === JSON.stringify(after.discontinuationHistory || null);
        // Only enrollment affects the dues maths; skip the churn of every unrelated
        // profile edit (address, phone, nakshatra, ...) re-running the engine.
        if (sameEnrollment) return;
    }

    await reconcileStudent(studentId, db);
});

async function performReconciliation() {
    const db = admin.firestore();
    const studentsSnap = await db.collection("students").get();
    
    // Process in batches
    for (let i = 0; i < studentsSnap.docs.length; i += 50) {
        const batchDocs = studentsSnap.docs.slice(i, i + 50);
        await Promise.all(batchDocs.map(async (doc) => {
            await reconcileStudent(doc.id, db);
        }));
    }
}

// timeZone matters: without it Cloud Scheduler runs at 00:00 UTC = 05:30 IST, so on
// the 1st of each month the newly-due installment didn't appear until mid-morning.
exports.dailyFeeReconciliation = onSchedule({ schedule: "every day 00:00", timeZone: "Asia/Kolkata" }, async (event) => {
    await performReconciliation();
});

/**
 * Recompute one staff member's walletBalance from their staff_wallet expenses.
 *
 * This is a full recompute rather than delta-tracking on purpose. The previous
 * delta version only subtracted on type === 'spend', but both frontend writers
 * (FeesMyExpenses, FeesStaffWallets) record wallet debits as type === 'expense',
 * so spends were never applied and every balance drifted upward (funding-only).
 * A recompute is idempotent — at-least-once event redeliveries just recompute
 * the same value (so no _wallet_sync_events dedupe marker is needed) — and it
 * self-heals that historical drift on each staff member's next wallet event.
 *
 * Sign convention matches the client-side calculators in FeesMyExpenses and
 * FeesStaffWallets: 'funding' credits, everything else ('expense', legacy
 * 'spend') debits.
 */
async function resyncWalletBalance(db, staffId) {
    const staffRef = db.collection("staff").doc(staffId);
    const walletQuery = db.collection("expenses")
        .where("source", "==", "staff_wallet")
        .where("staffId", "==", staffId);

    // Transaction so two near-simultaneous wallet events for the same staff member
    // serialize instead of racing (the later, stale recompute clobbering the fresh one).
    await db.runTransaction(async (transaction) => {
        const [staffDoc, walletSnap] = await Promise.all([
            transaction.get(staffRef),
            transaction.get(walletQuery)
        ]);
        if (!staffDoc.exists) return;

        let walletBalance = 0;
        walletSnap.docs.forEach((doc) => {
            const e = doc.data();
            const amount = e.amount || 0;
            if (e.type === 'funding') walletBalance += amount;
            else walletBalance -= amount;
        });

        // Skip the write when nothing changed — keeps redeliveries free and avoids
        // pointless lastWalletSync churn on every unrelated recompute.
        if ((staffDoc.data().walletBalance || 0) !== walletBalance) {
            transaction.update(staffRef, {
                walletBalance: walletBalance,
                lastWalletSync: FieldValue.serverTimestamp()
            });
        }
    });
}

/**
 * Trigger to keep staff wallet balances in sync with expenses.
 * Specifically handles source='staff_wallet'.
 */
/**
 * Nightly safety net for wallet balances.
 *
 * resyncWalletBalance only runs when a staff_wallet expense is written, so it
 * "self-heals on the next wallet event" — which never arrives for a staff member
 * who simply has no further wallet activity. The recompute fix shipped 2026-08-23,
 * but one account's last wallet event was 2026-07-08, so it kept displaying the
 * old delta-bug figure (funding-only, Rs 1,000) instead of its true balance
 * (Rs 45) indefinitely.
 *
 * This mirrors dailyFeeReconciliation: same semantics, applied to everyone on a
 * schedule, so a stale balance can persist for at most a day. resyncWalletBalance
 * skips the write when nothing changed, so a steady state costs reads only.
 */
async function performWalletReconciliation() {
    const db = admin.firestore();
    const staffSnap = await db.collection("staff").get();
    for (let i = 0; i < staffSnap.docs.length; i += 25) {
        const chunk = staffSnap.docs.slice(i, i + 25);
        await Promise.all(chunk.map((doc) => resyncWalletBalance(db, doc.id)));
    }
}

exports.dailyWalletReconciliation = onSchedule(
    { schedule: "every day 00:20", timeZone: "Asia/Kolkata" },
    async () => {
        await performWalletReconciliation();
    }
);

exports.syncStaffWalletBalance = onDocumentWritten("expenses/{expenseId}", async (event) => {
    const db = admin.firestore();
    const dataBefore = event.data.before ? event.data.before.data() : null;
    const dataAfter = event.data.after ? event.data.after.data() : null;

    // We only care about staff_wallet expenses
    const isWalletBefore = dataBefore && dataBefore.source === 'staff_wallet';
    const isWalletAfter = dataAfter && dataAfter.source === 'staff_wallet';

    if (!isWalletBefore && !isWalletAfter) return;

    // An update could in principle retarget staffId (rules forbid it for non-exp_all
    // callers, but admins bypass that) — resync every staff member the event touches.
    const staffIds = new Set();
    if (isWalletBefore && dataBefore.staffId) staffIds.add(dataBefore.staffId);
    if (isWalletAfter && dataAfter.staffId) staffIds.add(dataAfter.staffId);
    if (staffIds.size === 0) return;

    await Promise.all(Array.from(staffIds).map((staffId) => resyncWalletBalance(db, staffId)));
});
