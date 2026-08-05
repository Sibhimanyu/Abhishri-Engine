const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const { mirrorUser } = require('../src/auth/permissionsMirror');

async function backfill() {
  const db = admin.firestore();
  const snap = await db.collection('allowed_users').get();
  console.log(`Mirroring ${snap.size} allowed_users docs into rtdb_permissions...`);
  for (const doc of snap.docs) {
    await mirrorUser(db, doc.id, doc.data());
    console.log(`  mirrored ${doc.id}`);
  }
  console.log('Done.');
}

backfill().catch(console.error);
