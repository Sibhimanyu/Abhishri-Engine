const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

/**
 * Trigger to keep student_fees summary in sync with transactions ledger.
 * Handles Create, Update, and Delete.
 */
exports.syncStudentFeeTotals = onDocumentWritten("modules/fees_accounting/transactions/{transactionId}", async (event) => {
    const db = admin.firestore();
    const dataBefore = event.data.before ? event.data.before.data() : null;
    const dataAfter = event.data.after ? event.data.after.data() : null;

    const studentId = dataAfter ? dataAfter.studentId : (dataBefore ? dataBefore.studentId : null);
    if (!studentId) return;

    const studentFeeRef = db.collection("modules").doc("fees_accounting").collection("student_fees").doc(studentId);

    return db.runTransaction(async (transaction) => {
        const sfDoc = await transaction.get(studentFeeRef);
        if (!sfDoc.exists) return;

        const sfData = sfDoc.data();
        let newPaid = sfData.paid || 0;
        let compPayments = sfData.componentPayments || {};

        // 1. Revert old transaction if it existed (Update/Delete)
        if (dataBefore) {
            newPaid -= (dataBefore.amount || 0);
            if (dataBefore.breakdown) {
                Object.entries(dataBefore.breakdown).forEach(([k, v]) => {
                    compPayments[k] = Math.max(0, (compPayments[k] || 0) - v);
                });
            }
        }

        // 2. Apply new transaction if it exists (Create/Update)
        if (dataAfter) {
            newPaid += (dataAfter.amount || 0);
            if (dataAfter.breakdown) {
                Object.entries(dataAfter.breakdown).forEach(([k, v]) => {
                    compPayments[k] = (compPayments[k] || 0) + v;
                });
            }
        }

        transaction.update(studentFeeRef, {
            paid: newPaid,
            componentPayments: compPayments,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastTriggerSync: admin.firestore.FieldValue.serverTimestamp()
        });
    });
});

/**
 * Trigger to keep staff wallet balances in sync with expenses.
 * Specifically handles source='staff_wallet'.
 */
exports.syncStaffWalletBalance = onDocumentWritten("modules/fees_accounting/expenses/{expenseId}", async (event) => {
    const db = admin.firestore();
    const dataBefore = event.data.before ? event.data.before.data() : null;
    const dataAfter = event.data.after ? event.data.after.data() : null;

    // We only care about staff_wallet expenses
    const isWalletBefore = dataBefore && dataBefore.source === 'staff_wallet';
    const isWalletAfter = dataAfter && dataAfter.source === 'staff_wallet';

    if (!isWalletBefore && !isWalletAfter) return;

    const staffId = dataAfter ? dataAfter.staffId : (dataBefore ? dataBefore.staffId : null);
    if (!staffId) return;

    const staffRef = db.collection("modules").doc("staff_directory").collection("staff").doc(staffId);

    return db.runTransaction(async (transaction) => {
        const staffDoc = await transaction.get(staffRef);
        if (!staffDoc.exists) return;

        let walletBalance = staffDoc.data().walletBalance || 0;

        // 1. Revert old record (Update/Delete)
        if (isWalletBefore) {
            const amount = dataBefore.amount || 0;
            // If it was funding, removing it decreases balance. If it was spend, removing it increases balance.
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
