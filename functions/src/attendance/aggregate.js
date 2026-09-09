const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

/**
 * Runs every day at 11:59 PM to aggregate RTDB attendance data into Firestore,
 * so the attendance report reads one small collection instead of fanning out
 * across per-day RTDB nodes.
 *
 * The counters are CUMULATIVE (lifetime totals per entity), not a rolling
 * window - the report renders presentDays/totalDays as-is.
 */
exports.aggregateDailyAttendance = onSchedule({ schedule: "59 23 * * *", timeZone: "Asia/Kolkata" }, async (event) => {
  const db = admin.firestore();
  const rtdb = admin.database();

  // Attendance records are keyed by date in the school's configured timezone (see
  // functions/src/staff/attendance.js getDateKey, default Asia/Kolkata) — computing "today"
  // in UTC can look up the wrong calendar date and silently skip a day's data. Match the
  // scheduler's timeZone above.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  console.log(`Aggregating attendance for ${today}`);

  // These MUST match the paths Attendance.jsx actually writes to:
  //   staff tab            -> modules/staff_directory/attendance/{date}/{id}
  //   preschool + tuition  -> modules/student_directory/attendance/{date}/{id}
  // This previously read preschool_directory/tuition_directory, which nothing has
  // ever written, so every nightly run found no data and aggregated nothing.
  const modules = ['staff_directory', 'student_directory'];

  for (const mod of modules) {
    // Scheduled (Pub/Sub-backed) invocations are at-least-once. Without this marker, a
    // redelivery/retry re-reads the same RTDB snapshot and re-applies every increment,
    // permanently double-counting that day's totals with no way to self-correct.
    const runMarkerRef = db.collection('_attendance_aggregation_runs').doc(`${mod}_${today}`);
    const runMarkerSnap = await runMarkerRef.get();
    if (runMarkerSnap.exists) {
      console.log(`Already aggregated ${mod} for ${today}, skipping (idempotency guard).`);
      continue;
    }

    const rtdbRef = rtdb.ref(`modules/${mod}/attendance/${today}`);
    const snapshot = await rtdbRef.once('value');

    if (!snapshot.exists()) {
      console.log(`No attendance data found for ${mod} on ${today}.`);
      continue;
    }

    const attendanceData = snapshot.val();
    let batch = db.batch();
    let batchCount = 0;

    for (const [entityId, data] of Object.entries(attendanceData)) {
      if (!data.status) continue;

      // Attendance.jsx reads the root 'attendance_aggregates' collection (and that is
      // the path firestore.rules exposes). Writing to modules/attendance/aggregates
      // put the results somewhere no reader and no rule could ever see them.
      const aggregateRef = db.collection('attendance_aggregates').doc(entityId);

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
        // A committed WriteBatch cannot accept further writes — reusing it throws on the
        // next batch.set(), which would abort this run AFTER the first 490 increments
        // committed but BEFORE the run marker below was written. The next run's idempotency
        // guard would then not hold, and those 490 entities would be double-counted.
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    await runMarkerRef.set({ completedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`Aggregated ${mod} attendance for ${today}.`);
  }
});
