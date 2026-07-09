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
    const summaryChanged = existingSummary.status !== status ||
        existingSummary.dueNow !== dueNow ||
        existingSummary.aheadBy !== aheadBy ||
        existingSummary.totalPaid !== totalPaid ||
        existingSummary.totalDiscounted !== totalDiscounted ||
        existingSummary.annualRemaining !== annualRemaining ||
        existingSummary.annualNetFee !== annualNetFee ||
        existingSummary.expectedToDate !== adjustedExpectedToDate;

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

    const staffId = dataAfter ? dataAfter.staffId : (dataBefore ? dataBefore.staffId : null);
    if (!staffId) return;

    const staffRef = db.collection("staff").doc(staffId);

    return db.runTransaction(async (transaction) => {
        const staffDoc = await transaction.get(staffRef);
        if (!staffDoc.exists) return;

        let walletBalance = staffDoc.data().walletBalance || 0;

        // 1. Revert old record (Update/Delete)
        if (isWalletBefore) {
            const amount = dataBefore.amount || 0;
            if (dataBefore.type === 'funding') walletBalance -= amount;
            else if (dataBefore.type === 'spend') walletBalance += amount;
        }

        // 2. Apply new record (Create/Update)
        if (isWalletAfter) {
            const amount = dataAfter.amount || 0;
            if (dataAfter.type === 'funding') walletBalance += amount;
            else if (dataAfter.type === 'spend') walletBalance -= amount;
        }

        transaction.update(staffRef, {
            walletBalance: walletBalance,
            lastWalletSync: admin.firestore.FieldValue.serverTimestamp()
        });
    });
});
