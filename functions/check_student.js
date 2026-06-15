const admin = require("firebase-admin");
admin.initializeApp();

async function check() {
  const db = admin.firestore();
  const sid = "XWRMH9";

  console.log("Checking student:", sid);

  const rootFeeDoc = await db.collection("student_fees").doc(sid).get();
  console.log("Root student_fees exists:", rootFeeDoc.exists);

  const nestedFeeDoc = await db.collection("students").doc(sid).collection("fee_ledger").doc("plan_details").get();
  console.log("Nested fee_ledger exists:", nestedFeeDoc.exists);

  const rootTx = await db.collection("transactions").where("studentId", "==", sid).get();
  console.log("Root transactions:", rootTx.size);

  const nestedTx = await db.collection("students").doc(sid).collection("transactions").get();
  console.log("Nested transactions:", nestedTx.size);

  const legacyTx = await db.collection("modules").doc("fees_accounting").collection("collections").where("studentId", "==", sid).get();
  console.log("Legacy collections:", legacyTx.size);

}

check();
