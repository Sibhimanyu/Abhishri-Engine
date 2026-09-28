const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

/**
 * Staff may add a mobile number to their account (frontend PhoneSignInSettings) and then
 * sign in with an SMS code. That is only allowed while they are non-admin staff: a texted
 * code is only as safe as the SIM (SIM swaps, recycled numbers), and admins hold fees,
 * accounting and permissions. So whenever a staff record changes, a linked number is
 * removed from anyone who is now an admin or no longer has a record at all.
 *
 * Works from the Auth account rather than the changed document, because one person can
 * have two records mid-migration (onUserCreated copies allowed_users/{email} to
 * allowed_users/{uid}, then deletes the email one) and the delete alone mustn't count as
 * "lost access". Accounts without an email are parents and are never touched.
 */
async function enforcePhoneSignIn(db, uid) {
  if (!uid) return 'skipped';
  let user;
  try {
    user = await admin.auth().getUser(uid);
  } catch (err) {
    if (err.code === 'auth/user-not-found') return 'skipped';
    throw err;
  }
  if (!user.phoneNumber || !user.email) return 'no-phone';

  const byUid = await db.collection('allowed_users').doc(uid).get();
  const record = byUid.exists
    ? byUid.data()
    : (await db.collection('allowed_users').doc(user.email.toLowerCase()).get()).data();
  const allowed = record && !(record.isAdmin === true || record.role === 'admin');
  if (allowed) return 'kept';

  await admin.auth().updateUser(uid, { phoneNumber: null });
  logger.info('Removed phone sign-in', { uid, email: user.email, reason: record ? 'admin' : 'no access' });
  return 'removed';
}

exports.enforcePhoneSignIn = enforcePhoneSignIn;
