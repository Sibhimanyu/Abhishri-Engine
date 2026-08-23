const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getComponentKey(c, month = null, academicYear = null) {
  const yearPrefix = academicYear ? `${academicYear}-` : '';
  const id = c.uid || c.name;
  return month ? `${yearPrefix}${id}-${month}` : `${yearPrefix}${id}`;
}

async function reconcileStudent(studentId, db) {
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
        if (tx.isVoided) return;
        if (tx.type === 'void') return;

        if (tx.type === 'discount' || (tx.type === 'void' && tx.category === 'Discount')) {
            totalDiscounted += (tx.amount || 0);
        } else if (tx.type === 'incoming') {
            totalPaid += (tx.amount || 0);
        }
    });

    const now = new Date();
    const startMonth = f.startMonth !== undefined ? f.startMonth : 5;
    const academicStartYear = f.academicStartYear !== undefined ? f.academicStartYear : ((now.getMonth() < startMonth) ? now.getFullYear() - 1 : now.getFullYear());
    const monthsPassed = (now.getFullYear() - academicStartYear) * 12 + (now.getMonth() - startMonth);
    const installmentsExpected = Math.min(f.billingCycle || 12, Math.max(1, monthsPassed + 1));

    const allReqs = [];
    components.filter(c => (c.frequency || '').toLowerCase() !== 'monthly' && c.amount >= 0).forEach(c => {
        allReqs.push({ uid: c.uid, name: c.name, baseAmount: c.baseAmount !== undefined ? c.baseAmount : c.amount, amount: c.amount, frequency: 'onetime', month: null });
    });
    
    for (let i = 0; i < (f.billingCycle || 12); i++) {
        const mIdx = (startMonth + i) % 12;
        const mName = MONTHS[mIdx];
        components.filter(c => (c.frequency || '').toLowerCase() === 'monthly').forEach(c => {
            allReqs.push({ uid: c.uid, name: c.name, baseAmount: c.baseAmount !== undefined ? c.baseAmount : c.amount, amount: c.amount, frequency: 'monthly', month: mName, relativeIdx: i });
        });
    }

    const structuralTotalDiscount = components.filter(c => (c.frequency || '').toLowerCase() !== 'monthly' && c.amount < 0)
        .reduce((acc, c) => acc + Math.abs(c.amount), 0);
    
    let remainingStructDiscount = structuralTotalDiscount;
    const effectiveRequirements = allReqs.map(req => {
        const deduction = Math.min(req.amount, remainingStructDiscount);
        remainingStructDiscount -= deduction;
        return { ...req, effectiveAmount: req.amount - deduction };
    });

    const expectedToDate = effectiveRequirements
        .filter(r => (r.frequency || '').toLowerCase() !== 'monthly' || (r.relativeIdx !== undefined && r.relativeIdx < installmentsExpected))
        .reduce((acc, r) => acc + r.effectiveAmount, 0);

    const annualNetFee = effectiveRequirements.reduce((acc, r) => acc + r.effectiveAmount, 0);

    const componentPayments = {};
    let remainingFunds = totalPaid + totalDiscounted;

    effectiveRequirements.forEach(req => {
        if (remainingFunds <= 0) return;
        const primaryKey = getComponentKey(req, req.month, f.academicStartYear !== undefined ? academicStartYear : null);
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
        dueNow,
        aheadBy,
        totalPaid,
        totalDiscounted,
        annualRemaining,
        annualNetFee,
        expectedToDate: adjustedExpectedToDate,
        lastCalculated: admin.firestore.FieldValue.serverTimestamp()
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
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
        existingSummary.expectedToDate !== adjustedExpectedToDate);

    // No trigger currently watches students/{studentId} for updates, but guard
    // anyway so this can never become the same kind of self-retriggering loop
    // that plan_details had (see planChanged above).
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

exports.dailyFeeReconciliation = onSchedule("every day 00:00", async (event) => {
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
                lastWalletSync: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });
}

/**
 * Trigger to keep staff wallet balances in sync with expenses.
 * Specifically handles source='staff_wallet'.
 */
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
