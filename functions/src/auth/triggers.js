const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// --- Sync allowed_users on first login ---
exports.onUserCreated = functions.region('us-central1').auth.user().onCreate(async (user) => {
  const db = admin.firestore();
  const email = user.email ? user.email.toLowerCase() : null;
  
  if (!email) return;

  // Check if admin pre-provisioned them by email
  const emailDocRef = db.collection('allowed_users').doc(email);
  const emailDoc = await emailDocRef.get();

  // `exists` is a boolean property on Admin SDK DocumentSnapshots, not a method — calling
  // it as `.exists()` throws a TypeError on every invocation, silently breaking permission
  // provisioning/custom-claims for every new signup.
  if (emailDoc.exists) {
    // Move the document to use their new UID
    const uidDocRef = db.collection('allowed_users').doc(user.uid);
    const userData = emailDoc.data();
    await uidDocRef.set({
      ...userData,
      id: user.uid,
      uidLinkedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Set custom claims if they have a role
    if (userData.permissionGroup || userData.isAdmin) {
      await admin.auth().setCustomUserClaims(user.uid, {
        role: userData.permissionGroup || 'staff',
        isAdmin: !!userData.isAdmin
      });
    }

    // Delete the old email-based document
    await emailDocRef.delete();
    console.log(`Linked user ${email} to UID ${user.uid} and set custom claims.`);
  }
});

// --- Cascade Delete when Auth user is deleted ---
exports.onUserDeleted = functions.region('us-central1').auth.user().onDelete(async (user) => {
  const db = admin.firestore();
  
  // Delete from allowed_users collection
  await db.collection('allowed_users').doc(user.uid).delete();
  
  console.log(`Cascaded deletion for user UID: ${user.uid}`);
});
