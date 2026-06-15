const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "abhishri-academy"
});
const db = admin.firestore();
db.collection('configs').doc('whatsapp_main').collection('templates').get().then(snap => {
  console.log(`Found ${snap.size} templates.`);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
