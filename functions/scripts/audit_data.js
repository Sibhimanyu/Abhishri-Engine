const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function audit() {
  const collections = ['allowed_users', 'staff', 'students', 'transactions', 'expenses'];
  for (const col of collections) {
    console.log(\`--- Sample from \${col} ---\`);
    const snap = await db.collection(col).limit(2).get();
    snap.forEach(doc => {
      console.log(\`ID: \${doc.id}\`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  }
}

audit().catch(console.error);
