const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

/**
 * Runs every day at 11:59 PM to aggregate RTDB attendance data into Firestore.
 * This solves the N+1 query problem by providing a pre-calculated 30-day view.
 */
exports.aggregateDailyAttendance = onSchedule("59 23 * * *", async (event) => {
  const db = admin.firestore();
  const rtdb = admin.database();

  const today = new Date().toISOString().split('T')[0];
  console.log(`Aggregating attendance for ${today}`);

  const modules = ['staff_directory', 'preschool_directory', 'tuition_directory'];

  for (const mod of modules) {
    const rtdbRef = rtdb.ref(`modules/${mod}/attendance/${today}`);
    const snapshot = await rtdbRef.once('value');
    
    if (!snapshot.exists()) {
      console.log(`No attendance data found for ${mod} on ${today}.`);
      continue;
    }

    const attendanceData = snapshot.val();
    const batch = db.batch();
    let batchCount = 0;

    for (const [entityId, data] of Object.entries(attendanceData)) {
      if (!data.status) continue;

      const aggregateRef = db.collection('modules').doc('attendance').collection('aggregates').doc(entityId);
      
      // We use Firestore FieldValue.increment to atomically update the counters.
      const increment = admin.firestore.FieldValue.increment(1);
      
      const updateData = {
        totalDays: increment,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      if (data.status === 'present') updateData.presentDays = increment;
      if (data.status === 'absent') updateData.absentDays = increment;
      if (data.status === 'late') updateData.lateDays = increment;

      batch.set(aggregateRef, updateData, { merge: true });
      batchCount++;

      if (batchCount >= 490) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
    
    console.log(`Aggregated ${mod} attendance for ${today}.`);
  }
});
