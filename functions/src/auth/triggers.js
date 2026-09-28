const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// allowed_users records stay keyed by email. There used to be an onUserCreated trigger
// here that moved allowed_users/{email} to allowed_users/{uid} for any new account with
// that email, verified or not; since anyone can create an unverified email/password
// account for any address, that handed a staff record (admin included) to whoever signed
// up with the address first. Access is resolved by email at read time instead, and only
// for verified emails (authEmail() in firestore.rules, verifiedEmail() in shared/access).

// --- Cascade Delete when Auth user is deleted ---
exports.onUserDeleted = functions.region('us-central1').auth.user().onDelete(async (user) => {
  const db = admin.firestore();
  
  // Delete from allowed_users collection
  await db.collection('allowed_users').doc(user.uid).delete();
  
  console.log(`Cascaded deletion for user UID: ${user.uid}`);
});
