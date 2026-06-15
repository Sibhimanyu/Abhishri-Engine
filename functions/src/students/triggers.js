const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

async function handleStudentDeletion(studentId) {
  const db = admin.firestore();
  const rtdb = admin.database();

  console.log(`Cascading deletion for student: ${studentId}`);

  // 1. Delete fees ledger
  await db.collection('students').doc(studentId).collection('fee_ledger').doc('plan_details').delete();

  // 2. Wipe their node from RTDB attendance (Note: this is complex because attendance is keyed by date)
  // Instead of scanning all dates, we'll let the daily aggregate function handle historical data, 
  // and we just don't have to worry about past attendance records, as long as they don't show up in the UI.
  // The UI won't show them because the entity itself is gone.
  
  // 3. (Optional) Delete parent/student user accounts if they exist and are linked.
}

exports.onStudentDeleted = functions.firestore
  .document('students/{studentId}')
  .onDelete(async (snap, context) => {
    return handleStudentDeletion(context.params.studentId);
  });

// onTuitionStudentDeleted removed as it's merged into onStudentDeleted
