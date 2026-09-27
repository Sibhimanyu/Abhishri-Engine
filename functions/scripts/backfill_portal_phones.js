// One-off: fill students/{id}.portalPhones for records that haven't been edited since
// the parent portal shipped (syncStudentPortalPhones only runs on a write).
// Run from functions/: node scripts/backfill_portal_phones.js [--dry-run]
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function backfill() {
  const dryRun = process.argv.includes('--dry-run');
  const { portalPhonesFor } = await import('../src/shared/phone.mjs');
  const db = admin.firestore();
  const snap = await db.collection('students').get();
  let updated = 0;
  const noNumber = [];
  for (const doc of snap.docs) {
    const s = doc.data();
    const phones = portalPhonesFor(s);
    if (!phones.length) noNumber.push(`${doc.id} ${s.name || ''} (father: "${s.fatherPhone || ''}", mother: "${s.motherPhone || ''}")`);
    if (JSON.stringify(phones) === JSON.stringify(s.portalPhones || [])) continue;
    if (!dryRun) await doc.ref.update({ portalPhones: phones });
    updated++;
  }
  console.log(`${dryRun ? '[dry run] would update' : 'Updated'} ${updated} of ${snap.size} students.`);
  if (noNumber.length) {
    console.log(`\n${noNumber.length} students have no usable parent mobile number, so no parent can sign in for them:`);
    noNumber.forEach(line => console.log(`  ${line}`));
  }
}

backfill().catch(console.error);
